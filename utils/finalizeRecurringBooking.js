const db = require('../db');
const { validateBookingSlot } = require('./bookingValidation');
const { syncBookingToGoogleCalendar } = require('./bookingGoogleSync');
const timezone = require('./timezone');
const mailService = require('../services/mail');

function formatTime12(time) {
    if (!time) return '';
    const [hoursStr, minutes = '00'] = String(time).split(':');
    const hours = parseInt(hoursStr, 10);
    if (Number.isNaN(hours)) return time;
    const suffix = hours >= 12 ? 'PM' : 'AM';
    const hour12 = ((hours + 11) % 12) + 1;
    return `${hour12}:${minutes.padStart(2, '0')} ${suffix}`;
}

function getHostBufferMinutes(host) {
    const n = parseInt(host.buffer_minutes, 10);
    return Number.isNaN(n) ? 15 : n;
}

/**
 * After client confirms a recurring-series meeting: validate, mark confirmed,
 * sync calendar, schedule reminders, notify host and client.
 */
async function finalizeRecurringBookingAfterClientConfirm(bookingId, seriesId) {
    const rowResult = await db.query(
        `SELECT b.*,
                b.date::text AS date_text,
                b.start_time::text AS start_time_text,
                b.end_time::text AS end_time_text,
                rs.client_name AS series_client_name,
                rs.client_email AS series_client_email,
                rs.notes AS series_notes,
                rs.status AS series_status,
                rs.frequency,
                u.id AS host_user_id,
                u.full_name, u.display_name, u.username, u.email AS host_email,
                u.meeting_link, u.timezone, u.google_calendar_blocking_enabled,
                u.buffer_minutes
         FROM bookings b
         JOIN recurring_series rs ON rs.id = b.recurring_series_id
         JOIN users u ON u.id = b.user_id
         WHERE b.id = $1 AND b.recurring_series_id = $2`,
        [bookingId, seriesId]
    );

    if (rowResult.rows.length === 0) {
        return { error: 'Meeting not found', status: 404 };
    }

    const row = rowResult.rows[0];

    if (row.series_status === 'cancelled') {
        return { error: 'This schedule was cancelled', status: 400 };
    }
    if (row.status === 'cancelled') {
        return { error: 'This meeting was cancelled', status: 400 };
    }

    const alreadyConfirmed = !!row.client_confirmed_at && row.status === 'confirmed';

    const booking = {
        id: row.id,
        date: row.date_text,
        start_time: row.start_time_text?.slice(0, 5) || row.start_time_text,
        end_time: row.end_time_text?.slice(0, 5) || row.end_time_text,
        client_name: row.client_name,
        client_email: row.client_email,
        client_phone: row.client_phone,
        notes: row.notes || row.series_notes,
        occurrence_index: row.occurrence_index,
        google_event_id: row.google_event_id
    };

    const host = {
        id: row.host_user_id,
        full_name: row.full_name,
        display_name: row.display_name,
        username: row.username,
        email: row.host_email,
        meeting_link: row.meeting_link,
        timezone: row.timezone,
        google_calendar_blocking_enabled: row.google_calendar_blocking_enabled,
        buffer_minutes: row.buffer_minutes,
        name: row.display_name || row.full_name || row.username
    };

    if (!alreadyConfirmed) {
        const today = new Date().toISOString().split('T')[0];
        if (booking.date < today) {
            return { error: 'Cannot confirm a meeting in the past', status: 400 };
        }

        const slotCheck = await validateBookingSlot(
            row.host_user_id,
            booking.date,
            booking.start_time,
            booking.end_time,
            {
                googleCalendarBlockingEnabled: host.google_calendar_blocking_enabled !== false,
                excludeBookingId: bookingId,
                excludeGoogleEventId: row.google_event_id || null,
                bufferMinutes: getHostBufferMinutes(host)
            }
        );

        if (!slotCheck.ok) {
            return {
                error: slotCheck.reason,
                status: 409,
                conflictType: slotCheck.conflictType
            };
        }

        await db.query(
            `UPDATE bookings
             SET status = 'confirmed',
                 client_confirmed_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [bookingId]
        );
    }

    booking.formatted_start_time = formatTime12(booking.start_time);
    booking.formatted_end_time = formatTime12(booking.end_time);

    if (!alreadyConfirmed) {
        await syncBookingToGoogleCalendar(row.host_user_id, booking, host);

        try {
            const userTimezone = timezone.getUserTimezone(host.timezone);
            await mailService.scheduleClientReminder1Hour(booking, host, userTimezone);
            await mailService.scheduleClientReminder30Min(booking, host, userTimezone);
        } catch {
            // ignore reminder scheduling failures
        }

        try {
            await mailService.sendClientConfirmation(booking, host);
            await mailService.sendHostNotification(booking, host);
        } catch (err) {
            console.error('finalize recurring booking email error:', err);
        }
    }

    const confirmedResult = await db.query(
        'SELECT client_confirmed_at FROM bookings WHERE id = $1',
        [bookingId]
    );

    return {
        success: true,
        alreadyConfirmed,
        confirmed_at: confirmedResult.rows[0]?.client_confirmed_at,
        booking
    };
}

module.exports = {
    finalizeRecurringBookingAfterClientConfirm,
    formatTime12
};
