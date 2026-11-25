const express = require('express');
const mongoose = require('mongoose');
const InventoryItem = require('../models/inventory.models');
const Notification = require('../models/notification.models');
const { evaluateLowStock } = require('../services/inventory.services');

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const items = await InventoryItem.find({ merchantId: req.userId }).sort({ product: 1 }).lean();
        for (const item of items) await evaluateLowStock(item);
        const refreshedItems = await InventoryItem.find({ merchantId: req.userId }).sort({ product: 1 }).lean();
        return res.json({ items: refreshedItems });
    } catch {
        return res.status(500).json({ message: 'Could not load inventory.' });
    }
});

router.post('/', async (req, res) => {
    const body = req.body || {};
    const product = typeof body.product === 'string' ? body.product.trim() : '';
    const quantity = Number(body.quantity);
    const lowStockThreshold = Number(body.lowStockThreshold);
    if (product.length < 1 || product.length > 100 || !Number.isInteger(quantity) || quantity < 0 ||
        !Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) {
        return res.status(400).json({ message: 'Enter a product name and whole-number stock and refill threshold values.' });
    }

    try {
        const item = await InventoryItem.create({
            merchantId: req.userId,
            product,
            productKey: product.toLocaleLowerCase('en'),
            quantity,
            lowStockThreshold,
        });
        await evaluateLowStock(item);
        return res.status(201).json({ message: 'Inventory item added.', item });
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ message: 'That product is already in your inventory. Restock the existing item instead.' });
        return res.status(500).json({ message: 'Could not add the inventory item.' });
    }
});

router.post('/:id/restock', async (req, res) => {
    const amount = Number(req.body?.quantity);
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid inventory item.' });
    if (!Number.isInteger(amount) || amount < 1) return res.status(400).json({ message: 'Enter a whole-number restock quantity greater than zero.' });

    try {
        const item = await InventoryItem.findOneAndUpdate(
            { _id: req.params.id, merchantId: req.userId },
            { $inc: { quantity: amount }, $set: { updatedAt: new Date() } },
            { new: true, runValidators: true },
        );
        if (!item) return res.status(404).json({ message: 'Inventory item not found.' });
        await evaluateLowStock(item);
        return res.json({ message: 'Stock updated.', item });
    } catch {
        return res.status(500).json({ message: 'Could not restock this item.' });
    }
});

router.get('/notifications', async (req, res) => {
    try {
        const notifications = await Notification.find({ merchantId: req.userId })
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();
        const unreadCount = notifications.reduce((count, item) => count + (item.readAt ? 0 : 1), 0);
        return res.json({ notifications, unreadCount });
    } catch {
        return res.status(500).json({ message: 'Could not load notifications.' });
    }
});

router.patch('/notifications/read-all', async (req, res) => {
    try {
        await Notification.updateMany(
            { merchantId: req.userId, readAt: null },
            { $set: { readAt: new Date() } },
        );
        return res.json({ message: 'Notifications marked as read.' });
    } catch {
        return res.status(500).json({ message: 'Could not update notifications.' });
    }
});

router.patch('/notifications/:id/read', async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid notification.' });
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, merchantId: req.userId },
            { $set: { readAt: new Date() } },
            { new: true },
        );
        if (!notification) return res.status(404).json({ message: 'Notification not found.' });
        return res.json({ notification });
    } catch {
        return res.status(500).json({ message: 'Could not update this notification.' });
    }
});

module.exports = router;
