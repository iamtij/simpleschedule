const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../db');
const Coupon = require('../models/Coupon');
const { isAdmin } = require('../middleware/auth');

// Admin access middleware
function requireAdmin(req, res, next) {
    if (
        req.session.user &&
        (req.session.user.email === 'tjtalusan@gmail.com' || req.session.user.is_admin)
    ) {
        return next();
    }
    return res.status(403).send('Forbidden');
}

// Protect all admin routes
router.use(isAdmin);

// Admin dashboard home
router.get('/', requireAdmin, async (req, res) => {
    try {
        // Get total users count
        const usersCount = await db.query('SELECT COUNT(*) FROM users');
        
        // Get total bookings count
        const bookingsCount = await db.query('SELECT COUNT(*) FROM bookings');
        
        // Get today's bookings count
        const todayBookings = await db.query(`
            SELECT COUNT(*) FROM bookings 
            WHERE date = CURRENT_DATE
        `);
        
        // Get active users (users with bookings in the last 30 days)
        const activeUsers = await db.query(`
            SELECT COUNT(DISTINCT user_id) 
            FROM bookings 
            WHERE date >= CURRENT_DATE - INTERVAL '30 days'
        `);

        // Get Pro users (active Pro subscription - takes precedence)
        // Users with active Pro (lifetime or not expired) OR active RevenueCat
        const proUsers = await db.query(`
            SELECT COUNT(*) FROM users
            WHERE (
                (is_pro = TRUE AND (pro_expires_at IS NULL OR pro_expires_at > CURRENT_TIMESTAMP))
                OR COALESCE(revenuecat_entitlement_status, '') = 'active'
            )
        `);

        // Get Free Trial users (trial started within last 5 days and not Pro)
        // Must have trial_started_at within 5 days AND NOT have active Pro
        const freeTrialUsers = await db.query(`
            SELECT COUNT(*) FROM users
            WHERE trial_started_at IS NOT NULL
            AND trial_started_at >= CURRENT_TIMESTAMP - INTERVAL '5 days'
            AND NOT (
                (is_pro = TRUE AND (pro_expires_at IS NULL OR pro_expires_at > CURRENT_TIMESTAMP))
                OR COALESCE(revenuecat_entitlement_status, '') = 'active'
            )
        `);

        // Get Expired users (not Pro and not Free Trial)
        // Users who don't have active Pro AND don't have active trial
        const expiredUsers = await db.query(`
            SELECT COUNT(*) FROM users
            WHERE NOT (
                (is_pro = TRUE AND (pro_expires_at IS NULL OR pro_expires_at > CURRENT_TIMESTAMP))
                OR COALESCE(revenuecat_entitlement_status, '') = 'active'
            )
            AND NOT (
                trial_started_at IS NOT NULL
                AND trial_started_at >= CURRENT_TIMESTAMP - INTERVAL '5 days'
            )
        `);

        res.render('admin/dashboard', {
            stats: {
                totalUsers: parseInt(usersCount.rows[0]?.count || 0, 10),
                totalBookings: parseInt(bookingsCount.rows[0]?.count || 0, 10),
                todayBookings: parseInt(todayBookings.rows[0]?.count || 0, 10),
                activeUsers: parseInt(activeUsers.rows[0]?.count || 0, 10),
                freeTrialUsers: parseInt(freeTrialUsers.rows[0]?.count || 0, 10),
                proUsers: parseInt(proUsers.rows[0]?.count || 0, 10),
                expiredUsers: parseInt(expiredUsers.rows[0]?.count || 0, 10)
            },
            path: '/admin'
        });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.status(500).send('Server error: ' + error.message);
    }
});

// List users with search, filter, and pagination
router.get('/users/data', requireAdmin, async (req, res) => {
    const { page = 1, search = '', status = 'all', subscription = 'all' } = req.query;
    const limit = 10;
    const offset = (page - 1) * limit;
    let where = [];
    let params = [];

    if (search) {
        where.push('(full_name ILIKE $' + (params.length + 1) + ' OR email ILIKE $' + (params.length + 1) + ')');
        params.push(`%${search}%`);
    }
    if (status === 'active') {
        where.push('status = TRUE');
    } else if (status === 'inactive') {
        where.push('status = FALSE');
    }
    
    // Add subscription filter
    if (subscription === 'pro') {
        // Pro users: active Pro (lifetime or not expired) OR active RevenueCat
        where.push(`(
            (is_pro = TRUE AND (pro_expires_at IS NULL OR pro_expires_at > CURRENT_TIMESTAMP))
            OR COALESCE(revenuecat_entitlement_status, '') = 'active'
        )`);
    } else if (subscription === 'free') {
        // Free trial users: trial started within last 5 days AND NOT Pro
        where.push(`(
            trial_started_at IS NOT NULL
            AND trial_started_at >= CURRENT_TIMESTAMP - INTERVAL '5 days'
            AND NOT (
                (is_pro = TRUE AND (pro_expires_at IS NULL OR pro_expires_at > CURRENT_TIMESTAMP))
                OR COALESCE(revenuecat_entitlement_status, '') = 'active'
            )
        )`);
    } else if (subscription === 'expired') {
        // Expired users: NOT Pro AND NOT Free Trial
        where.push(`(
            NOT (
                (is_pro = TRUE AND (pro_expires_at IS NULL OR pro_expires_at > CURRENT_TIMESTAMP))
                OR COALESCE(revenuecat_entitlement_status, '') = 'active'
            )
            AND NOT (
                trial_started_at IS NOT NULL
                AND trial_started_at >= CURRENT_TIMESTAMP - INTERVAL '5 days'
            )
        )`);
    }
    
    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    try {
        const users = await db.query(
            `SELECT 
                id, 
                full_name as name,
                email, 
                status,
                created_at,
                last_login,
                is_admin,
                is_pro,
                pro_expires_at,
                pro_started_at
             FROM users ${whereClause} 
             ORDER BY full_name ASC 
             LIMIT $${params.length + 1} 
             OFFSET $${params.length + 2}`,
            [...params, limit, offset]
        );
        
        // Transform boolean status to string
        users.rows = users.rows.map(user => ({
            ...user,
            status: user.status ? 'active' : 'inactive'
        }));

        const total = await db.query(
            `SELECT COUNT(*) FROM users ${whereClause}`,
            params
        );
        res.json({ users: users.rows, total: parseInt(total.rows[0].count, 10) });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Get payment proofs for a user (must come before /users/:userId route)
router.get('/users/:userId/payment-proofs', requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Try to query payment proofs - if table doesn't exist, it will throw an error
        const proofs = await db.query(
            `SELECT 
                id,
                plan_type,
                original_filename,
                file_size,
                status,
                submitted_at,
                notes
             FROM payment_proofs
             WHERE user_id = $1
             ORDER BY submitted_at DESC`,
            [userId]
        );
        
        res.json({ success: true, proofs: proofs.rows || [] });
    } catch (error) {
        console.error('Error fetching payment proofs:', error);
        // If table doesn't exist or any error, return empty array
        // This way the UI won't show an error, just "No payment proofs"
        res.json({ success: true, proofs: [] });
    }
});

// Get user details
router.get('/users/:userId', requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await db.query(`
            SELECT u.*, 
                   COUNT(b.id) as total_bookings,
                   MAX(b.date) as last_booking_date
            FROM users u
            LEFT JOIN bookings b ON b.user_id = u.id
            WHERE u.id = $1
            GROUP BY u.id
        `, [userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Update user status (active/inactive)
router.patch('/users/:userId/status', requireAdmin, async (req, res) => {
    const { userId } = req.params;
    const { status } = req.body;
    try {
        await db.query('UPDATE users SET status = $1 WHERE id = $2', [status, userId]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update user status' });
    }
});

// Update user admin status
router.patch('/users/:userId/admin', requireAdmin, async (req, res) => {
    const { userId } = req.params;
    const { is_admin } = req.body;
    try {
        await db.query('UPDATE users SET is_admin = $1 WHERE id = $2', [is_admin, userId]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update admin status' });
    }
});

// Get system stats
router.get('/stats', requireAdmin, async (req, res) => {
    try {
        // Get bookings by day for the last 30 days
        const bookingStats = await db.query(`
            SELECT date, COUNT(*) as count
            FROM bookings
            WHERE date >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY date
            ORDER BY date
        `);

        // Get user registration stats by day
        const userStats = await db.query(`
            SELECT DATE(created_at) as date, COUNT(*) as count
            FROM users
            WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY DATE(created_at)
            ORDER BY date
        `);

        res.json({
            bookings: bookingStats.rows,
            users: userStats.rows
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// Get user's bookings
router.get('/users/:userId/bookings', requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await db.query(`
            SELECT * FROM bookings
            WHERE user_id = $1
            ORDER BY date DESC, start_time DESC
            LIMIT 10
        `, [userId]);

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch user bookings' });
    }
});

// Render the admin user management UI
router.get('/users', requireAdmin, (req, res) => {
    const filters = {
        search: req.query.search || '',
        status: req.query.status || '',
        subscription: req.query.subscription || ''
    };
    
    res.render('admin/users', {
        path: '/admin/users',
        filters
    });
});

// Coupon management routes
router.get('/coupons', async (req, res) => {
    try {
        const filters = {
            status: req.query.status,
            code: req.query.code,
            showExpired: req.query.showExpired !== 'false'
        };
        const coupons = await Coupon.list(filters);
        res.render('admin/coupons', { 
            coupons, 
            filters,
            path: '/admin/coupons'
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch coupons' });
    }
});

router.post('/coupons', async (req, res) => {
    try {
        const { code, description, maxUses, expiresAt } = req.body;
        const coupon = await Coupon.create({
            code,
            description,
            maxUses: parseInt(maxUses),
            expiresAt: expiresAt || null,
            createdBy: req.session.userId
        });
        res.json(coupon);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create coupon' });
    }
});

router.put('/coupons/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = {
            code: req.body.code,
            description: req.body.description,
            max_uses: req.body.maxUses ? parseInt(req.body.maxUses) : undefined,
            status: req.body.status,
            expires_at: req.body.expiresAt || null
        };
        const coupon = await Coupon.update(id, updates);
        res.json(coupon);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update coupon' });
    }
});

router.delete('/coupons/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await Coupon.delete(id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete coupon' });
    }
});

// View coupon usage details
router.get('/coupons/:id/usage', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.query(`
            SELECT c.*, 
                   COUNT(DISTINCT cu.id) as actual_uses,
                   json_agg(json_build_object(
                       'user_id', u.id,
                       'name', COALESCE(u.display_name, u.full_name),
                       'email', u.email,
                       'used_at', cu.used_at
                   ) ORDER BY cu.used_at DESC) FILTER (WHERE u.id IS NOT NULL) as usage_details,
                   CASE 
                       WHEN c.status = true THEN 'active'
                       ELSE 'inactive'
                   END as status_text
            FROM coupons c
            LEFT JOIN coupon_usage cu ON c.id = cu.coupon_id
            LEFT JOIN users u ON cu.user_id = u.id
            WHERE c.id = $1
            GROUP BY c.id
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).send('Coupon not found');
        }

        const coupon = result.rows[0];
        coupon.status = coupon.status_text;
        delete coupon.status_text;

        res.render('admin/coupon-usage', { 
            coupon,
            path: '/admin/coupons'
        });
    } catch (error) {
        res.status(500).send('Server error');
    }
});

// Update user
router.put('/users/:userId', requireAdmin, async (req, res) => {
    const { userId } = req.params;
    const { full_name, email, status, is_pro, pro_expires_at, pro_started_at, plan_type } = req.body;
    
    try {
        // Get current user state to check if is_pro is changing from false to true
        const currentUser = await db.query('SELECT is_pro, pro_started_at, pro_expires_at FROM users WHERE id = $1', [userId]);
        
        if (currentUser.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const wasPro = currentUser.rows[0].is_pro;
        const isBecomingPro = !wasPro && is_pro;
        
        let proStartedAt = currentUser.rows[0].pro_started_at;
        let calculatedExpiration = pro_expires_at;
        
        // Handle pro_started_at and auto-calculate expiration
        if (is_pro) {
            if (pro_started_at) {
                // Admin is setting a start date
                proStartedAt = pro_started_at;
                
                // Auto-calculate expiration based on plan_type
                // Get plan_type from latest approved payment proof if not provided
                let planTypeToUse = plan_type;
                if (!planTypeToUse) {
                    const latestProof = await db.query(
                        `SELECT plan_type FROM payment_proofs 
                         WHERE user_id = $1 AND status = 'approved' 
                         ORDER BY reviewed_at DESC LIMIT 1`,
                        [userId]
                    );
                    if (latestProof.rows.length > 0) {
                        planTypeToUse = latestProof.rows[0].plan_type;
                    }
                }
                
                // Calculate expiration date based on plan type
                if (planTypeToUse && (planTypeToUse === 'monthly' || planTypeToUse === 'yearly')) {
                    const startDate = new Date(pro_started_at);
                    const expirationDate = new Date(startDate);
                    
                    if (planTypeToUse === 'yearly') {
                        expirationDate.setFullYear(expirationDate.getFullYear() + 1);
                    } else if (planTypeToUse === 'monthly') {
                        expirationDate.setMonth(expirationDate.getMonth() + 1);
                    }
                    
                    calculatedExpiration = expirationDate.toISOString().split('T')[0];
                }
            } else if (isBecomingPro && !proStartedAt) {
                // User is becoming Pro for the first time, set start date to now
                proStartedAt = new Date();
                
                // Try to get plan_type from latest payment proof to auto-calculate expiration
                const latestProof = await db.query(
                    `SELECT plan_type FROM payment_proofs 
                     WHERE user_id = $1 AND status = 'approved' 
                     ORDER BY reviewed_at DESC LIMIT 1`,
                    [userId]
                );
                
                if (latestProof.rows.length > 0) {
                    const planTypeToUse = latestProof.rows[0].plan_type;
                    const startDate = new Date();
                    const expirationDate = new Date(startDate);
                    
                    if (planTypeToUse === 'yearly') {
                        expirationDate.setFullYear(expirationDate.getFullYear() + 1);
                    } else if (planTypeToUse === 'monthly') {
                        expirationDate.setMonth(expirationDate.getMonth() + 1);
                    }
                    
                    calculatedExpiration = expirationDate.toISOString().split('T')[0];
                }
            }
        } else if (!is_pro) {
            // If user is no longer Pro, clear dates
            proStartedAt = null;
            calculatedExpiration = null;
        }

        const result = await db.query(
            `UPDATE users 
             SET full_name = $1, 
                 email = $2, 
                 status = $3,
                 is_pro = $4,
                 pro_expires_at = $5,
                 pro_started_at = $6,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $7
             RETURNING *`,
            [full_name, email, status === 'active', is_pro, calculatedExpiration, proStartedAt, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            ...result.rows[0],
            status: result.rows[0].status ? 'active' : 'inactive'
        });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// Delete user
router.delete('/users/:userId', requireAdmin, async (req, res) => {
    const { userId } = req.params;
    
    try {
        // Start a transaction
        await db.query('BEGIN');

        // Delete user's bookings
        await db.query('DELETE FROM bookings WHERE user_id = $1', [userId]);
        
        // Delete user's availability settings
        await db.query('DELETE FROM availability WHERE user_id = $1', [userId]);
        
        // Delete user's breaks
        await db.query('DELETE FROM breaks WHERE user_id = $1', [userId]);

        // Delete user's coupon usage
        await db.query('DELETE FROM coupon_usage WHERE user_id = $1', [userId]);
        
        // Update coupons created by this user (set created_by to NULL)
        await db.query('UPDATE coupons SET created_by = NULL WHERE created_by = $1', [userId]);
        
        // Delete the user
        await db.query('DELETE FROM users WHERE id = $1', [userId]);

        // Commit the transaction
        await db.query('COMMIT');
        
        res.json({ success: true });
    } catch (error) {
        // Rollback in case of error
        await db.query('ROLLBACK');
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// Update payment proof status (must come before /payment-proofs/:id/file)
router.put('/payment-proofs/:id/status', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        // Validate status
        if (!['pending', 'approved', 'rejected'].includes(status)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid status. Must be pending, approved, or rejected' 
            });
        }
        
        // Get payment proof details including plan_type and user_id
        const proofResult = await db.query(
            `SELECT user_id, plan_type, status as current_status 
             FROM payment_proofs 
             WHERE id = $1`,
            [id]
        );
        
        if (proofResult.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Payment proof not found' 
            });
        }
        
        const proof = proofResult.rows[0];
        const wasApproved = proof.current_status === 'approved';
        
        // Update payment proof status
        await db.query(
            `UPDATE payment_proofs 
             SET status = $1, 
                 reviewed_at = CURRENT_TIMESTAMP,
                 reviewed_by = $2
             WHERE id = $3`,
            [status, req.session.userId, id]
        );
        
        // If status is being set to 'approved', activate Pro subscription
        if (status === 'approved' && !wasApproved) {
            const userId = proof.user_id;
            const planType = proof.plan_type; // 'monthly' or 'yearly'
            
            // Calculate expiration date based on plan type
            const startDate = new Date();
            const expirationDate = new Date(startDate);
            
            if (planType === 'yearly') {
                expirationDate.setFullYear(expirationDate.getFullYear() + 1);
            } else if (planType === 'monthly') {
                expirationDate.setMonth(expirationDate.getMonth() + 1);
            }
            
            // Activate Pro subscription
            await db.query(
                `UPDATE users 
                 SET is_pro = true,
                     pro_started_at = COALESCE(pro_started_at, CURRENT_TIMESTAMP),
                     pro_expires_at = $1,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2`,
                [expirationDate, userId]
            );
        } else if (status === 'rejected' && wasApproved) {
            // If status is being changed from approved to rejected, deactivate Pro subscription
            // Only if this was the only approved payment proof
            const approvedCount = await db.query(
                `SELECT COUNT(*) as count 
                 FROM payment_proofs 
                 WHERE user_id = $1 AND status = 'approved' AND id != $2`,
                [proof.user_id, id]
            );
            
            if (parseInt(approvedCount.rows[0].count) === 0) {
                // No other approved payment proofs, deactivate Pro
                await db.query(
                    `UPDATE users 
                     SET is_pro = false,
                     updated_at = CURRENT_TIMESTAMP
                     WHERE id = $1`,
                    [proof.user_id]
                );
            }
        }
        
        res.json({ 
            success: true, 
            message: 'Payment proof status updated successfully' 
        });
    } catch (error) {
        console.error('Error updating payment proof status:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to update payment proof status' 
        });
    }
});

// Serve payment proof file
router.get('/payment-proofs/:id/file', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const proofResult = await db.query(
            'SELECT file_path, original_filename FROM payment_proofs WHERE id = $1',
            [id]
        );
        
        if (proofResult.rows.length === 0) {
            return res.status(404).json({ error: 'Payment proof not found' });
        }
        
        const proof = proofResult.rows[0];
        
        // Handle both absolute and relative paths
        let filePath;
        if (path.isAbsolute(proof.file_path)) {
            // If it's already an absolute path, use it directly
            filePath = proof.file_path;
        } else {
            // If it's relative, join with project root
            filePath = path.join(__dirname, '..', proof.file_path);
        }
        
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            console.error('File not found at path:', filePath);
            return res.status(404).json({ error: 'File not found at path: ' + filePath });
        }
        
        // Determine content type based on file extension
        const ext = path.extname(proof.original_filename).toLowerCase();
        const contentTypeMap = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.pdf': 'application/pdf'
        };
        const contentType = contentTypeMap[ext] || 'application/octet-stream';
        
        // Send file with proper content type
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${proof.original_filename}"`);
        res.sendFile(filePath);
    } catch (error) {
        console.error('Error serving payment proof file:', error);
        res.status(500).json({ error: 'Failed to serve payment proof file' });
    }
});

// Get system setting
router.get('/settings/:key', requireAdmin, async (req, res) => {
    try {
        const { key } = req.params;
        const result = await db.query(
            'SELECT setting_key, setting_value, description, updated_at FROM system_settings WHERE setting_key = $1',
            [key]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Setting not found' });
        }
        
        res.json({
            key: result.rows[0].setting_key,
            value: result.rows[0].setting_value === 'true',
            description: result.rows[0].description,
            updated_at: result.rows[0].updated_at
        });
    } catch (error) {
        console.error('Error fetching system setting:', error);
        res.status(500).json({ error: 'Failed to fetch system setting' });
    }
});

// Update system setting
router.put('/settings/:key', requireAdmin, async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;
        
        // Validate value is boolean
        if (typeof value !== 'boolean') {
            return res.status(400).json({ error: 'Value must be a boolean' });
        }
        
        const stringValue = value ? 'true' : 'false';
        
        const result = await db.query(
            `INSERT INTO system_settings (setting_key, setting_value, updated_by)
             VALUES ($1, $2, $3)
             ON CONFLICT (setting_key) 
             DO UPDATE SET setting_value = $2, updated_by = $3, updated_at = CURRENT_TIMESTAMP
             RETURNING setting_key, setting_value, updated_at`,
            [key, stringValue, req.session.userId]
        );
        
        res.json({
            key: result.rows[0].setting_key,
            value: result.rows[0].setting_value === 'true',
            updated_at: result.rows[0].updated_at
        });
    } catch (error) {
        console.error('Error updating system setting:', error);
        res.status(500).json({ error: 'Failed to update system setting' });
    }
});

module.exports = router; 