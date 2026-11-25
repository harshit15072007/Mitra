const express = require('express');
const User = require('../models/user.models');
const { assertSessionConfigured, authenticate, clearSessionCookie, hashPassword, setSessionCookie, verifyPassword } = require('../services/auth.services');

const router = express.Router();

function publicUser(user) {
    return {
        id: String(user._id),
        username: user.username,
        email: user.email,
        profession: user.profession || 'General retailer',
    };
}

router.post('/register', async (req, res) => {
    try {
        assertSessionConfigured();
    } catch (error) {
        return res.status(error.status).json({ message: error.message });
    }
    const body = req.body || {};
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const profession = typeof body.profession === 'string' ? body.profession.trim() : '';

    if (username.length < 2 || username.length > 50) return res.status(400).json({ message: 'Username must be between 2 and 50 characters.' });
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: 'Enter a valid email address.' });
    if (password.length < 8 || password.length > 128) return res.status(400).json({ message: 'Password must be between 8 and 128 characters.' });
    if (profession.length < 2 || profession.length > 80) return res.status(400).json({ message: 'Enter a business type between 2 and 80 characters.' });

    try {
        const user = await User.create({ username, email, profession, password: await hashPassword(password) });
        setSessionCookie(res, user._id);
        return res.status(201).json({ message: 'Account created.', user: publicUser(user) });
    } catch (error) {
        if (error.status === 503) return res.status(error.status).json({ message: error.message });
        if (error.code === 11000) return res.status(409).json({ message: 'That username or email is already registered.' });
        return res.status(500).json({ message: 'Could not create the account.' });
    }
});

router.post('/login', async (req, res) => {
    const body = req.body || {};
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password) return res.status(400).json({ message: 'Enter your email and password.' });

    try {
        const user = await User.findOne({ email }).select('+password');
        if (!user || !(await verifyPassword(password, user.password))) {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }
        if (!user.password.startsWith('scrypt$')) {
            user.password = await hashPassword(password);
            await user.save();
        }
        setSessionCookie(res, user._id);
        return res.json({ message: 'Signed in.', user: publicUser(user) });
    } catch (error) {
        if (error.status === 503) return res.status(error.status).json({ message: error.message });
        return res.status(500).json({ message: 'Could not sign in right now.' });
    }
});

router.get('/me', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) return res.status(401).json({ message: 'Please sign in to continue.' });
        return res.json({ user: publicUser(user) });
    } catch (error) {
        return res.status(500).json({ message: 'Could not load your account.' });
    }
});

router.patch('/profile', authenticate, async (req, res) => {
    const profession = typeof req.body?.profession === 'string' ? req.body.profession.trim() : '';
    if (profession.length < 2 || profession.length > 80) {
        return res.status(400).json({ message: 'Enter a business type between 2 and 80 characters.' });
    }

    try {
        const user = await User.findByIdAndUpdate(
            req.userId,
            { $set: { profession } },
            { new: true, runValidators: true },
        );
        if (!user) return res.status(401).json({ message: 'Please sign in to continue.' });
        return res.json({ message: 'Business type updated.', user: publicUser(user) });
    } catch {
        return res.status(500).json({ message: 'Could not update your business type.' });
    }
});

router.post('/logout', (req, res) => {
    clearSessionCookie(res);
    return res.json({ message: 'Signed out.' });
});

module.exports = router;
