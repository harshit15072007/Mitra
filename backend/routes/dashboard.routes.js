const express = require('express');
const mongoose = require('mongoose');
const Sale = require('../models/sale.models');
const User = require('../models/user.models');
const InventoryItem = require('../models/inventory.models');
const DailyBriefing = require('../models/dailybriefing.models');
const Campaign = require('../models/campaign.models');
const PurchaseOrder = require('../models/purchaseorder.models');
const Notification = require('../models/notification.models');
const askBusinessAI = require('../services/ai.services');
const getRestockRecommendations = require('../services/restock.services');

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
                    _id: { $toLower: { $trim: { input: '$product' } } },
                    productName: { $first: '$product' },
                    units: { $sum: '$quantity' },
                    revenue: { $sum: '$amount' },
                } },
                { $sort: { revenue: -1, units: -1, _id: 1 } },
                { $limit: 5 },
            ],
            productSales: [
                { $group: {
                    _id: { $toLower: { $trim: { input: '$product' } } },
                    productName: { $first: '$product' },
                    units: { $sum: '$quantity' },
                    revenue: { $sum: '$amount' },
                    orders: { $sum: 1 },
                } },
                { $sort: { units: -1, revenue: -1, _id: 1 } },
                { $limit: 100 },
            ],
        } },
    ]);

    return {
        summary: result?.summary?.[0] || { sales: 0, orders: 0, products: 0 },
        trend: result?.trend || [],
        topProducts: result?.topProducts || [],
        productSales: result?.productSales || [],
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

router.get('/daily-briefing', async (req, res) => {
    const localDay = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());
    const dayKey = `${localDay}-case-insensitive-products-v1`;
    const refresh = req.query.refresh === '1';

    try {
        if (!refresh) {
            const cached = await DailyBriefing.findOne({ merchantId: req.userId, dayKey }).lean();
            if (cached) return res.json({ briefing: cached.briefing, generatedAt: cached.generatedAt, cached: true });
        }

        const merchant = await User.findById(req.userId).select('profession').lean();
        if (!merchant) return res.status(401).json({ message: 'Please sign in to continue.' });

        const [insights, inventory] = await Promise.all([
            aggregateSalesInsights(req.userId, '7d'),
            InventoryItem.find({ merchantId: req.userId })
                .sort({ quantity: 1 })
                .limit(100)
                .select('product quantity lowStockThreshold')
                .lean(),
        ]);
        const inventorySummary = inventory.map((item) => ({
            product: item.product,
            quantity: item.quantity,
            lowStockThreshold: item.lowStockThreshold,
            lowStock: item.quantity <= item.lowStockThreshold,
        }));
        const briefing = await askBusinessAI(
            'Prepare today’s concise business briefing for this merchant. Return exactly three plain-text lines using these labels: Recent sales: (7-day sales, order and unit totals, and top product if available); Stock watch: (only items at or below their refill threshold, or say no stock alerts); Today’s action: (one practical action based on the available data). If data is missing, state that plainly and give a useful setup action. Separate recorded facts from suggested actions. Do not invent comparisons or trends. Do not add an introduction, Markdown, or extra sections.',
            {
                profession: merchant.profession || 'General retailer',
                period: RANGE_LABELS['7d'],
                ...insights.summary,
                topProducts: insights.topProducts.map((product) => ({
                    product: product.productName || product._id,
                    units: product.units,
                    revenue: product.revenue,
                })),
                inventory: inventorySummary,
            },
        );
        const generatedAt = new Date();
        let saved;
        try {
            saved = await DailyBriefing.findOneAndUpdate(
                { merchantId: req.userId, dayKey },
                { $set: { briefing, generatedAt } },
                { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
            ).lean();
        } catch (error) {
            if (error.code !== 11000) throw error;
            saved = await DailyBriefing.findOne({ merchantId: req.userId, dayKey }).lean();
        }
        return res.json({ briefing: saved?.briefing || briefing, generatedAt: saved?.generatedAt || generatedAt, cached: false });
    } catch (error) {
        return res.status(error.status || 502).json({ message: error.message || 'Could not prepare your daily business briefing.' });
    }
});

router.post('/promotion-plan', async (req, res) => {
    try {
        const merchant = await User.findById(req.userId).select('profession').lean();
        if (!merchant) return res.status(401).json({ message: 'Please sign in to continue.' });

        const inventory = await InventoryItem.find({ merchantId: req.userId })
            .sort({ quantity: -1 })
            .limit(100)
            .select('product productKey quantity lowStockThreshold')
            .lean();
        if (!inventory.length) {
            return res.json({ plan: 'Add products to your Inventory page first. Mitra will then compare their stock with recent sales and suggest safe promotion ideas.', periodLabel: 'Last 30 days' });
        }

        const periodStart = new Date();
        periodStart.setUTCHours(0, 0, 0, 0);
        periodStart.setUTCDate(periodStart.getUTCDate() - 29);
        const salesByProduct = await Sale.aggregate([
            { $match: { merchantId: new mongoose.Types.ObjectId(req.userId), createdAt: { $gte: periodStart } } },
            { $group: {
                _id: { $toLower: { $trim: { input: '$product' } } },
                unitsSold: { $sum: '$quantity' },
                revenue: { $sum: '$amount' },
            } },
        ]);
        const salesMap = new Map(salesByProduct.map((item) => [item._id, item]));
        const inventoryWithSales = inventory.map((item) => {
            const productKey = item.productKey || item.product.trim().toLocaleLowerCase('en');
            const sales = salesMap.get(productKey) || { unitsSold: 0, revenue: 0 };
            const safePromotionStock = Math.max(item.lowStockThreshold + 2, Math.ceil(item.lowStockThreshold * 1.5));
            return {
                product: item.product,
                quantity: item.quantity,
                lowStockThreshold: item.lowStockThreshold,
                unitsSoldLast30Days: sales.unitsSold,
                revenueLast30Days: sales.revenue,
                lowStock: item.quantity <= item.lowStockThreshold,
                promotionReady: item.quantity >= safePromotionStock,
            };
        });
        const promotionCandidates = inventoryWithSales
            .filter((item) => item.promotionReady)
            .sort((a, b) => a.unitsSoldLast30Days - b.unitsSoldLast30Days || a.revenueLast30Days - b.revenueLast30Days)
            .slice(0, 8);

        if (!promotionCandidates.length) {
            return res.json({
                plan: 'None of your tracked products currently have enough stock above their refill threshold for a safe promotion. Restock or build a larger stock cushion, then generate a new plan.',
                periodLabel: 'Last 30 days',
                targetProduct: null,
            });
        }

        const targetProduct = promotionCandidates[0];
        const plan = await askBusinessAI(
            'Create one stock-aware promotion campaign for the single product in eligibleProduct. This product has a safe stock cushion and is the slowest recent seller among eligible tracked products. Do not suggest a different product. Include a short reason using its recorded stock and 30-day unit sales, one practical campaign idea tailored to the merchant profession, a concise ready-to-use promotional message, and one simple success measure. Prefer low-cost ideas. Do not invent discounts, budgets, customer demographics, locations, or expected results, and do not promise sales growth. If there is not enough product or sales data, say so clearly.',
            {
                profession: merchant.profession || 'General retailer',
                period: 'Last 30 days',
                eligibleProduct: targetProduct,
            },
        );
        return res.json({ plan, periodLabel: 'Last 30 days', targetProduct: targetProduct.product });
    } catch (error) {
        return res.status(error.status || 502).json({ message: error.message || 'Could not create a promotion plan.' });
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
            .select('product quantity lowStockThreshold supplierName leadTimeDays')
            .lean();
        const customerGroups = await Sale.aggregate([
            { $match: { ...salesMatchFor(req.userId, range), customerId: { $exists: true, $ne: null } } },
            { $group: {
                _id: '$customerId',
                name: { $first: '$customerName' },
                orders: { $sum: 1 },
                revenue: { $sum: '$amount' },
                units: { $sum: '$quantity' },
                lastPurchase: { $max: '$createdAt' },
                products: { $addToSet: '$product' },
            } },
            { $sort: { orders: -1, revenue: -1 } },
        ]);
        const customerInsights = {
            customersWithRecordedPurchases: customerGroups.length,
            repeatCustomers: customerGroups.filter((customer) => customer.orders > 1).length,
            repeatCustomerRevenue: customerGroups.filter((customer) => customer.orders > 1).reduce((sum, customer) => sum + customer.revenue, 0),
            topCustomers: customerGroups.slice(0, 10).map((customer) => ({
                name: customer.name || 'Customer',
                orders: customer.orders,
                revenue: customer.revenue,
                units: customer.units,
                products: customer.products.slice(0, 10),
                lastPurchase: customer.lastPurchase,
            })),
        };
        const [campaigns, campaignTotals, purchaseOrders, restockRecommendations, notifications, latestSales] = await Promise.all([
            Campaign.find({ merchantId: req.userId }).sort({ createdAt: -1 }).limit(100).lean(),
            Sale.aggregate([
                { $match: { ...salesMatchFor(req.userId, range), campaignId: { $exists: true, $ne: null } } },
                { $group: {
                    _id: '$campaignId',
                    orders: { $sum: 1 },
                    units: { $sum: '$quantity' },
                    revenue: { $sum: '$amount' },
                } },
            ]),
            PurchaseOrder.find({ merchantId: req.userId })
                .sort({ createdAt: -1 }).limit(100)
                .select('product quantity receivedQuantity supplierName leadTimeDays status createdAt orderedAt receivedAt')
                .lean(),
            getRestockRecommendations(req.userId),
            Notification.find({ merchantId: req.userId })
                .sort({ createdAt: -1 }).limit(20)
                .select('type product quantity threshold message readAt createdAt')
                .lean(),
            Sale.find(salesMatchFor(req.userId, range))
                .sort({ createdAt: -1 }).limit(20)
                .select('product quantity amount createdAt customerName campaignId')
                .populate('campaignId', 'name')
                .lean(),
        ]);
        const campaignTotalsById = new Map(campaignTotals.map((entry) => [entry._id.toString(), entry]));
        const campaignInsights = campaigns.map((campaign) => {
            const metrics = campaignTotalsById.get(campaign._id.toString()) || { orders: 0, units: 0, revenue: 0 };
            return {
                name: campaign.name,
                product: campaign.product,
                status: campaign.status,
                promotionText: campaign.promotionText,
                spend: campaign.spend,
                ...metrics,
                revenueToSpend: campaign.spend > 0 ? metrics.revenue / campaign.spend : null,
            };
        });
        const answer = await askBusinessAI(question, {
            profession: merchant.profession || 'General retailer',
            period: RANGE_LABELS[range],
            ...insights.summary,
            topProducts: insights.topProducts.map((product) => ({
                product: product.productName || product._id,
                units: product.units,
                revenue: product.revenue,
            })),
            productSales: insights.productSales.map((product) => ({
                product: product.productName || product._id,
                units: product.units,
                revenue: product.revenue,
                orders: product.orders,
            })),
            salesTrend: insights.trend,
            latestSales: latestSales.map((sale) => ({
                product: sale.product,
                quantity: sale.quantity,
                amount: sale.amount,
                createdAt: sale.createdAt,
                customerName: sale.customerName || null,
                campaignName: sale.campaignId?.name || null,
            })),
            inventory: inventory.map((item) => ({
                product: item.product,
                quantity: item.quantity,
                lowStockThreshold: item.lowStockThreshold,
                lowStock: item.quantity <= item.lowStockThreshold,
                supplierName: item.supplierName,
                leadTimeDays: item.leadTimeDays ?? 7,
            })),
            customerInsights,
            campaignInsights,
            purchaseOrders: purchaseOrders.map((order) => ({
                product: order.product,
                quantity: order.quantity,
                receivedQuantity: order.receivedQuantity,
                supplierName: order.supplierName,
                leadTimeDays: order.leadTimeDays,
                status: order.status,
                createdAt: order.createdAt,
            })),
            restockRecommendations,
            notifications: notifications.map((notification) => ({
                type: notification.type,
                product: notification.product,
                quantity: notification.quantity,
                threshold: notification.threshold,
                message: notification.message,
                read: Boolean(notification.readAt),
                createdAt: notification.createdAt,
            })),
        }, history);
        return res.json({ answer, periodLabel: RANGE_LABELS[range] });
    } catch (error) {
        return res.status(error.status || 502).json({ error: error.message || 'The AI assistant could not answer right now.' });
    }
});

module.exports = router;
