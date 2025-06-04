// Authentication middleware
function isAuthenticated(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    res.redirect('/auth/login');
}

// Admin authorization middleware
function isAdmin(req, res, next) {
    if (
        req.session.user &&
        (req.session.user.email === 'tjtalusan@gmail.com' || req.session.user.is_admin)
    ) {
        return next();
    }
    return res.status(403).send('Forbidden');
}

module.exports = {
    isAuthenticated,
    isAdmin
}; 