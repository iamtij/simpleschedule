const express = require('express');
const router = express.Router();
const db = require('../db');
const {
    formatTime12,
    buildGoogleCalendarUrl,
    buildIcsCalendar,
    buildEventDetails,
    getClientSeriesPortalUrl
} = require('../utils/calendarLinks');
const { finalizeRecurringBookingAfterClientConfirm } = require('../utils/finalizeRecurringBooking');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FREQUENCY_LABELS = {
    weekly: 'Weekly',
    biweekly: 'Every 2 weeks',
    monthly: 'Monthly',
    custom: 'Custom dates'
};

async function loadSeriesByToken(token) {
    const result = await db.query(
        `SELECT rs.*,
                u.username, u.full_name, u.display_name, u.meeting_link, u.email AS host_email
         FROM recurring_series rs
         JOIN users u ON u.id = rs.user_id
         WHERE rs.client_confirmation_token = $1`,
        [token]
    );
    return result.rows[0] || null;
}

async function loadSeriesBookings(seriesId) {
    const result = await db.query(
        `SELECT id, date::text AS date, start_time::text AS start_time, end_time::text AS end_time,
                status, occurrence_index, notes, client_confirmed_at
         FROM bookings
         WHERE recurring_series_id = $1
         ORDER BY date ASC, start_time ASC`,
        [seriesId]
    );
    return result.rows;
}

function formatSeriesDate(dateStr) {
    const [y, mo, d] = dateStr.split('-').map(Number);
    return new Date(y, mo - 1, d).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });
}

function enrichBookingForView(booking, series, host) {
    const hostName = host.display_name || host.full_name || host.username;
    const title = `Meeting with ${hostName}`;
    const details = buildEventDetails({
        hostName,
        meetingLink: host.meeting_link,
        notes: booking.notes || series.notes,
        clientName: series.client_name
    });
    const confirmed =
        booking.status === 'confirmed' && !!booking.client_confirmed_at;
    return {
        ...booking,
        client_confirmed: confirmed,
        client_confirmed_at_formatted: booking.client_confirmed_at
            ? new Date(booking.client_confirmed_at).toLocaleString()
            : null,
        formatted_date: formatSeriesDate(booking.date),
        formatted_start_time: formatTime12(booking.start_time),
        formatted_end_time: formatTime12(booking.end_time),
        google_calendar_url: buildGoogleCalendarUrl({
            title,
            date: booking.date,
            startTime: booking.start_time,
            endTime: booking.end_time,
            details,
            location: host.meeting_link || undefined
        }),
        ics_url: `/schedule/series/${series.client_confirmation_token}/bookings/${booking.id}/calendar.ics`
    };
}

function isBookingConfirmedForCalendar(booking) {
    return booking.status === 'confirmed' && !!booking.client_confirmed_at;
}

function buildIcsEventsForBookings(bookings, series, host) {
    const hostName = host.display_name || host.full_name || host.username;
    return bookings
        .filter((b) => b.status !== 'cancelled' && isBookingConfirmedForCalendar(b))
        .map((b) => {
            const details = buildEventDetails({
                hostName,
                meetingLink: host.meeting_link,
                notes: b.notes || series.notes,
                clientName: series.client_name
            });
            return {
                uid: `isked-booking-${b.id}@isked.app`,
                title: `Meeting with ${hostName}`,
                date: b.date,
                startTime: b.start_time,
                endTime: b.end_time,
                description: details,
                location: host.meeting_link || undefined
            };
        });
}

router.get('/series/:token', async (req, res) => {
    try {
        const { token } = req.params;
        if (!UUID_REGEX.test(token)) {
            return res.status(404).render('error', {
                message: 'This schedule link is invalid.',
                title: 'Link Not Found',
                showHomeLink: false
            });
        }

        const series = await loadSeriesByToken(token);
        if (!series) {
            return res.status(404).render('error', {
                message: 'This schedule link was not found or has expired.',
                title: 'Schedule Not Found',
                showHomeLink: false
            });
        }

        const host = {
            username: series.username,
            full_name: series.full_name,
            display_name: series.display_name,
            meeting_link: series.meeting_link,
            email: series.host_email
        };
        host.name = host.display_name || host.full_name || host.username;

        const rawBookings = await loadSeriesBookings(series.id);
        const today = new Date().toISOString().split('T')[0];
        const bookings = rawBookings.map((b) => enrichBookingForView(b, series, host));
        const activeBookings = bookings.filter((b) => b.status !== 'cancelled');
        const activeCount = activeBookings.length;
        const confirmedCount = activeBookings.filter((b) => b.client_confirmed).length;
        const hasConfirmedMeetings = confirmedCount > 0;
        const pendingCount = activeCount - confirmedCount;

        if (series.start_date instanceof Date) {
            series.start_date = series.start_date.toISOString().split('T')[0];
        }

        res.render('client-series-confirmation', {
            series: {
                ...series,
                frequency_label: FREQUENCY_LABELS[series.frequency] || series.frequency,
                confirmed_count: confirmedCount,
                pending_count: pendingCount
            },
            host,
            bookings,
            activeCount,
            today,
            all_ics_url: hasConfirmedMeetings ? `/schedule/series/${token}/calendar.ics` : null,
            portal_url: getClientSeriesPortalUrl(token, req)
        });
    } catch (error) {
        console.error('client series portal error:', error);
        res.status(500).render('error', { message: 'Unable to load schedule', showHomeLink: false });
    }
});

router.post('/series/:token/bookings/:bookingId/confirm', async (req, res) => {
    try {
        const { token, bookingId } = req.params;
        if (!UUID_REGEX.test(token)) {
            return res.status(404).json({ error: 'Invalid link' });
        }

        const series = await loadSeriesByToken(token);
        if (!series || series.status === 'cancelled') {
            return res.status(404).json({ error: 'Schedule not found' });
        }

        const outcome = await finalizeRecurringBookingAfterClientConfirm(
            parseInt(bookingId, 10),
            series.id
        );

        if (outcome.error) {
            return res.status(outcome.status || 400).json({
                error: outcome.error,
                conflictType: outcome.conflictType
            });
        }

        res.json({
            success: true,
            already_confirmed: outcome.alreadyConfirmed,
            confirmed_at: outcome.confirmed_at
        });
    } catch (error) {
        console.error('client booking confirm error:', error);
        res.status(500).json({ error: 'Failed to confirm meeting' });
    }
});

router.get('/series/:token/calendar.ics', async (req, res) => {
    try {
        const { token } = req.params;
        if (!UUID_REGEX.test(token)) {
            return res.status(404).send('Not found');
        }

        const series = await loadSeriesByToken(token);
        if (!series) {
            return res.status(404).send('Not found');
        }

        const host = {
            username: series.username,
            full_name: series.full_name,
            display_name: series.display_name,
            meeting_link: series.meeting_link
        };
        const bookings = await loadSeriesBookings(series.id);
        const events = buildIcsEventsForBookings(bookings, series, host);

        if (events.length === 0) {
            return res.status(404).send('No active meetings');
        }

        const ics = buildIcsCalendar(events);
        const filename = `meetings-${series.client_name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`;
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(ics);
    } catch (error) {
        console.error('series ics error:', error);
        res.status(500).send('Error generating calendar file');
    }
});

router.get('/series/:token/bookings/:bookingId/calendar.ics', async (req, res) => {
    try {
        const { token, bookingId } = req.params;
        if (!UUID_REGEX.test(token)) {
            return res.status(404).send('Not found');
        }

        const series = await loadSeriesByToken(token);
        if (!series) {
            return res.status(404).send('Not found');
        }

        const bookingResult = await db.query(
            `SELECT id, date::text AS date, start_time::text AS start_time, end_time::text AS end_time,
                    status, notes, client_confirmed_at
             FROM bookings
             WHERE id = $1 AND recurring_series_id = $2`,
            [bookingId, series.id]
        );

        const booking = bookingResult.rows[0];
        if (
            !booking ||
            booking.status === 'cancelled' ||
            !isBookingConfirmedForCalendar(booking)
        ) {
            return res.status(404).send('Not found');
        }

        const host = {
            username: series.username,
            full_name: series.full_name,
            display_name: series.display_name,
            meeting_link: series.meeting_link
        };
        const events = buildIcsEventsForBookings([booking], series, host);
        const ics = buildIcsCalendar(events);
        const filename = `meeting-${booking.date}.ics`;
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(ics);
    } catch (error) {
        console.error('booking ics error:', error);
        res.status(500).send('Error generating calendar file');
    }
});

module.exports = router;
