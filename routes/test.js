const express = require('express');
const router = express.Router();
const mailService = require('../services/mail');

router.get('/email/:email', async (req, res) => {
    try {
        const result = await mailService.sendTestEmail(req.params.email);
        res.json({
            success: true,
            message: 'Test email sent successfully',
            result
        });
    } catch (error) {
        console.error('Test email failed:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send test email',
            error: error.message
        });
    }
});

module.exports = router; 