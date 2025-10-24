const express = require('express');
const router = express.Router();
const db = require('../db');
const urlShortener = require('../services/urlShortener');
const { isAuthenticated } = require('../middleware/auth');

/**
 * Resolve short URL and redirect to original URL
 * GET /s/:code
 */
router.get('/s/:code', async (req, res) => {
    try {
        const { code } = req.params;
        
        if (!code || code.length !== 6) {
            return res.status(404).render('error', { 
                message: 'Invalid short URL',
                title: 'Link Not Found'
            });
        }

        const originalUrl = await urlShortener.resolveUrl(code);
        
        if (originalUrl) {
            // Redirect to original URL
            res.redirect(originalUrl);
        } else {
            // Short URL not found or expired
            res.status(404).render('error', { 
                message: 'This link has expired or does not exist',
                title: 'Link Not Found',
                showHomeLink: true
            });
        }
    } catch (error) {
        console.error('URL resolution error:', error);
        res.status(500).render('error', { 
            message: 'Server error while resolving link',
            title: 'Server Error',
            showHomeLink: true
        });
    }
});

module.exports = router;