const express = require('express');
const router = express.Router();
const mailService = require('../services/mail');
const smsService = require('../services/sms');

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

// Send sample admin notification emails (new sign-up, subscription, trial expiring) to tjtalusan@gmail.com
router.get('/admin-notification-samples', async (req, res) => {
    const adminEmail = 'tjtalusan@gmail.com';

    try {
        const result = await mailService.sendSampleAdminNotifications(adminEmail);

        res.json({
            success: true,
            message: `Sample admin notification emails sent to ${adminEmail}`,
            results: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to send sample admin notifications',
            error: error.message
        });
    }
});

router.get('/trial-expiration-emails', async (req, res) => {
    try {
        const result = await mailService.sendTestTrialExpirationEmail();
        res.json({
            success: true,
            message: result.message || 'Test trial expiration emails scheduled successfully',
            result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to send test trial expiration emails',
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

// Send a test host notification SMS (must be before /sms/:phone)
// e.g. /test/sms/host/639171234567
router.get('/sms/host/:phone', async (req, res) => {
    const phone = req.params.phone?.replace(/\D/g, '') || '';
    if (!phone || phone.length < 10) {
        return res.status(400).json({
            success: false,
            message: 'Invalid phone number. Use e.g. /test/sms/host/639171234567'
        });
    }

    const now = new Date();
    const start = new Date(now.getTime() + 60 * 60 * 1000);
    const toDateString = (d) => d.toISOString().split('T')[0];
    const toTimeString = (d) => d.toISOString().split('T')[1].slice(0, 5);

    const booking = {
        id: 0,
        client_name: 'Test Client',
        date: toDateString(start),
        start_time: toTimeString(start)
    };

    const host = {
        id: 1,
        sms_phone: req.params.phone.trim(),
        is_pro: true,
        pro_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    };

    try {
        const result = await smsService.sendHostNotificationSMS(booking, host);
        if (result == null && !process.env.SEMAPHORE_API_KEY) {
            return res.status(503).json({
                success: false,
                message: 'SMS not sent: SEMAPHORE_API_KEY is not set',
                hint: 'Add SEMAPHORE_API_KEY to .env to enable SMS'
            });
        }
        res.json({
            success: true,
            message: 'Test host SMS sent to ' + host.sms_phone,
            result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to send test host SMS',
            error: error.message
        });
    }
});

// Send a test SMS to the given phone number (e.g. /test/sms/639171234567).
// SMS is sent to phone numbers only; use your mobile number to receive it.
router.get('/sms/:phone', async (req, res) => {
    const phone = req.params.phone?.replace(/\D/g, '') || '';
    if (!phone || phone.length < 10) {
        return res.status(400).json({
            success: false,
            message: 'Invalid phone number. Use e.g. /test/sms/639171234567'
        });
    }

    const now = new Date();
    const start = new Date(now.getTime() + 60 * 60 * 1000);
    const toDateString = (d) => d.toISOString().split('T')[0];
    const toTimeString = (d) => d.toISOString().split('T')[1].slice(0, 5);

    const booking = {
        id: 0,
        client_name: 'Test Client',
        client_email: 'tjtalusan@gmail.com',
        client_phone: req.params.phone.trim(),
        date: toDateString(start),
        start_time: toTimeString(start),
        end_time: toTimeString(new Date(start.getTime() + 30 * 60 * 1000)),
        notes: 'Test SMS from SimpleSchedule',
        confirmation_uuid: 'test-sms-' + Date.now()
    };

    const host = {
        id: 1,
        full_name: 'Test Host',
        username: 'testhost',
        email: 'tjtalusan@gmail.com',
        is_pro: true,
        pro_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    };

    try {
        const result = await smsService.sendBookingConfirmationSMS(booking, host);
        if (result == null && !process.env.SEMAPHORE_API_KEY) {
            return res.status(503).json({
                success: false,
                message: 'SMS not sent: SEMAPHORE_API_KEY is not set',
                hint: 'Add SEMAPHORE_API_KEY to .env to enable SMS'
            });
        }
        res.json({
            success: true,
            message: 'Test SMS sent to ' + booking.client_phone,
            result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to send test SMS',
            error: error.message
        });
    }
});

module.exports = router;