const db = require('../db');

async function isRecurringClientsEnabled(userId) {
    const result = await db.query(
        'SELECT recurring_clients_enabled FROM users WHERE id = $1',
        [userId]
    );
    if (result.rows.length === 0) return false;
    return result.rows[0].recurring_clients_enabled === true;
}

module.exports = {
    isRecurringClientsEnabled
};
