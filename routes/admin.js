const express = require('express');
const router = express.Router();
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

        res.render('admin/dashboard', {
            stats: {
                totalUsers: parseInt(usersCount.rows[0].count),
                totalBookings: parseInt(bookingsCount.rows[0].count),
                todayBookings: parseInt(todayBookings.rows[0].count),
                activeUsers: parseInt(activeUsers.rows[0].count)
            },
            path: '/admin'
        });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.status(500).send('Server error');
    }
});

// List users with search, filter, and pagination
router.get('/users/data', requireAdmin, async (req, res) => {
    const { page = 1, search = '', status = 'all' } = req.query;
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
                is_admin 
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
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
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
        console.error('Error fetching user details:', error);
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
        console.error('Error updating user status:', error);
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
        console.error('Error updating admin status:', error);
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
        console.error('Error fetching stats:', error);
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
        console.error('Error fetching user bookings:', error);
        res.status(500).json({ error: 'Failed to fetch user bookings' });
    }
});

// Render the admin user management UI
router.get('/users', requireAdmin, (req, res) => {
    const filters = {
        search: req.query.search || '',
        status: req.query.status || ''
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
        console.error('Error fetching coupons:', error);
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
        console.error('Error creating coupon:', error);
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
        console.error('Error updating coupon:', error);
        res.status(500).json({ error: 'Failed to update coupon' });
    }
});

router.delete('/coupons/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await Coupon.delete(id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting coupon:', error);
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
                       'name', u.name,
                       'email', u.email,
                       'used_at', cu.used_at
                   ) ORDER BY cu.used_at DESC) FILTER (WHERE u.id IS NOT NULL) as usage_details
            FROM coupons c
            LEFT JOIN coupon_usage cu ON c.id = cu.coupon_id
            LEFT JOIN users u ON cu.user_id = u.id
            WHERE c.id = $1
            GROUP BY c.id
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).send('Coupon not found');
        }

        res.render('admin/coupon-usage', { 
            coupon: result.rows[0],
            path: '/admin/coupons'
        });
    } catch (error) {
        console.error('Error fetching coupon usage:', error);
        res.status(500).send('Server error');
    }
});

// Update user
router.put('/users/:userId', requireAdmin, async (req, res) => {
    const { userId } = req.params;
    const { full_name, email, status } = req.body;
    
    try {
        // Convert status string to boolean
        const statusBool = status === 'active';
        
        await db.query(
            'UPDATE users SET full_name = $1, email = $2, status = $3 WHERE id = $4',
            [full_name, email, statusBool, userId]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// Delete user
router.delete('/users/:userId', requireAdmin, async (req, res) => {
    const { userId } = req.params;
    
    try {
        await db.query('DELETE FROM users WHERE id = $1', [userId]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

module.exports = router; 