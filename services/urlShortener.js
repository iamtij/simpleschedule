const db = require('../db');

class UrlShortenerService {
    constructor() {
        this.baseUrl = process.env.BASE_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://isked.app');
        this.shortCodeLength = 6;
    }

    /**
     * Generate a random short code
     * @returns {string} Random alphanumeric code
     */
    generateShortCode() {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < this.shortCodeLength; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    /**
     * Create a short URL for the given original URL
     * @param {string} originalUrl - The full URL to shorten
     * @param {number} bookingId - Associated booking ID (optional)
     * @param {number} userId - User ID who created the short URL
     * @param {number} expirationDays - Days until expiration (default: 30)
     * @returns {Promise<string>} Short URL
     */
    async shortenUrl(originalUrl, bookingId = null, userId = null, expirationDays = 30) {
        if (!originalUrl) {
            throw new Error('Original URL is required');
        }

        // Generate unique short code
        let code;
        let attempts = 0;
        const maxAttempts = 10;
        let existing;

        do {
            code = this.generateShortCode();
            attempts++;
            
            if (attempts > maxAttempts) {
                throw new Error('Unable to generate unique short code');
            }

            // Check if code already exists
            existing = await db.query(
                'SELECT id FROM short_urls WHERE code = $1',
                [code]
            );
        } while (existing.rows.length > 0);

        // Calculate expiration date
        const expiresAt = expirationDays > 0 
            ? new Date(Date.now() + (expirationDays * 24 * 60 * 60 * 1000))
            : null;

        // Insert into database
        await db.query(
            `INSERT INTO short_urls (code, original_url, booking_id, user_id, expires_at) 
             VALUES ($1, $2, $3, $4, $5)`,
            [code, originalUrl, bookingId, userId, expiresAt]
        );

        return `${this.baseUrl}/s/${code}`;
    }

    /**
     * Resolve a short code to its original URL
     * @param {string} code - Short code to resolve
     * @returns {Promise<string|null>} Original URL or null if not found/expired
     */
    async resolveUrl(code) {
        if (!code) {
            return null;
        }

        const result = await db.query(
            `SELECT original_url, expires_at FROM short_urls 
             WHERE code = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
            [code]
        );

        if (result.rows.length === 0) {
            return null;
        }

        const { original_url, expires_at } = result.rows[0];

        // Increment click count and update last clicked timestamp
        await db.query(
            `UPDATE short_urls 
             SET click_count = click_count + 1, last_clicked_at = NOW() 
             WHERE code = $1`,
            [code]
        );

        return original_url;
    }

    /**
     * Get analytics for a short URL
     * @param {string} code - Short code
     * @returns {Promise<Object|null>} Analytics data
     */
    async getAnalytics(code) {
        const result = await db.query(
            `SELECT code, original_url, click_count, created_at, last_clicked_at, expires_at
             FROM short_urls WHERE code = $1`,
            [code]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return result.rows[0];
    }

    /**
     * Get all short URLs for a user
     * @param {number} userId - User ID
     * @returns {Promise<Array>} Array of short URLs
     */
    async getUserShortUrls(userId) {
        const result = await db.query(
            `SELECT code, original_url, click_count, created_at, last_clicked_at, expires_at
             FROM short_urls 
             WHERE user_id = $1 
             ORDER BY created_at DESC`,
            [userId]
        );

        return result.rows;
    }

    /**
     * Delete a short URL
     * @param {string} code - Short code to delete
     * @param {number} userId - User ID (for authorization)
     * @returns {Promise<boolean>} Success status
     */
    async deleteShortUrl(code, userId) {
        const result = await db.query(
            'DELETE FROM short_urls WHERE code = $1 AND user_id = $2',
            [code, userId]
        );

        return result.rowCount > 0;
    }

    /**
     * Clean up expired short URLs
     * @returns {Promise<number>} Number of URLs cleaned up
     */
    async cleanupExpiredUrls() {
        const result = await db.query(
            'DELETE FROM short_urls WHERE expires_at IS NOT NULL AND expires_at < NOW()'
        );

        return result.rowCount;
    }
}

module.exports = new UrlShortenerService();
