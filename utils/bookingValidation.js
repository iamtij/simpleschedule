const db = require('../db');
const googleCalendarService = require('../services/googleCalendar');
const timezone = require('./timezone');

function timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

/**
 * Validate that a time slot can be booked for a host.
 * @returns {Promise<{ ok: true } | { ok: false, reason: string, conflictType?: string }>}
 */
async function validateBookingSlot(userId, date, start_time, end_time, options = {}) {
    const { googleCalendarBlockingEnabled = true, excludeBookingId = null } = options;

    const [year, month, day] = date.split('-').map(Number);
    const bookingDate = new Date(Date.UTC(year, month - 1, day));
    const dayOfWeek = bookingDate.getUTCDay();
    const bookingStartMinutes = timeToMinutes(start_time);
    const bookingEndMinutes = timeToMinutes(end_time);

    if (bookingEndMinutes <= bookingStartMinutes) {
        return { ok: false, reason: 'End time must be after start time' };
    }

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

    const conflictParams = [userId, date, start_time, end_time];
    let conflictQuery = `
        SELECT id FROM bookings
        WHERE user_id = $1
        AND date = $2
        AND status != 'cancelled'
        AND (
            (start_time <= $3 AND end_time > $3) OR
            (start_time < $4 AND end_time >= $4) OR
            (start_time >= $3 AND end_time <= $4)
        )`;
    if (excludeBookingId) {
        conflictQuery += ' AND id != $5';
        conflictParams.push(excludeBookingId);
    }

    const conflictCheck = await db.query(conflictQuery, conflictParams);

    if (conflictCheck.rows.length > 0) {
        return { ok: false, reason: 'Conflicts with an existing booking', conflictType: 'booking' };
    }

    if (googleCalendarBlockingEnabled) {
        try {
            const tokens = await googleCalendarService.getUserTokens(userId);
            if (tokens && tokens.google_access_token) {
                const bookingStartTime = `${date}T${start_time}:00${timezone.getDefaultUtcOffset()}`;
                const bookingEndTime = `${date}T${end_time}:00${timezone.getDefaultUtcOffset()}`;
                const conflictInfo = await googleCalendarService.getTimeSlotConflicts(
                    userId,
                    bookingStartTime,
                    bookingEndTime
                );
                if (conflictInfo.hasConflicts) {
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
    validateBookingSlot
};
