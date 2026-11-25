const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const TOKEN_TTL_SECONDS = 60 * 60 * 24;
const COOKIE_NAME = 'merchant_session';

function getSessionSecret() {
    if (!process.env.SESSION_SECRET) {
        const error = new Error('Account sign-in is not configured. Set SESSION_SECRET in the project .env file.');
        error.status = 503;
        throw error;
    }
    return process.env.SESSION_SECRET;
}

function assertSessionConfigured() {
    getSessionSecret();
}

async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = await scrypt(password, salt, 64);
    return `scrypt$${salt}$${derivedKey.toString('hex')}`;
}

async function verifyPassword(password, storedValue) {
    const [algorithm, salt, storedHex] = storedValue.split('$');
    if (algorithm !== 'scrypt' || !salt || !storedHex) {
        // Upgrade accounts created before password hashing at their next successful login.
        const provided = Buffer.from(password);
        const legacy = Buffer.from(storedValue);
        return provided.length === legacy.length && crypto.timingSafeEqual(provided, legacy);
    }

    const expected = Buffer.from(storedHex, 'hex');
    const actual = await scrypt(password, salt, expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function createSessionToken(userId) {
    const issuedAt = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({ sub: String(userId), iat: issuedAt, exp: issuedAt + TOKEN_TTL_SECONDS })).toString('base64url');
    const signature = crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
    return `${payload}.${signature}`;
}

function readSessionToken(token) {
    const [payload, suppliedSignature] = (token || '').split('.');
    if (!payload || !suppliedSignature) return null;

    const expectedSignature = crypto.createHmac('sha256', getSessionSecret()).update(payload).digest();
    let actualSignature;
    try {
        actualSignature = Buffer.from(suppliedSignature, 'base64url');
    } catch {
        return null;
    }
    if (actualSignature.length !== expectedSignature.length || !crypto.timingSafeEqual(actualSignature, expectedSignature)) return null;

    try {
        const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
        if (!claims.sub || !Number.isInteger(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) return null;
        return { userId: claims.sub };
    } catch {
        return null;
    }
}

function setSessionCookie(res, userId) {
    const token = createSessionToken(userId);
    const options = ['Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${TOKEN_TTL_SECONDS}`];
    if (process.env.NODE_ENV === 'production') options.push('Secure');
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; ${options.join('; ')}`);
}

function clearSessionCookie(res) {
    const options = ['Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
    if (process.env.NODE_ENV === 'production') options.push('Secure');
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; ${options.join('; ')}`);
}

function authenticate(req, res, next) {
    try {
        assertSessionConfigured();
    } catch (error) {
        return res.status(error.status).json({ message: error.message });
    }

    const cookies = (req.headers.cookie || '').split(';').map((part) => part.trim());
    const sessionCookie = cookies.find((part) => part.startsWith(`${COOKIE_NAME}=`));
    const session = readSessionToken(sessionCookie?.slice(COOKIE_NAME.length + 1));
    if (!session) return res.status(401).json({ message: 'Please sign in to continue.' });
    req.userId = session.userId;
    return next();
}

module.exports = { assertSessionConfigured, authenticate, clearSessionCookie, hashPassword, setSessionCookie, verifyPassword };
