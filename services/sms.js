const axios = require('axios');

const SEMAPHORE_API_KEY = process.env.SEMAPHORE_API_KEY;
const SEMAPHORE_SENDER = 'ISKED';
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
    // Check if host has pro subscription
    if (!host.is_pro || (host.pro_expires_at && new Date(host.pro_expires_at) < new Date())) {
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

    const meetingLink = host.meeting_link || host.zoom_link || host.gmeet_link;
    const message = `Hi ${booking.client_name}, your meeting with ${host.full_name} is confirmed!\n` +
                   `Date: ${formatDate(booking.date)}\n` +
                   `Time: ${formatTime(booking.start_time)}\n` +
                   (meetingLink ? `Meeting Link: ${meetingLink}` : '');

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

module.exports = {
    sendBookingConfirmationSMS
}; 