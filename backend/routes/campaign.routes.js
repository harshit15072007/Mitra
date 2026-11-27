const express = require('express');
const mongoose = require('mongoose');
const Campaign = require('../models/campaign.models');
const InventoryItem = require('../models/inventory.models');
const Sale = require('../models/sale.models');

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const campaigns = await Campaign.find({ merchantId: req.userId })
            .sort({ createdAt: -1 })
            .lean();
        const campaignIds = campaigns.map((campaign) => campaign._id);
        const totals = campaignIds.length
            ? await Sale.aggregate([
                { $match: { merchantId: new mongoose.Types.ObjectId(req.userId), campaignId: { $in: campaignIds } } },
                { $group: {
                    _id: '$campaignId',
                    revenue: { $sum: '$amount' },
                    orders: { $sum: 1 },
                    units: { $sum: '$quantity' },
                } },
            ])
            : [];
        const totalsById = new Map(totals.map((item) => [item._id.toString(), item]));
        return res.json({
            campaigns: campaigns.map((campaign) => {
                const result = totalsById.get(campaign._id.toString()) || { revenue: 0, orders: 0, units: 0 };
                return {
                    ...campaign,
                    results: {
                        ...result,
                        revenueToSpend: campaign.spend > 0 ? result.revenue / campaign.spend : null,
                    },
                };
            }),
        });
    } catch {
        return res.status(500).json({ message: 'Could not load campaign results.' });
    }
});

router.post('/', async (req, res) => {
    const body = req.body || {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const product = typeof body.product === 'string' ? body.product.trim() : '';
    const promotionText = typeof body.promotionText === 'string' ? body.promotionText.trim() : '';
    const productKey = product.toLocaleLowerCase('en');
    const spend = body.spend === '' || body.spend === null || body.spend === undefined ? null : Number(body.spend);

    if (!name || name.length > 100 || !product || product.length > 100 || !promotionText || promotionText.length > 4000) {
        return res.status(400).json({ message: 'Enter a campaign name and provide a valid product and promotion.' });
    }
    if (spend !== null && (!Number.isFinite(spend) || spend < 0)) {
        return res.status(400).json({ message: 'Campaign spend must be zero or a positive amount.' });
    }

    try {
        const item = await InventoryItem.findOne({ merchantId: req.userId, productKey })
            .select('product quantity lowStockThreshold')
            .lean();
        if (!item) return res.status(409).json({ message: 'This product is no longer in your inventory. Generate a new promotion plan.' });

        const safePromotionStock = Math.max(item.lowStockThreshold + 2, Math.ceil(item.lowStockThreshold * 1.5));
        if (item.quantity < safePromotionStock) {
            return res.status(409).json({ message: `${item.product} no longer has a safe stock cushion for a promotion. Restock or generate a new plan.` });
        }

        const campaign = await Campaign.create({
            merchantId: req.userId,
            name,
            product: item.product,
            productKey,
            promotionText,
            spend,
        });
        return res.status(201).json({ message: 'Campaign saved. Select it when recording sales for this product.', campaign });
    } catch {
        return res.status(500).json({ message: 'Could not save the campaign.' });
    }
});

router.patch('/:id/close', async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid campaign.' });
    try {
        const campaign = await Campaign.findOneAndUpdate(
            { _id: req.params.id, merchantId: req.userId, status: 'active' },
            { $set: { status: 'completed', closedAt: new Date() } },
            { new: true },
        );
        if (!campaign) return res.status(404).json({ message: 'Active campaign not found.' });
        return res.json({ message: 'Campaign closed.', campaign });
    } catch {
        return res.status(500).json({ message: 'Could not close the campaign.' });
    }
});

module.exports = router;
