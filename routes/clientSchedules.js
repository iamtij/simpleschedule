const express = require('express');
const router = express.Router();
const db = require('../db');
const { checkUserAccess } = require('../utils/subscription');
const { isRecurringClientsEnabled } = require('../utils/recurringClients');
const {
    generateOccurrenceDates,
    clampOccurrenceCount,
    VALID_FREQUENCIES
} = require('../utils/recurringOccurrences');
const { validateBookingSlot } = require('../utils/bookingValidation');
const { syncBookingToGoogleCalendar } = require('../utils/bookingGoogleSync');
const { getSlotsForUser } = require('./booking');
const timezone = require('../utils/timezone');
const mailService = require('../services/mail');

const requireLogin = (req, res, next) => {
    if (!req.session.userId) {
        return res.redirect('/auth/login');
    }
    next();
};

async function requireRecurringClientsFeature(req, res, next) {
    const enabled = await isRecurringClientsEnabled(req.session.userId);
    if (!enabled) {
        if (req.accepts('html')) {
            const userResult = await db.query(
                'SELECT id, email, username, full_name, display_name FROM users WHERE id = $1',
                [req.session.userId]
            );
            return res.status(403).render('client-schedules-disabled', {
                user: userResult.rows[0] || { username: 'User' }
            });
        }
        return res.status(403).json({ error: 'Recurring client schedules are not enabled for your account' });
    }
    next();
}

function formatTime12(time) {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
}

async function loadHost(userId) {
    const result = await db.query(
        `SELECT id, full_name, display_name, username, email, meeting_link, timezone,
                google_calendar_blocking_enabled, buffer_minutes
         FROM users WHERE id = $1`,
        [userId]
    );
    return result.rows[0] || null;
}

async function validateSeriesPayload(userId, body) {
    const {
        contact_id,
        client_name,
        client_email,
        client_phone,
        start_date,
        start_time,
        end_time,
        frequency,
        total_occurrences,
        notes
    } = body;

    if (!start_date || !start_time || !end_time || !frequency) {
        return { error: 'Missing required fields', status: 400 };
    }
    if (!VALID_FREQUENCIES.includes(frequency)) {
        return { error: 'Invalid frequency', status: 400 };
    }

    const count = clampOccurrenceCount(total_occurrences);
    if (!count) {
        return { error: 'total_occurrences must be between 2 and 52', status: 400 };
    }

    let name = client_name?.trim();
    let email = client_email?.trim();
    let phone = client_phone?.trim() || null;
    let contactId = contact_id ? parseInt(contact_id, 10) : null;

    if (contactId) {
        const contactResult = await db.query(
            'SELECT id, name, email, phone FROM contacts WHERE id = $1 AND user_id = $2',
            [contactId, userId]
        );
        if (contactResult.rows.length === 0) {
            return { error: 'Contact not found', status: 404 };
        }
        const c = contactResult.rows[0];
        name = name || c.name;
        email = email || c.email;
        phone = phone || c.phone;
    }

    if (!name || !email) {
        return { error: 'Client name and email are required', status: 400 };
    }

    const host = await loadHost(userId);
    if (!host) {
        return { error: 'User not found', status: 404 };
    }

    let dates;
    try {
        dates = generateOccurrenceDates(start_date, frequency, count);
    } catch (e) {
        return { error: e.message, status: 400 };
    }

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (dates[0] < todayStr) {
        return { error: 'Start date cannot be in the past', status: 400 };
    }

    const durationMinutes =
        (parseInt(end_time.split(':')[0], 10) * 60 + parseInt(end_time.split(':')[1], 10)) -
        (parseInt(start_time.split(':')[0], 10) * 60 + parseInt(start_time.split(':')[1], 10));

    return {
        host,
        contactId,
        client_name: name,
        client_email: email,
        client_phone: phone,
        start_date,
        start_time,
        end_time,
        frequency,
        total_occurrences: count,
        notes: notes || null,
        dates,
        durationMinutes
    };
}

async function checkDatesForConflicts(userId, dates, start_time, end_time, host) {
    const conflicts = [];
    const googleBlocking = host.google_calendar_blocking_enabled !== false;

    for (const date of dates) {
        const result = await validateBookingSlot(userId, date, start_time, end_time, {
            googleCalendarBlockingEnabled: googleBlocking
        });
        if (!result.ok) {
            conflicts.push({ date, reason: result.reason, conflictType: result.conflictType });
        }
    }
    return conflicts;
}

router.use(requireLogin, requireRecurringClientsFeature);

router.get('/', async (req, res) => {
    try {
        const user = await loadHost(req.session.userId);
        const subscriptionStatus = await checkUserAccess(req.session.userId);
        user.subscriptionStatus = subscriptionStatus;
        res.render('client-schedules', { user, currentPage: 'client-schedules' });
    } catch {
        res.status(500).render('error', { message: 'Failed to load client schedules' });
    }
});

router.get('/new', async (req, res) => {
    try {
        const user = await loadHost(req.session.userId);
        const subscriptionStatus = await checkUserAccess(req.session.userId);
        user.subscriptionStatus = subscriptionStatus;

        let contact = null;
        const contactId = req.query.contact_id;
        if (contactId) {
            const contactResult = await db.query(
                'SELECT id, name, email, phone FROM contacts WHERE id = $1 AND user_id = $2',
                [contactId, req.session.userId]
            );
            contact = contactResult.rows[0] || null;
        }

        const durationsResult = await db.query(
            `SELECT duration_minutes FROM meeting_durations
             WHERE user_id = $1 AND is_active = true
             ORDER BY COALESCE(display_order, 0) ASC, duration_minutes ASC`,
            [req.session.userId]
        );
        const durations = durationsResult.rows.map((r) => r.duration_minutes);
        const defaultDuration = durations[0] || 60;

        res.render('client-schedule-new', {
            user,
            contact,
            durations,
            defaultDuration,
            currentPage: 'client-schedules'
        });
    } catch {
        res.status(500).render('error', { message: 'Failed to load form' });
    }
});

router.get('/slots', async (req, res) => {
    try {
        const { date, duration: durationParam } = req.query;
        if (!date) {
            return res.status(400).json({ error: 'Date is required' });
        }

        const host = await loadHost(req.session.userId);
        let duration = parseInt(durationParam, 10);
        if (isNaN(duration) || duration <= 0) {
            const dr = await db.query(
                `SELECT duration_minutes FROM meeting_durations
                 WHERE user_id = $1 AND is_active = true
                 ORDER BY COALESCE(display_order, 0) ASC LIMIT 1`,
                [req.session.userId]
            );
            duration = dr.rows[0]?.duration_minutes || 60;
        }

        const userTimezone = timezone.getUserTimezone(host.timezone);
        const clientTimezone = req.query.timezone || userTimezone;
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: clientTimezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        const parts = formatter.formatToParts(now);
        const nowInClientTimezone = {
            year: parseInt(parts.find((p) => p.type === 'year').value, 10),
            month: parseInt(parts.find((p) => p.type === 'month').value, 10),
            day: parseInt(parts.find((p) => p.type === 'day').value, 10),
            hour: parseInt(parts.find((p) => p.type === 'hour').value, 10),
            minute: parseInt(parts.find((p) => p.type === 'minute').value, 10)
        };
        const todayDate = `${nowInClientTimezone.year}-${String(nowInClientTimezone.month).padStart(2, '0')}-${String(nowInClientTimezone.day).padStart(2, '0')}`;

        if (date < todayDate) {
            return res.json({ slots: [] });
        }

        const { slots } = await getSlotsForUser(
            req.session.userId,
            date,
            duration,
            host.buffer_minutes ?? null,
            clientTimezone,
            nowInClientTimezone,
            todayDate
        );
        res.json({ slots, duration });
    } catch {
        res.json({ slots: [] });
    }
});

router.get('/api', async (req, res) => {
    try {
        const seriesResult = await db.query(
            `SELECT rs.*,
                    (SELECT COUNT(*)::int FROM bookings b
                     WHERE b.recurring_series_id = rs.id AND b.status != 'cancelled'
                     AND b.date >= CURRENT_DATE) AS upcoming_count,
                    (SELECT MIN(b.date) FROM bookings b
                     WHERE b.recurring_series_id = rs.id AND b.status != 'cancelled'
                     AND b.date >= CURRENT_DATE) AS next_date
             FROM recurring_series rs
             WHERE rs.user_id = $1
             ORDER BY rs.status ASC, rs.created_at DESC`,
            [req.session.userId]
        );

        const seriesIds = seriesResult.rows.map((s) => s.id);
        let bookingsBySeries = {};
        if (seriesIds.length > 0) {
            const bookingsResult = await db.query(
                `SELECT id, recurring_series_id, date::text AS date, start_time::text AS start_time,
                        end_time::text AS end_time, status, occurrence_index, client_name
                 FROM bookings
                 WHERE recurring_series_id = ANY($1::int[])
                 ORDER BY date ASC, start_time ASC`,
                [seriesIds]
            );
            for (const b of bookingsResult.rows) {
                if (!bookingsBySeries[b.recurring_series_id]) {
                    bookingsBySeries[b.recurring_series_id] = [];
                }
                bookingsBySeries[b.recurring_series_id].push(b);
            }
        }

        const today = new Date().toISOString().split('T')[0];
        const series = seriesResult.rows.map((s) => {
            const bookings = bookingsBySeries[s.id] || [];
            const completed = bookings.filter(
                (b) => b.status !== 'cancelled' && b.date < today
            ).length;
            const totalActive = bookings.filter((b) => b.status !== 'cancelled').length;
            return {
                ...s,
                start_date: s.start_date instanceof Date
                    ? s.start_date.toISOString().split('T')[0]
                    : s.start_date,
                bookings,
                completed_count: completed,
                active_count: totalActive
            };
        });

        res.json({ success: true, series });
    } catch (error) {
        console.error('client-schedules api error:', error);
        res.status(500).json({ error: 'Failed to load schedules' });
    }
});

router.post('/preview', async (req, res) => {
    try {
        const accessCheck = await checkUserAccess(req.session.userId);
        if (!accessCheck.hasAccess) {
            return res.status(403).json({ error: 'Subscription required', code: 'SUBSCRIPTION_REQUIRED' });
        }

        const parsed = await validateSeriesPayload(req.session.userId, req.body);
        if (parsed.error) {
            return res.status(parsed.status).json({ error: parsed.error });
        }

        const conflicts = await checkDatesForConflicts(
            req.session.userId,
            parsed.dates,
            parsed.start_time,
            parsed.end_time,
            parsed.host
        );
        const conflictDates = new Set(conflicts.map((c) => c.date));

        const preview = parsed.dates.map((date, index) => ({
            date,
            occurrence_index: index + 1,
            available: !conflictDates.has(date),
            reason: conflicts.find((c) => c.date === date)?.reason || null
        }));

        res.json({
            success: true,
            dates: preview,
            has_conflicts: conflicts.length > 0,
            conflicts
        });
    } catch (error) {
        console.error('preview error:', error);
        res.status(500).json({ error: 'Preview failed' });
    }
});

router.post('/', async (req, res) => {
    const client = await db.pool.connect();
    try {
        const accessCheck = await checkUserAccess(req.session.userId);
        if (!accessCheck.hasAccess) {
            return res.status(403).json({ error: 'Subscription required', code: 'SUBSCRIPTION_REQUIRED' });
        }

        const parsed = await validateSeriesPayload(req.session.userId, req.body);
        if (parsed.error) {
            return res.status(parsed.status).json({ error: parsed.error });
        }

        const conflicts = await checkDatesForConflicts(
            req.session.userId,
            parsed.dates,
            parsed.start_time,
            parsed.end_time,
            parsed.host
        );
        if (conflicts.length > 0) {
            return res.status(409).json({
                error: 'Some dates have conflicts',
                conflicts
            });
        }

        await client.query('BEGIN');

        const seriesResult = await client.query(
            `INSERT INTO recurring_series (
                user_id, contact_id, client_name, client_email, client_phone,
                start_date, start_time, end_time, frequency, total_occurrences,
                duration_minutes, notes, status
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'active')
            RETURNING *`,
            [
                req.session.userId,
                parsed.contactId,
                parsed.client_name,
                parsed.client_email,
                parsed.client_phone,
                parsed.start_date,
                parsed.start_time,
                parsed.end_time,
                parsed.frequency,
                parsed.total_occurrences,
                parsed.durationMinutes,
                parsed.notes
            ]
        );
        const series = seriesResult.rows[0];
        const createdBookings = [];

        for (let i = 0; i < parsed.dates.length; i++) {
            const date = parsed.dates[i];
            const bookingResult = await client.query(
                `INSERT INTO bookings (
                    user_id, date, start_time, end_time, client_name, client_email,
                    client_phone, notes, status, recurring_series_id, occurrence_index
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'confirmed',$9,$10)
                RETURNING id, confirmation_uuid, date::text, start_time::text, end_time::text,
                          client_name, client_email, client_phone, notes, occurrence_index`,
                [
                    req.session.userId,
                    date,
                    parsed.start_time,
                    parsed.end_time,
                    parsed.client_name,
                    parsed.client_email,
                    parsed.client_phone,
                    parsed.notes,
                    series.id,
                    i + 1
                ]
            );
            const booking = bookingResult.rows[0];
            booking.formatted_start_time = formatTime12(booking.start_time);
            booking.formatted_end_time = formatTime12(booking.end_time);
            createdBookings.push(booking);
        }

        await client.query('COMMIT');

        const host = parsed.host;
        host.name = host.display_name || host.full_name || host.username;

        setImmediate(async () => {
            for (const booking of createdBookings) {
                await syncBookingToGoogleCalendar(req.session.userId, booking, host);
                try {
                    const userTimezone = timezone.getUserTimezone(host.timezone);
                    await mailService.scheduleClientReminder1Hour(booking, host, userTimezone);
                } catch {
                    // ignore reminder schedule failures
                }
            }
            try {
                await mailService.sendRecurringSeriesClientConfirmation(
                    { ...series, frequency: parsed.frequency },
                    createdBookings,
                    host
                );
                await mailService.sendRecurringSeriesHostNotification(
                    { ...series, frequency: parsed.frequency },
                    createdBookings,
                    host
                );
            } catch (err) {
                console.error('Series email error:', err);
            }
        });

        res.json({
            success: true,
            series_id: series.id,
            bookings_created: createdBookings.length
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('create series error:', error);
        res.status(500).json({ error: 'Failed to create schedule' });
    } finally {
        client.release();
    }
});

router.patch('/:seriesId/cancel', async (req, res) => {
    try {
        const seriesId = parseInt(req.params.seriesId, 10);
        const seriesResult = await db.query(
            'SELECT id FROM recurring_series WHERE id = $1 AND user_id = $2',
            [seriesId, req.session.userId]
        );
        if (seriesResult.rows.length === 0) {
            return res.status(404).json({ error: 'Series not found' });
        }

        await db.query(
            `UPDATE recurring_series SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [seriesId]
        );
        await db.query(
            `UPDATE bookings SET status = 'cancelled'
             WHERE recurring_series_id = $1 AND user_id = $2 AND date >= CURRENT_DATE AND status != 'cancelled'`,
            [seriesId, req.session.userId]
        );

        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'Failed to cancel series' });
    }
});

router.delete('/:seriesId/occurrences/:bookingId', async (req, res) => {
    try {
        const seriesId = parseInt(req.params.seriesId, 10);
        const bookingId = parseInt(req.params.bookingId, 10);

        const result = await db.query(
            `UPDATE bookings SET status = 'cancelled'
             WHERE id = $1 AND recurring_series_id = $2 AND user_id = $3
             AND date >= CURRENT_DATE AND status != 'cancelled'
             RETURNING id`,
            [bookingId, seriesId, req.session.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Occurrence not found or cannot be cancelled' });
        }

        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'Failed to cancel occurrence' });
    }
});

module.exports = router;
