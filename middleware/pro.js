const { checkUserAccess } = require('../utils/subscription');

async function requirePro(req, res, next) {
    // Check if user is logged in
    if (!req.session.user || !req.session.userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        // Fetch fresh Pro status from DB (session can be stale after admin updates)
        const access = await checkUserAccess(req.session.userId);

        if (!access.isPro || !access.hasAccess) {
            return res.status(403).json({
                error: 'Pro subscription required',
                code: 'SUBSCRIPTION_REQUIRED'
            });
        }

        // Keep session in sync with DB
        req.session.user.is_pro = access.isPro;
        req.session.user.isPro = access.isPro;
        next();
    } catch (err) {
        console.error('requirePro error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = {
    requirePro
}; 