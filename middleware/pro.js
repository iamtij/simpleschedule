function requirePro(req, res, next) {
    // Check if user is logged in
    if (!req.session.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if user is pro and subscription hasn't expired
    if (!req.session.user.is_pro || 
        (req.session.user.pro_expires_at && new Date(req.session.user.pro_expires_at) < new Date())) {
        return res.status(403).json({ 
            error: 'Pro subscription required',
            code: 'SUBSCRIPTION_REQUIRED'
        });
    }

    next();
}

module.exports = {
    requirePro
}; 