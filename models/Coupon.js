const db = require('../db');

class Coupon {
    static async create({ code, description, maxUses, expiresAt, createdBy }) {
        const result = await db.query(
            `INSERT INTO coupons (code, description, max_uses, expires_at, created_by)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [code, description, maxUses, expiresAt, createdBy]
        );
        return result.rows[0];
    }

    static async findByCode(code) {
        const result = await db.query(
            `SELECT * FROM coupons WHERE code = $1`,
            [code]
        );
        return result.rows[0];
    }

    static async validateCode(code) {
        const result = await db.query(
            `SELECT c.*, COUNT(cu.id) as actual_uses
             FROM coupons c
             LEFT JOIN coupon_usage cu ON c.id = cu.coupon_id
             WHERE c.code = $1
             GROUP BY c.id`,
            [code]
        );

        const coupon = result.rows[0];
        if (!coupon) {
            return { valid: false, message: 'Invalid coupon code' };
        }

        if (coupon.status === 'inactive') {
            return { valid: false, message: 'This coupon code is inactive' };
        }

        if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
            return { valid: false, message: 'This coupon code has expired' };
        }

        if (coupon.actual_uses >= coupon.max_uses) {
            return { valid: false, message: 'This coupon code has reached its maximum uses' };
        }

        return { valid: true, coupon };
    }

    static async useCoupon(couponId, userId, client = null) {
        const shouldManageTransaction = !client;
        const queryClient = client || await db.pool.connect();
        
        try {
            if (shouldManageTransaction) {
                await queryClient.query('BEGIN');
            }

            // Check if user has already used this coupon
            const usageCheck = await queryClient.query(
                'SELECT id FROM coupon_usage WHERE coupon_id = $1 AND user_id = $2',
                [couponId, userId]
            );

            if (usageCheck.rows.length > 0) {
                throw new Error('User has already used this coupon');
            }

            // Record coupon usage
            await queryClient.query(
                'INSERT INTO coupon_usage (coupon_id, user_id) VALUES ($1, $2)',
                [couponId, userId]
            );

            // Update current_uses count
            const result = await queryClient.query(
                `UPDATE coupons 
                 SET current_uses = current_uses + 1
                 WHERE id = $1
                 RETURNING *`,
                [couponId]
            );

            if (shouldManageTransaction) {
                await queryClient.query('COMMIT');
            }
            return result.rows[0];
        } catch (error) {
            if (shouldManageTransaction) {
                await queryClient.query('ROLLBACK');
            }
            throw error;
        } finally {
            if (shouldManageTransaction) {
                queryClient.release();
            }
        }
    }

    static async list(filters = {}) {
        let query = `
            SELECT c.*, 
                   COUNT(DISTINCT cu.id) as actual_uses,
                   json_agg(json_build_object(
                       'user_id', u.id,
                       'name', u.name,
                       'email', u.email,
                       'used_at', cu.used_at
                   )) FILTER (WHERE u.id IS NOT NULL) as usage_details
            FROM coupons c
            LEFT JOIN coupon_usage cu ON c.id = cu.coupon_id
            LEFT JOIN users u ON cu.user_id = u.id
        `;

        const whereConditions = [];
        const params = [];
        let paramCount = 1;

        if (filters.status) {
            whereConditions.push(`c.status = $${paramCount}`);
            params.push(filters.status);
            paramCount++;
        }

        if (filters.code) {
            whereConditions.push(`c.code ILIKE $${paramCount}`);
            params.push(`%${filters.code}%`);
            paramCount++;
        }

        if (filters.showExpired === false) {
            whereConditions.push(`(c.expires_at IS NULL OR c.expires_at > CURRENT_TIMESTAMP)`);
        }

        if (whereConditions.length > 0) {
            query += ` WHERE ${whereConditions.join(' AND ')}`;
        }

        query += ` GROUP BY c.id ORDER BY c.created_at DESC`;

        const result = await db.query(query, params);
        return result.rows;
    }

    static async update(id, updates) {
        const validFields = ['code', 'description', 'max_uses', 'status', 'expires_at'];
        const setFields = [];
        const values = [];
        let paramCount = 1;

        Object.keys(updates).forEach(field => {
            if (validFields.includes(field) && updates[field] !== undefined) {
                setFields.push(`${field} = $${paramCount}`);
                values.push(updates[field]);
                paramCount++;
            }
        });

        if (setFields.length === 0) return null;

        values.push(id);
        const query = `
            UPDATE coupons 
            SET ${setFields.join(', ')}
            WHERE id = $${paramCount}
            RETURNING *
        `;

        const result = await db.query(query, values);
        return result.rows[0];
    }

    static async delete(id) {
        // Soft delete by setting status to inactive
        const result = await db.query(
            `UPDATE coupons 
             SET status = 'inactive'
             WHERE id = $1
             RETURNING *`,
            [id]
        );
        return result.rows[0];
    }
}

module.exports = Coupon; 