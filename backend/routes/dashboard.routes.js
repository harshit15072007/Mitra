const express = require('express');
const mongoose = require('mongoose');
const Sale = require('../models/sale.models');
const User = require('../models/user.models');
const InventoryItem = require('../models/inventory.models');
const askBusinessAI = require('../services/ai.services');

const router = express.Router();
const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 };
const RANGE_LABELS = {
    '7d': 'Last 7 days',
    '30d': 'Last 30 days',
    '90d': 'Last 90 days',
    all: 'All time',
};

function isValidRange(range) {
    return range === 'all' || Object.hasOwn(RANGE_DAYS, range);
}

function salesMatchFor(userId, range) {
    const match = { merchantId: new mongoose.Types.ObjectId(userId) };
    if (range !== 'all') {
        const start = new Date();
        start.setUTCHours(0, 0, 0, 0);
        start.setUTCDate(start.getUTCDate() - (RANGE_DAYS[range] - 1));
        match.createdAt = { $gte: start };
    }
    return match;
}

async function aggregateSalesInsights(userId, range) {
    const [result] = await Sale.aggregate([
        { $match: salesMatchFor(userId, range) },
        { $facet: {
            summary: [
                { $group: {
                    _id: null,
                    sales: { $sum: '$amount' },
                    orders: { $sum: 1 },
                    products: { $sum: '$quantity' },
                } },
                { $project: { _id: 0, sales: 1, orders: 1, products: 1 } },
            ],
            trend: [
                { $group: {
                    _id: { $dateToString: { format: range === 'all' ? '%Y-%m' : '%Y-%m-%d', date: '$createdAt' } },
                    sales: { $sum: '$amount' },
                } },
                { $sort: { _id: 1 } },
            ],
            topProducts: [
                { $group: {
                    _id: '$product',
                    units: { $sum: '$quantity' },
                    revenue: { $sum: '$amount' },
                } },
                { $sort: { revenue: -1, units: -1, _id: 1 } },
                { $limit: 5 },
            ],
        } },
    ]);

    return {
        summary: result?.summary?.[0] || { sales: 0, orders: 0, products: 0 },
        trend: result?.trend || [],
        topProducts: result?.topProducts || [],
    };
}

router.get('/insights', async (req, res) => {
    const range = typeof req.query.range === 'string' ? req.query.range : '30d';
    if (!isValidRange(range)) return res.status(400).json({ message: 'Choose 7d, 30d, 90d, or all for the date range.' });

    try {
        const insights = await aggregateSalesInsights(req.userId, range);
        return res.json({ range, periodLabel: RANGE_LABELS[range], ...insights });
    } catch (error) {
        return res.status(500).json({ message: 'Could not load sales insights.' });
    }
});

router.get('/dashboard', async (req, res) => {
    try {
        const [totals] = await Sale.aggregate([
            { $match: { merchantId: new mongoose.Types.ObjectId(req.userId) } },
            { $group: {
                _id: null,
                sales: { $sum: '$amount' },
                orders: { $sum: 1 },
                products: { $sum: '$quantity' },
            } },
        ]);

        return res.json({ sales: totals?.sales || 0, orders: totals?.orders || 0, products: totals?.products || 0 });
    } catch (error) {
        return res.status(500).json({ message: 'Could not load the business dashboard.' });
    }
});

router.post('/ask-ai', async (req, res) => {
    const body = req.body || {};
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    const range = typeof body.range === 'string' ? body.range : '30d';
    const history = Array.isArray(body.history)
        ? body.history.filter((entry) => entry && ['user', 'assistant'].includes(entry.role) && typeof entry.content === 'string')
            .slice(-8)
            .map((entry) => ({ role: entry.role, content: entry.content.trim().slice(0, 1200) }))
            .filter((entry) => entry.content)
        : [];
    if (!question) return res.status(400).json({ error: 'Enter a question.' });
    if (!isValidRange(range)) return res.status(400).json({ error: 'Choose 7d, 30d, 90d, or all for the date range.' });

    try {
        const merchant = await User.findById(req.userId).select('profession');
        if (!merchant) return res.status(401).json({ error: 'Please sign in to continue.' });
        const insights = await aggregateSalesInsights(req.userId, range);
        const inventory = await InventoryItem.find({ merchantId: req.userId })
            .sort({ quantity: 1 })
            .limit(100)
            .select('product quantity lowStockThreshold')
            .lean();
        const answer = await askBusinessAI(question, {
            profession: merchant.profession || 'General retailer',
            period: RANGE_LABELS[range],
            ...insights.summary,
            topProducts: insights.topProducts.map((product) => ({
                product: product._id,
                units: product.units,
                revenue: product.revenue,
            })),
            inventory: inventory.map((item) => ({
                product: item.product,
                quantity: item.quantity,
                lowStockThreshold: item.lowStockThreshold,
                lowStock: item.quantity <= item.lowStockThreshold,
            })),
        }, history);
        return res.json({ answer, periodLabel: RANGE_LABELS[range] });
    } catch (error) {
        return res.status(error.status || 502).json({ error: error.message || 'The AI assistant could not answer right now.' });
    }
});

module.exports = router;
