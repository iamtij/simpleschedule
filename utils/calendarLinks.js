function formatDateCompact(dateStr) {
    return String(dateStr).replace(/-/g, '');
}

function formatTimeCompact(timeStr) {
    const t = String(timeStr).slice(0, 5);
    return t.replace(':', '') + '00';
}

function formatTime12(timeStr) {
    if (!timeStr) return '';
    const [hoursStr, minutes = '00'] = String(timeStr).split(':');
    const hours = parseInt(hoursStr, 10);
    if (Number.isNaN(hours)) return timeStr;
    const suffix = hours >= 12 ? 'PM' : 'AM';
    const hour12 = ((hours + 11) % 12) + 1;
    return `${hour12}:${minutes.padStart(2, '0')} ${suffix}`;
}

function escapeIcsText(text) {
    return String(text || '')
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\n/g, '\\n');
}

/**
 * Google Calendar "add event" URL (floating local date/time, same as booking confirmation).
 */
function buildGoogleCalendarUrl({ title, date, startTime, endTime, details, location }) {
    const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: title,
        dates: `${formatDateCompact(date)}T${formatTimeCompact(startTime)}/${formatDateCompact(date)}T${formatTimeCompact(endTime)}`,
        details: details || ''
    });
    if (location) {
        params.set('location', location);
    }
    return `https://calendar.google.com/calendar/event?${params.toString()}`;
}

function buildIcsEvent({ uid, title, date, startTime, endTime, description, location }) {
    const lines = [
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${formatDateCompact(new Date().toISOString().slice(0, 10))}T000000`,
        `DTSTART:${formatDateCompact(date)}T${formatTimeCompact(startTime)}`,
        `DTEND:${formatDateCompact(date)}T${formatTimeCompact(endTime)}`,
        `SUMMARY:${escapeIcsText(title)}`
    ];
    if (description) {
        lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
    }
    if (location) {
        lines.push(`LOCATION:${escapeIcsText(location)}`);
    }
    lines.push('END:VEVENT');
    return lines.join('\r\n');
}

function buildIcsCalendar(events) {
    const body = events.map((e) => buildIcsEvent(e)).join('\r\n');
    return [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//isked//Client Schedule//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        body,
        'END:VCALENDAR'
    ].join('\r\n');
}

function buildEventDetails({ hostName, meetingLink, notes, clientName }) {
    const parts = [];
    if (meetingLink) {
        parts.push(`Meeting link: ${meetingLink}`);
    }
    if (notes) {
        parts.push(`Notes: ${notes}`);
    }
    if (clientName) {
        parts.push(`Client: ${clientName}`);
    }
    return parts.join('\n\n');
}

function getAppBaseUrl(req) {
    if (process.env.APP_URL) {
        return process.env.APP_URL.replace(/\/$/, '');
    }
    if (req) {
        return `${req.protocol}://${req.get('host')}`;
    }
    return 'https://isked.app';
}

function getClientSeriesPortalUrl(token, req) {
    return `${getAppBaseUrl(req)}/schedule/series/${token}`;
}

module.exports = {
    formatTime12,
    buildGoogleCalendarUrl,
    buildIcsCalendar,
    buildIcsEvent,
    buildEventDetails,
    getAppBaseUrl,
    getClientSeriesPortalUrl
};
