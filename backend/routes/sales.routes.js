const express = require('express');
const mongoose = require('mongoose');
const Sale = require('../models/sale.models');
const InventoryItem = require('../models/inventory.models');
const Campaign = require('../models/campaign.models');
const { evaluateLowStock } = require('../services/inventory.services');

const router = express.Router();

router.get('/', async (req, res) => {
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 20;

    try {
        const sales = await Sale.find({ merchantId: req.userId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .select('product quantity amount createdAt campaignId')
            .populate('campaignId', 'name')
            .lean();
        return res.json({ sales });
    } catch (error) {
        return res.status(500).json({ message: 'Could not load recent sales.' });
    }
});

router.delete('/:id', async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: 'Invalid sale.' });
    }

    try {
        const sale = await Sale.findOneAndDelete({ _id: req.params.id, merchantId: req.userId }).lean();
        if (!sale) return res.status(404).json({ message: 'Sale not found.' });

        let restoredItem = null;
        try {
            restoredItem = await InventoryItem.findOneAndUpdate(
                { merchantId: req.userId, productKey: sale.product.trim().toLocaleLowerCase('en') },
                { $inc: { quantity: sale.quantity }, $set: { updatedAt: new Date() } },
                { new: true },
            );
        } catch (error) {
            await Sale.create(sale);
            throw error;
        }

        if (restoredItem) {
            try {
                await evaluateLowStock(restoredItem);
            } catch (error) {
                console.error('Could not update low-stock notification after deleting a sale:', error.message);
            }
        }

        const message = restoredItem
            ? `Sale deleted. ${restoredItem.quantity} ${restoredItem.product} remaining in stock.`
            : 'Sale deleted. The inventory item was not found, so stock could not be restored.';
        return res.json({ message, sale, restoredQuantity: restoredItem?.quantity ?? null });
    } catch (error) {
        return res.status(500).json({ message: 'Could not delete the sale.' });
    }
});

router.post('/', async (req, res) => {
    const body = req.body || {};
    const product = typeof body.product === 'string' ? body.product.trim() : '';
    const quantity = Number(body.quantity);
    const amount = Number(body.amount);
    const campaignId = typeof body.campaignId === 'string' ? body.campaignId.trim() : '';

    if (!product || !Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(amount) || amount < 0) {
        return res.status(400).json({ message: 'Enter a product, a whole quantity greater than zero, and a valid non-negative amount.' });
    }

    try {
        const productKey = product.toLocaleLowerCase('en');
        let campaign = null;
        if (campaignId) {
            if (!mongoose.isValidObjectId(campaignId)) {
                return res.status(400).json({ message: 'Choose a valid campaign or leave the campaign field empty.' });
            }
            campaign = await Campaign.findOne({ _id: campaignId, merchantId: req.userId, status: 'active' }).select('productKey name product');
            if (!campaign) return res.status(400).json({ message: 'That campaign is no longer active. Refresh the campaign list and try again.' });
            if (campaign.productKey !== productKey) {
                return res.status(400).json({ message: `The ${campaign.name} campaign is for ${campaign.product}. Record this sale without the campaign or choose one for ${product}.` });
            }
        }

        const trackedItem = await InventoryItem.findOne({ merchantId: req.userId, productKey });
        if (!trackedItem) {
            return res.status(400).json({
                message: `“${product}” is not in your inventory. Check the spelling or add the item to Inventory before recording this sale.`,
                code: 'PRODUCT_NOT_IN_INVENTORY',
            });
        }

        const updatedItem = await InventoryItem.findOneAndUpdate(
            { _id: trackedItem._id, merchantId: req.userId, quantity: { $gte: quantity } },
            { $inc: { quantity: -quantity }, $set: { updatedAt: new Date() } },
            { new: true },
        );
        if (!updatedItem) {
            const currentItem = await InventoryItem.findOne({ _id: trackedItem._id, merchantId: req.userId }).select('product quantity').lean();
            return res.status(409).json({
                message: currentItem
                    ? `Not enough ${currentItem.product} in stock. Available: ${currentItem.quantity}.`
                    : 'This item is no longer in your inventory. Refresh the page and try again.',
                code: 'INSUFFICIENT_STOCK',
            });
        }

        let sale;
        try {
            sale = await Sale.create({ merchantId: req.userId, campaignId: campaign?._id || null, product, quantity, amount });
        } catch (error) {
            if (updatedItem) {
                await InventoryItem.updateOne(
                    { _id: updatedItem._id, merchantId: req.userId },
                    { $inc: { quantity }, $set: { updatedAt: new Date() } },
                );
            }
            throw error;
        }

        if (updatedItem) {
            try {
                await evaluateLowStock(updatedItem);
            } catch (error) {
                console.error('Could not create low-stock notification:', error.message);
            }
        }
        const message = updatedItem
            ? 'Sale added. ' + updatedItem.product + ' stock remaining: ' + updatedItem.quantity + '.'
            : 'Sale added successfully.';
        return res.status(201).json({ message, sale, remainingStock: updatedItem?.quantity });
    } catch (error) {
        return res.status(500).json({ message: 'Could not save the sale.' });
    }
});

module.exports = router;
