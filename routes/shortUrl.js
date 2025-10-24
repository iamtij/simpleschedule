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

/**
 * Get analytics for a short URL (PRO users only)
 * GET /api/short-urls/:code/analytics
 */
// router.get('/api/short-urls/:code/analytics', isAuthenticated, async (req, res) => {
//     try {
//         const { code } = req.params;
//         const userId = req.session.userId;

//         // Check if user has PRO subscription
//         const userResult = await db.query(
//             'SELECT is_pro, pro_expires_at FROM users WHERE id = $1',
//             [userId]
//         );

//         if (userResult.rows.length === 0) {
//             return res.status(404).json({ error: 'User not found' });
//         }

//         const user = userResult.rows[0];
//         if (!user.is_pro || (user.pro_expires_at && new Date(user.pro_expires_at) < new Date())) {
//             return res.status(403).json({ 
//                 error: 'Analytics feature requires PRO subscription' 
//             });
//         }

//         const analytics = await urlShortener.getAnalytics(code);
        
//         if (!analytics) {
//             return res.status(404).json({ error: 'Short URL not found' });
//         }

//         res.json({
//             success: true,
//             data: analytics
//         });
//     } catch (error) {
//         console.error('Analytics error:', error);
//         res.status(500).json({ 
//             error: 'Failed to fetch analytics' 
//         });
//     }
// });

/**
 * Get all short URLs for current user
 * GET /api/short-urls
 */
// router.get('/api/short-urls', isAuthenticated, async (req, res) => {
//     try {
//         const userId = req.session.userId;
//         const shortUrls = await urlShortener.getUserShortUrls(userId);

//         res.json({
//             success: true,
//             data: shortUrls
//         });
//     } catch (error) {
//         console.error('Get short URLs error:', error);
//         res.status(500).json({ 
//             error: 'Failed to fetch short URLs' 
//         });
//     }
// });

/**
 * Delete a short URL
 * DELETE /api/short-urls/:code
 */
// router.delete('/api/short-urls/:code', isAuthenticated, async (req, res) => {
//     try {
//         const { code } = req.params;
//         const userId = req.session.userId;

//         const success = await urlShortener.deleteShortUrl(code, userId);
        
//         if (success) {
//             res.json({ success: true });
//         } else {
//             res.status(404).json({ error: 'Short URL not found' });
//         }
//     } catch (error) {
//         console.error('Delete short URL error:', error);
//         res.status(500).json({ 
//             error: 'Failed to delete short URL' 
//         });
//     }
// });

/**
 * Create a custom short URL (PRO users only)
 * POST /api/short-urls
 */
// router.post('/api/short-urls', isAuthenticated, async (req, res) => {
//     try {
//         const { originalUrl, customCode, expirationDays } = req.body;
//         const userId = req.session.userId;

//         // Check if user has PRO subscription
//         const userResult = await db.query(
//             'SELECT is_pro, pro_expires_at FROM users WHERE id = $1',
//             [userId]
//         );

//         if (userResult.rows.length === 0) {
//             return res.status(404).json({ error: 'User not found' });
//         }

//         const user = userResult.rows[0];
//         if (!user.is_pro || (user.pro_expires_at && new Date(user.pro_expires_at) < new Date())) {
//             return res.status(403).json({ 
//                 error: 'Custom short URLs require PRO subscription' 
//             });
//         }

//         if (!originalUrl) {
//             return res.status(400).json({ error: 'Original URL is required' });
//         }

//         let shortUrl;
//         if (customCode) {
//             // Check if custom code is available
//             const existing = await db.query(
//                 'SELECT id FROM short_urls WHERE code = $1',
//                 [customCode]
//             );
            
//             if (existing.rows.length > 0) {
//                 return res.status(400).json({ 
//                     error: 'Custom code already exists' 
//                 });
//             }

//             // Create with custom code
//             const expiresAt = expirationDays > 0 
//                 ? new Date(Date.now() + (expirationDays * 24 * 60 * 60 * 1000))
//                 : null;

//             await db.query(
//                 `INSERT INTO short_urls (code, original_url, user_id, expires_at) 
//                  VALUES ($1, $2, $3, $4)`,
//                 [customCode, originalUrl, userId, expiresAt]
//             );

//             shortUrl = `${process.env.BASE_URL || 'https://isked.app'}/s/${customCode}`;
//         } else {
//             // Create with random code
//             shortUrl = await urlShortener.shortenUrl(originalUrl, null, userId, expirationDays);
//         }

//         res.json({
//             success: true,
//             data: {
//                 shortUrl,
//                 originalUrl
//             }
//         });
//     } catch (error) {
//         console.error('Create short URL error:', error);
//         res.status(500).json({ 
//             error: 'Failed to create short URL' 
//         });
//     }
// });

module.exports = router;
