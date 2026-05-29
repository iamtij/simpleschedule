const db = require('../db');
const googleCalendarService = require('../services/googleCalendar');
const timezone = require('./timezone');

function timeToMinutes(timeStr) {
    const [hours, minutes] = String(timeStr).slice(0, 5).split(':').map(Number);
    return hours * 60 + minutes;
}

function normalizeTime(timeStr) {
    const [hours, minutes] = String(timeStr).slice(0, 5).split(':').map(Number);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * True if [startA, endA] overlaps [startB, endB], optionally expanded by buffer minutes on each side.
 */
function rangesOverlapMinutes(startA, endA, startB, endB, bufferMinutes = 0) {
    const aStart = startA - bufferMinutes;
    const aEnd = endA + bufferMinutes;
    const bStart = startB - bufferMinutes;
    const bEnd = endB + bufferMinutes;
    return aStart < bEnd && aEnd > bStart;
}

/**
 * Validate that a time slot can be booked for a host.
 * @returns {Promise<{ ok: true } | { ok: false, reason: string, conflictType?: string }>}
 */
async function validateBookingSlot(userId, date, start_time, end_time, options = {}) {
    const {
        googleCalendarBlockingEnabled = true,
        excludeBookingId = null,
        excludeGoogleEventId = null,
        bufferMinutes = 0
    } = options;

    const startNorm = normalizeTime(start_time);
    const endNorm = normalizeTime(end_time);
    const bookingStartMinutes = timeToMinutes(startNorm);
    const bookingEndMinutes = timeToMinutes(endNorm);

    if (bookingEndMinutes <= bookingStartMinutes) {
        return { ok: false, reason: 'End time must be after start time' };
    }

    const [year, month, day] = date.split('-').map(Number);
    const bookingDate = new Date(Date.UTC(year, month - 1, day));
    const dayOfWeek = bookingDate.getUTCDay();

    let availabilityResult = await db.query(
        'SELECT start_time, end_time FROM date_availability WHERE user_id = $1 AND date = $2 ORDER BY start_time',
        [userId, date]
    );

    if (availabilityResult.rows.length === 0) {
        availabilityResult = await db.query(
            'SELECT start_time, end_time FROM availability WHERE user_id = $1 AND day_of_week = $2 ORDER BY start_time',
            [userId, dayOfWeek]
        );
    }

    if (availabilityResult.rows.length === 0) {
        return { ok: false, reason: 'No availability on this date' };
    }

    let isValidSlot = false;
    for (const block of availabilityResult.rows) {
        const blockStartMinutes = timeToMinutes(block.start_time);
        const blockEndMinutes = timeToMinutes(block.end_time);
        if (bookingStartMinutes >= blockStartMinutes && bookingEndMinutes <= blockEndMinutes) {
            isValidSlot = true;
            break;
        }
    }

    if (!isValidSlot) {
        return { ok: false, reason: 'Time slot is not within available hours' };
    }

    const dayBreaksResult = await db.query(
        'SELECT start_time, end_time FROM breaks WHERE user_id = $1 AND day_of_week = $2',
        [userId, dayOfWeek]
    );
    const universalBreaksResult = await db.query(
        'SELECT start_time, end_time FROM universal_breaks WHERE user_id = $1 AND enabled = true',
        [userId]
    );
    const allBreaks = [...dayBreaksResult.rows, ...universalBreaksResult.rows];
    for (const b of allBreaks) {
        const breakStart = timeToMinutes(b.start_time);
        const breakEnd = timeToMinutes(b.end_time);
        if (rangesOverlapMinutes(bookingStartMinutes, bookingEndMinutes, breakStart, breakEnd)) {
            return { ok: false, reason: 'Conflicts with a scheduled break', conflictType: 'break' };
        }
    }

    let bookingsQuery = `
        SELECT id, start_time::text AS start_time, end_time::text AS end_time
        FROM bookings
        WHERE user_id = $1 AND date = $2 AND status != 'cancelled'`;
    const bookingsParams = [userId, date];
    if (excludeBookingId) {
        bookingsQuery += ' AND id != $3';
        bookingsParams.push(excludeBookingId);
    }
    const bookingsResult = await db.query(bookingsQuery, bookingsParams);

    for (const b of bookingsResult.rows) {
        const existingStart = timeToMinutes(b.start_time);
        const existingEnd = timeToMinutes(b.end_time);
        if (rangesOverlapMinutes(
            bookingStartMinutes,
            bookingEndMinutes,
            existingStart,
            existingEnd,
            bufferMinutes
        )) {
            return {
                ok: false,
                reason: 'Conflicts with an existing booking',
                conflictType: 'booking'
            };
        }
    }

    if (googleCalendarBlockingEnabled) {
        try {
            const tokens = await googleCalendarService.getUserTokens(userId);
            if (tokens && tokens.google_access_token) {
                const bookingStartTime = `${date}T${startNorm}:00${timezone.getDefaultUtcOffset()}`;
                const bookingEndTime = `${date}T${endNorm}:00${timezone.getDefaultUtcOffset()}`;
                const conflictInfo = await googleCalendarService.getTimeSlotConflicts(
                    userId,
                    bookingStartTime,
                    bookingEndTime
                );
                const conflicts = (conflictInfo.conflicts || []).filter(
                    (c) => !excludeGoogleEventId || c.id !== excludeGoogleEventId
                );
                if (conflicts.length > 0) {
                    return {
                        ok: false,
                        reason: 'Conflicts with Google Calendar',
                        conflictType: 'google_calendar'
                    };
                }
            }
        } catch {
            // Do not block if Google check fails
        }
    }

    return { ok: true };
}

module.exports = {
    timeToMinutes,
    normalizeTime,
    rangesOverlapMinutes,
    validateBookingSlot
};
