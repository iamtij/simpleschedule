const axios = require('axios');

function splitFullName(fullName) {
    const trimmed = (fullName || '').trim();
    if (!trimmed) {
        return { firstName: '', lastName: '' };
    }

    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) {
        return { firstName: parts[0], lastName: '' };
    }

    return {
        firstName: parts[0],
        lastName: parts.slice(1).join(' ')
    };
}

function buildPayload(booking) {
    const { firstName, lastName } = splitFullName(booking.client_name);

    const payload = {
        firstName,
        lastName,
        email: booking.client_email,
        notes: booking.notes || '',
        source: 'isked'
    };

    if (booking.client_phone) {
        payload.mobile = booking.client_phone;
    }

    return payload;
}

function isConfigured(host) {
    return Boolean(
        host?.olinn_webhook_enabled &&
        host?.olinn_webhook_url &&
        host.olinn_webhook_url.trim()
    );
}

async function notifyNewBooking(booking, host) {
    if (!isConfigured(host)) {
        return null;
    }

    const payload = buildPayload(booking);
    const webhookUrl = host.olinn_webhook_url.trim();

    const response = await axios.post(webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
    });

    return response.data;
}

module.exports = {
    splitFullName,
    buildPayload,
    isConfigured,
    notifyNewBooking
};
