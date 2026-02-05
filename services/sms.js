const axios = require('axios');
const urlShortener = require('./urlShortener');
const { isProActiveForFeatures } = require('../utils/subscription');

const SEMAPHORE_API_KEY = process.env.SEMAPHORE_API_KEY;
const SEMAPHORE_SENDER = 'isked';
const SEMAPHORE_API_URL = 'https://api.semaphore.co/api/v4/messages';

function formatPhoneNumber(phone) {
    // Remove all spaces, dashes, parentheses and other non-digit characters
    let cleaned = phone.replace(/\D/g, '');
    
    // If number starts with 0, remove it
    if (cleaned.startsWith('0')) {
        cleaned = cleaned.substring(1);
    }
    
    // If number doesn't start with 63, add it
    if (!cleaned.startsWith('63')) {
        cleaned = '63' + cleaned;
    }
    
    return cleaned;
}

function formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });
}

function formatTime(time) {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
}

async function sendBookingConfirmationSMS(booking, host) {
    if (!isProActiveForFeatures(host)) {
        console.log('SMS not sent: Host does not have an active pro subscription');
        return null;
    }

    if (!SEMAPHORE_API_KEY) {
        if (process.env.NODE_ENV === 'development') {
            console.warn('Semaphore API key missing. SMS functionality will be disabled.');
        }
        return;
    }

    if (!booking.client_phone) {
        return; // Skip if no phone number provided
    }

    // Create short URL for appointment page
    const baseUrl = process.env.BASE_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://isked.app');
    const appointmentUrl = `${baseUrl}/booking/${host.username}/confirmation/${booking.confirmation_uuid}`;
    console.log('Creating short URL for:', appointmentUrl);
    
    let shortUrl;
    try {
        shortUrl = await urlShortener.shortenUrl(appointmentUrl, null, host.id, 30);
        console.log('Generated short URL:', shortUrl);
    } catch (error) {
        console.error('Error creating short URL:', error);
        // Fallback to original appointment URL if short URL fails
        shortUrl = appointmentUrl;
        console.log('Using fallback URL:', shortUrl);
    }
    
    const message = `Hi ${booking.client_name}, your meeting with ${host.full_name} is confirmed!\n` +
                   `Date: ${formatDate(booking.date)}\n` +
                   `Time: ${formatTime(booking.start_time)}\n` +
                   `Join: ${shortUrl}`;
    
    console.log('SMS message:', message);

    try {
        const response = await axios.post(SEMAPHORE_API_URL, {
            apikey: SEMAPHORE_API_KEY,
            number: formatPhoneNumber(booking.client_phone),
            message: message.trim(), // Remove any trailing newlines if no meeting link
            sendername: SEMAPHORE_SENDER
        });

        console.log('SMS sent successfully:', response.data);
        return response.data;
    } catch (error) {
        console.error('Failed to send SMS:', error.response?.data || error.message);
        // Don't throw the error - we don't want to fail the booking if SMS fails
        return null;
    }
}

async function sendHostNotificationSMS(booking, host) {
    if (!host.sms_phone || host.sms_phone.trim() === '') {
        return; // Don't send SMS to host if they haven't set a phone number
    }
    if (!isProActiveForFeatures(host)) {
        console.log('SMS not sent to host: Host does not have an active pro subscription');
        return null;
    }
    if (!SEMAPHORE_API_KEY) {
        if (process.env.NODE_ENV === 'development') {
            console.warn('Semaphore API key missing. SMS functionality will be disabled.');
        }
        return;
    }

    const message = `New booking! ${booking.client_name} on ${formatDate(booking.date)} at ${formatTime(booking.start_time)}. View: ${process.env.BASE_URL || 'https://isked.app'}/dashboard`;

    try {
        const response = await axios.post(SEMAPHORE_API_URL, {
            apikey: SEMAPHORE_API_KEY,
            number: formatPhoneNumber(host.sms_phone),
            message: message.trim(),
            sendername: SEMAPHORE_SENDER
        });
        console.log('Host SMS sent successfully:', response.data);
        return response.data;
    } catch (error) {
        console.error('Failed to send host SMS:', error.response?.data || error.message);
        return null;
    }
}

/**
 * Send 30-minute reminder SMS to client. Pro hosts only.
 */
async function sendClientReminder30MinSMS(booking, host) {
    if (!isProActiveForFeatures(host)) return null;
    if (!SEMAPHORE_API_KEY) return null;
    if (!booking.client_phone || !booking.client_phone.trim()) return null;

    const baseUrl = process.env.BASE_URL || 'https://isked.app';
    const joinUrl = booking.confirmation_uuid
        ? `${baseUrl}/booking/${host.username}/confirmation/${booking.confirmation_uuid}`
        : '';

    let message = `Reminder: Your appointment with ${host.full_name || host.name || host.username} is in 30 mins. ${formatDate(booking.date)} at ${formatTime(booking.start_time)}.`;
    if (joinUrl) message += ` Join: ${joinUrl}`;

    try {
        const response = await axios.post(SEMAPHORE_API_URL, {
            apikey: SEMAPHORE_API_KEY,
            number: formatPhoneNumber(booking.client_phone),
            message: message.trim(),
            sendername: SEMAPHORE_SENDER
        });
        console.log('Client 30-min reminder SMS sent:', response.data);
        return response.data;
    } catch (error) {
        console.error('Failed to send client 30-min reminder SMS:', error.response?.data || error.message);
        return null;
    }
}

/**
 * Send 30-minute reminder SMS to host. Pro only, and only if host has sms_phone set.
 */
async function sendHostReminder30MinSMS(booking, host) {
    if (!host.sms_phone || !host.sms_phone.trim()) return null;
    if (!isProActiveForFeatures(host)) return null;
    if (!SEMAPHORE_API_KEY) return null;

    const dashboardUrl = `${process.env.BASE_URL || 'https://isked.app'}/dashboard`;
    const message = `Reminder: Meeting with ${booking.client_name} in 30 mins. ${formatDate(booking.date)} at ${formatTime(booking.start_time)}. View: ${dashboardUrl}`;

    try {
        const response = await axios.post(SEMAPHORE_API_URL, {
            apikey: SEMAPHORE_API_KEY,
            number: formatPhoneNumber(host.sms_phone),
            message: message.trim(),
            sendername: SEMAPHORE_SENDER
        });
        console.log('Host 30-min reminder SMS sent:', response.data);
        return response.data;
    } catch (error) {
        console.error('Failed to send host 30-min reminder SMS:', error.response?.data || error.message);
        return null;
    }
}

module.exports = {
    sendBookingConfirmationSMS,
    sendHostNotificationSMS,
    sendClientReminder30MinSMS,
    sendHostReminder30MinSMS
}; 