const db = require('../db');
const googleCalendarService = require('../services/googleCalendar');
const timezone = require('./timezone');

/**
 * Create a Google Calendar event for a booking and persist event id/link.
 */
async function syncBookingToGoogleCalendar(userId, booking, host) {
    try {
        const tokens = await googleCalendarService.getUserTokens(userId);
        if (!tokens || !tokens.google_access_token) {
            return null;
        }

        const userResult = await db.query('SELECT timezone FROM users WHERE id = $1', [userId]);
        const userTimezone = timezone.getUserTimezone(userResult.rows[0]?.timezone);

        let description = `Booking from isked\nClient: ${booking.client_name}\nEmail: ${booking.client_email}`;
        if (booking.client_phone) {
            description += `\nPhone: ${booking.client_phone}`;
        }
        if (booking.notes) {
            description += `\nNotes: ${booking.notes}`;
        }
        if (host.meeting_link) {
            description += `\n\nMeeting Link: ${host.meeting_link}`;
        }

        const hostNameForTitle = host.name || host.display_name || host.full_name || host.username || 'Host';
        const clientNameForTitle = booking.client_name || 'Client';
        const eventDetails = {
            title: `${clientNameForTitle} with ${hostNameForTitle}`,
            description,
            startTime: `${booking.date}T${booking.start_time}:00${timezone.getDefaultUtcOffset()}`,
            endTime: `${booking.date}T${booking.end_time}:00${timezone.getDefaultUtcOffset()}`,
            timeZone: userTimezone,
            attendees: booking.client_email ? [{ email: booking.client_email }] : []
        };

        const googleEvent = await googleCalendarService.createCalendarEvent(userId, eventDetails);
        await db.query(
            'UPDATE bookings SET google_event_id = $1, google_calendar_link = $2 WHERE id = $3',
            [googleEvent.id, googleEvent.htmlLink, booking.id]
        );
        return googleEvent;
    } catch {
        return null;
    }
}

module.exports = {
    syncBookingToGoogleCalendar
};
