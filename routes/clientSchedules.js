const express = require('express');
const router = express.Router();
const db = require('../db');
const { checkUserAccess } = require('../utils/subscription');
const { isRecurringClientsEnabled } = require('../utils/recurringClients');
const {
    generateOccurrenceDates,
    clampOccurrenceCount,
    parseCustomOccurrences,
    timeToMinutes,
    minutesToTime,
    VALID_FREQUENCIES
} = require('../utils/recurringOccurrences');
const { validateBookingSlot } = require('../utils/bookingValidation');
const { getSlotsForUser } = require('./booking');
const timezone = require('../utils/timezone');
const mailService = require('../services/mail');
const { getClientSeriesPortalUrl } = require('../utils/calendarLinks');

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

const MIN_MEETING_DURATION = 5;
const MAX_MEETING_DURATION = 480;

function clampMeetingDurationMinutes(value) {
    const n = parseInt(value, 10);
    if (Number.isNaN(n) || n < MIN_MEETING_DURATION || n > MAX_MEETING_DURATION) {
        return null;
    }
    return n;
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
        custom_occurrences,
        notes,
        duration_minutes: durationFromBody
    } = body;

    if (!frequency || !VALID_FREQUENCIES.includes(frequency)) {
        return { error: 'Invalid frequency', status: 400 };
    }

    let durationMinutes = clampMeetingDurationMinutes(durationFromBody);
    if (!durationMinutes) {
        return {
            error: `Meeting duration must be between ${MIN_MEETING_DURATION} and ${MAX_MEETING_DURATION} minutes`,
            status: 400
        };
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

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    let occurrences;
    let seriesStartDate;
    let seriesStartTime;
    let seriesEndTime;
    let count;

    if (frequency === 'custom') {
        try {
            const parsed = parseCustomOccurrences(custom_occurrences, durationMinutes);
            occurrences = parsed.occurrences;
        } catch (e) {
            return { error: e.message, status: 400 };
        }
        count = occurrences.length;
        seriesStartDate = occurrences[0].date;
        seriesStartTime = occurrences[0].start_time;
        seriesEndTime = occurrences[0].end_time;
        durationMinutes = timeToMinutes(seriesEndTime) - timeToMinutes(seriesStartTime);
    } else {
        if (!start_date || !start_time || !end_time) {
            return { error: 'Missing required fields', status: 400 };
        }
        count = clampOccurrenceCount(total_occurrences);
        if (!count) {
            return { error: 'total_occurrences must be between 2 and 52', status: 400 };
        }
        let dates;
        try {
            dates = generateOccurrenceDates(start_date, frequency, count);
        } catch (e) {
            return { error: e.message, status: 400 };
        }
        if (dates[0] < todayStr) {
            return { error: 'Start date cannot be in the past', status: 400 };
        }
        seriesStartDate = start_date;
        seriesStartTime = start_time.length > 5 ? start_time.slice(0, 5) : start_time;
        seriesEndTime = end_time.length > 5 ? end_time.slice(0, 5) : end_time;
        durationMinutes =
            timeToMinutes(seriesEndTime) - timeToMinutes(seriesStartTime);
        occurrences = dates.map((date) => ({
            date,
            start_time: seriesStartTime,
            end_time: seriesEndTime
        }));
    }

    if (occurrences[0].date < todayStr) {
        return { error: 'Meeting dates cannot be in the past', status: 400 };
    }

    return {
        host,
        contactId,
        client_name: name,
        client_email: email,
        client_phone: phone,
        start_date: seriesStartDate,
        start_time: seriesStartTime,
        end_time: seriesEndTime,
        frequency,
        total_occurrences: count,
        notes: notes || null,
        occurrences,
        durationMinutes
    };
}

function getHostBufferMinutes(host) {
    const n = parseInt(host.buffer_minutes, 10);
    return Number.isNaN(n) ? 15 : n;
}

async function checkOccurrencesForConflicts(userId, occurrences, host, options = {}) {
    const conflicts = [];
    const googleBlocking = host.google_calendar_blocking_enabled !== false;
    const bufferMinutes = options.bufferMinutes ?? getHostBufferMinutes(host);

    for (const occ of occurrences) {
        const result = await validateBookingSlot(userId, occ.date, occ.start_time, occ.end_time, {
            googleCalendarBlockingEnabled: googleBlocking,
            excludeBookingId: options.excludeBookingId || null,
            excludeGoogleEventId: options.excludeGoogleEventId || null,
            bufferMinutes
        });
        if (!result.ok) {
            conflicts.push({
                date: occ.date,
                start_time: occ.start_time,
                reason: result.reason,
                conflictType: result.conflictType
            });
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

        res.render('client-schedule-new', {
            user,
            contact,
            currentPage: 'client-schedules'
        });
    } catch {
        res.status(500).render('error', { message: 'Failed to load form' });
    }
});

router.post('/check-occurrence', async (req, res) => {
    try {
        const accessCheck = await checkUserAccess(req.session.userId);
        if (!accessCheck.hasAccess) {
            return res.status(403).json({ error: 'Subscription required', code: 'SUBSCRIPTION_REQUIRED' });
        }

        const {
            date,
            start_time,
            end_time,
            duration_minutes,
            exclude_booking_id
        } = req.body;

        if (!date || !start_time) {
            return res.status(400).json({ error: 'Date and start time are required' });
        }

        const host = await loadHost(req.session.userId);
        if (!host) {
            return res.status(404).json({ error: 'User not found' });
        }

        const startNorm = start_time.length > 5 ? start_time.slice(0, 5) : start_time;
        let endNorm = end_time ? (end_time.length > 5 ? end_time.slice(0, 5) : end_time) : null;
        const duration =
            clampMeetingDurationMinutes(duration_minutes) ||
            (endNorm ? timeToMinutes(endNorm) - timeToMinutes(startNorm) : null) ||
            60;

        if (!duration || duration < MIN_MEETING_DURATION) {
            return res.status(400).json({ error: 'Invalid meeting duration' });
        }

        if (!endNorm) {
            endNorm = minutesToTime(timeToMinutes(startNorm) + duration);
        }

        let excludeGoogleEventId = null;
        const excludeBookingId = exclude_booking_id ? parseInt(exclude_booking_id, 10) : null;
        if (excludeBookingId) {
            const existing = await db.query(
                'SELECT google_event_id FROM bookings WHERE id = $1 AND user_id = $2',
                [excludeBookingId, req.session.userId]
            );
            excludeGoogleEventId = existing.rows[0]?.google_event_id || null;
        }

        const slotCheck = await validateBookingSlot(
            req.session.userId,
            date,
            startNorm,
            endNorm,
            {
                googleCalendarBlockingEnabled: host.google_calendar_blocking_enabled !== false,
                excludeBookingId,
                excludeGoogleEventId,
                bufferMinutes: getHostBufferMinutes(host)
            }
        );

        if (!slotCheck.ok) {
            return res.status(409).json({
                ok: false,
                error: slotCheck.reason,
                conflictType: slotCheck.conflictType
            });
        }

        res.json({ ok: true, start_time: startNorm, end_time: endNorm });
    } catch (error) {
        console.error('check-occurrence error:', error);
        res.status(500).json({ error: 'Failed to check availability' });
    }
});

router.get('/slots', async (req, res) => {
    try {
        const { date, duration: durationParam } = req.query;
        if (!date) {
            return res.status(400).json({ error: 'Date is required' });
        }

        const host = await loadHost(req.session.userId);
        let duration = clampMeetingDurationMinutes(durationParam);
        if (!duration) {
            duration = 60;
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
                        end_time::text AS end_time, status, occurrence_index, client_name,
                        client_confirmed_at
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
            const upcomingActive = bookings.filter(
                (b) => b.status !== 'cancelled' && b.date >= today
            );
            const clientConfirmedCount = upcomingActive.filter((b) => b.client_confirmed_at).length;
            const token = s.client_confirmation_token;
            return {
                ...s,
                start_date: s.start_date instanceof Date
                    ? s.start_date.toISOString().split('T')[0]
                    : s.start_date,
                duration_minutes: s.duration_minutes || 60,
                bookings: bookings.map((b) => ({
                    ...b,
                    client_confirmed: !!b.client_confirmed_at
                })),
                completed_count: completed,
                active_count: totalActive,
                client_portal_url: token ? getClientSeriesPortalUrl(token, req) : null,
                client_confirmed_count: clientConfirmedCount,
                client_pending_count: upcomingActive.length - clientConfirmedCount,
                client_all_confirmed: upcomingActive.length > 0 && clientConfirmedCount === upcomingActive.length
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

        const conflicts = await checkOccurrencesForConflicts(
            req.session.userId,
            parsed.occurrences,
            parsed.host
        );
        const conflictKeys = new Set(
            conflicts.map((c) => `${c.date}|${c.start_time}`)
        );

        const preview = parsed.occurrences.map((occ, index) => {
            const key = `${occ.date}|${occ.start_time}`;
            const conflict = conflicts.find(
                (c) => c.date === occ.date && c.start_time === occ.start_time
            );
            return {
                date: occ.date,
                start_time: occ.start_time,
                end_time: occ.end_time,
                occurrence_index: index + 1,
                available: !conflictKeys.has(key),
                reason: conflict?.reason || null
            };
        });

        res.json({
            success: true,
            dates: preview,
            has_conflicts: conflicts.length > 0,
            conflicts
        });
    } catch (error) {
        console.error('preview error:', error);
        res.status(500).json({
            error: error.message || 'Preview failed'
        });
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

        const conflicts = await checkOccurrencesForConflicts(
            req.session.userId,
            parsed.occurrences,
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

        for (let i = 0; i < parsed.occurrences.length; i++) {
            const occ = parsed.occurrences[i];
            const bookingResult = await client.query(
                `INSERT INTO bookings (
                    user_id, date, start_time, end_time, client_name, client_email,
                    client_phone, notes, status, recurring_series_id, occurrence_index
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10)
                RETURNING id, confirmation_uuid, date::text, start_time::text, end_time::text,
                          client_name, client_email, client_phone, notes, occurrence_index`,
                [
                    req.session.userId,
                    occ.date,
                    occ.start_time,
                    occ.end_time,
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

        const clientPortalUrl = series.client_confirmation_token
            ? getClientSeriesPortalUrl(series.client_confirmation_token, req)
            : null;

        setImmediate(async () => {
            try {
                await mailService.sendRecurringSeriesClientInvite(
                    { ...series, frequency: parsed.frequency },
                    createdBookings,
                    host,
                    clientPortalUrl
                );
                await mailService.sendRecurringSeriesHostPendingNotification(
                    { ...series, frequency: parsed.frequency },
                    createdBookings,
                    host,
                    clientPortalUrl
                );
            } catch (err) {
                console.error('Series invite email error:', err);
            }
        });

        res.json({
            success: true,
            series_id: series.id,
            bookings_created: createdBookings.length,
            client_portal_url: clientPortalUrl
        });
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch {
            // ignore rollback errors
        }
        console.error('create series error:', error);
        res.status(500).json({ error: error.message || 'Failed to create schedule' });
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

router.patch('/:seriesId/occurrences/:bookingId', async (req, res) => {
    try {
        const seriesId = parseInt(req.params.seriesId, 10);
        const bookingId = parseInt(req.params.bookingId, 10);
        const { date, start_time, end_time, duration_minutes: durationFromBody } = req.body;

        if (!date || !start_time) {
            return res.status(400).json({ error: 'Date and start time are required' });
        }

        const rowResult = await db.query(
            `SELECT b.id, b.client_confirmed_at, b.status, b.date::text AS date,
                    b.google_event_id, rs.duration_minutes, rs.status AS series_status
             FROM bookings b
             JOIN recurring_series rs ON rs.id = b.recurring_series_id
             WHERE b.id = $1 AND b.recurring_series_id = $2 AND b.user_id = $3`,
            [bookingId, seriesId, req.session.userId]
        );

        if (rowResult.rows.length === 0) {
            return res.status(404).json({ error: 'Meeting not found' });
        }

        const row = rowResult.rows[0];
        if (row.series_status === 'cancelled') {
            return res.status(400).json({ error: 'Series is cancelled' });
        }
        if (row.status === 'cancelled') {
            return res.status(400).json({ error: 'Meeting is cancelled' });
        }
        if (row.client_confirmed_at) {
            return res.status(409).json({
                error: 'This meeting was already confirmed by the client and cannot be edited'
            });
        }

        const today = new Date().toISOString().split('T')[0];
        if (date < today) {
            return res.status(400).json({ error: 'Cannot schedule meetings in the past' });
        }

        const startNorm = start_time.length > 5 ? start_time.slice(0, 5) : start_time;
        let endNorm = end_time
            ? (end_time.length > 5 ? end_time.slice(0, 5) : end_time)
            : null;
        const duration =
            clampMeetingDurationMinutes(durationFromBody) ||
            (endNorm ? timeToMinutes(endNorm) - timeToMinutes(startNorm) : null) ||
            row.duration_minutes ||
            60;
        if (duration < MIN_MEETING_DURATION || duration > MAX_MEETING_DURATION) {
            return res.status(400).json({
                error: `Duration must be between ${MIN_MEETING_DURATION} and ${MAX_MEETING_DURATION} minutes`
            });
        }
        endNorm = minutesToTime(timeToMinutes(startNorm) + duration);
        if (timeToMinutes(endNorm) <= timeToMinutes(startNorm)) {
            return res.status(400).json({ error: 'End time must be after start time' });
        }

        const host = await loadHost(req.session.userId);
        const slotCheck = await validateBookingSlot(
            req.session.userId,
            date,
            startNorm,
            endNorm,
            {
                googleCalendarBlockingEnabled: host.google_calendar_blocking_enabled !== false,
                excludeBookingId: bookingId,
                excludeGoogleEventId: row.google_event_id || null,
                bufferMinutes: getHostBufferMinutes(host)
            }
        );
        if (!slotCheck.ok) {
            return res.status(409).json({
                error: slotCheck.reason,
                conflictType: slotCheck.conflictType
            });
        }

        const updateResult = await db.query(
            `UPDATE bookings
             SET date = $1, start_time = $2, end_time = $3
             WHERE id = $4
             RETURNING id, date::text AS date, start_time::text AS start_time, end_time::text AS end_time,
                       occurrence_index, client_confirmed_at`,
            [date, startNorm, endNorm, bookingId]
        );

        res.json({ success: true, booking: updateResult.rows[0] });
    } catch (error) {
        console.error('update occurrence error:', error);
        res.status(500).json({ error: error.message || 'Failed to update meeting' });
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
