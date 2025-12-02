const express = require('express');
const router = express.Router();
const mailService = require('../services/mail');

function buildSampleBooking({ clientEmail }) {
    const now = new Date();
    const start = new Date(now.getTime() + 30 * 60 * 1000);
    const end = new Date(start.getTime() + 30 * 60 * 1000);

    const toDateString = (date) => date.toISOString().split('T')[0];
    const toTimeString = (date) => date.toISOString().split('T')[1].slice(0, 5);

    const formatTime12Hour = (date) => {
        let hours = date.getHours();
        const minutes = date.getMinutes();
        const suffix = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        return `${hours}:${minutes.toString().padStart(2, '0')} ${suffix}`;
    };

    return {
        id: 0,
        client_name: 'Sample Client',
        client_email: clientEmail,
        client_phone: '639171234567',
        date: toDateString(start),
        start_time: toTimeString(start),
        end_time: toTimeString(end),
        formatted_start_time: formatTime12Hour(start),
        formatted_end_time: formatTime12Hour(end),
        notes: 'This is a sample reminder generated from /test routes.',
        confirmation_uuid: 'sample-confirmation'
    };
}

function buildSampleHost({ email }) {
    return {
        name: 'Sample Host',
        username: 'sample-host',
        email,
        meeting_link: 'https://example.com/sample-meeting-link'
    };
}

router.get('/email/:email', async (req, res) => {
    try {
        const result = await mailService.sendTestEmail(req.params.email);
        res.json({
            success: true,
            message: 'Test email sent successfully',
            result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to send test email',
            error: error.message
        });
    }
});

router.get('/reminder/client/:email', async (req, res) => {
    const booking = buildSampleBooking({ clientEmail: req.params.email });
    const host = buildSampleHost({ email: 'host@example.com' });

    try {
        const result = await mailService.sendClientReminder(booking, host);
        res.json({
            success: true,
            message: 'Client reminder sent successfully',
            result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to send client reminder',
            error: error.message
        });
    }
});

router.get('/reminder/host/:email', async (req, res) => {
    const booking = buildSampleBooking({ clientEmail: 'client@example.com' });
    const host = buildSampleHost({ email: req.params.email });

    try {
        const result = await mailService.sendHostReminder(booking, host);
        res.json({
            success: true,
            message: 'Host reminder sent successfully',
            result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to send host reminder',
            error: error.message
        });
    }
});

module.exports = router;