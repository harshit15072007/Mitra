const express = require('express');
const Sale = require('../models/sale.models');
const InventoryItem = require('../models/inventory.models');
const { evaluateLowStock } = require('../services/inventory.services');

const router = express.Router();

router.get('/', async (req, res) => {
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 20;

    try {
        const sales = await Sale.find({ merchantId: req.userId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .select('product quantity amount createdAt')
            .lean();
        return res.json({ sales });
    } catch (error) {
        return res.status(500).json({ message: 'Could not load recent sales.' });
    }
});

router.post('/', async (req, res) => {
    const body = req.body || {};
    const product = typeof body.product === 'string' ? body.product.trim() : '';
    const quantity = Number(body.quantity);
    const amount = Number(body.amount);

    if (!product || !Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(amount) || amount < 0) {
        return res.status(400).json({ message: 'Enter a product, a whole quantity greater than zero, and a valid non-negative amount.' });
    }

    try {
        const productKey = product.toLocaleLowerCase('en');
        const trackedItem = await InventoryItem.findOne({ merchantId: req.userId, productKey });
        let updatedItem = null;
        if (trackedItem) {
            updatedItem = await InventoryItem.findOneAndUpdate(
                { _id: trackedItem._id, merchantId: req.userId, quantity: { $gte: quantity } },
                { $inc: { quantity: -quantity }, $set: { updatedAt: new Date() } },
                { new: true },
            );
            if (!updatedItem) {
                return res.status(409).json({ message: 'Not enough ' + trackedItem.product + ' in stock. Available: ' + trackedItem.quantity + '.' });
            }
        }

        let sale;
        try {
            sale = await Sale.create({ merchantId: req.userId, product, quantity, amount });
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
