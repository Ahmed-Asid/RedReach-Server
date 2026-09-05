const { auth } = require("../lib/auth");

async function requireAuth(req, res, next) {
    try {
        const session = await auth.api.getSession({
            headers: new Headers(req.headers),
        });

        if (!session?.user) {
            return res.status(401).json({
                message: "Unauthorized.",
            });
        }

        req.user = session.user;
        req.session = session;

        next();
    } catch (error) {
        console.error("Authentication error:", error);

        return res.status(401).json({
            message: "Invalid or expired session.",
        });
    }
}

function requireActiveUser(req, res, next) {
    if (req.user.status !== "active") {
        return res.status(403).json({
            message: "Your account is blocked.",
        });
    }

    next();
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                message: "You do not have permission to perform this action.",
            });
        }

        next();
    };
}

module.exports = {
    requireAuth,
    requireActiveUser,
    requireRole,
};