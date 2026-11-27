const express = require('express');
const mongoose = require('mongoose');
const InventoryItem = require('../models/inventory.models');
const PurchaseOrder = require('../models/purchaseorder.models');
const Sale = require('../models/sale.models');
const askBusinessAI = require('../services/ai.services');
const { evaluateLowStock } = require('../services/inventory.services');

const router = express.Router();

async function getRecommendations(merchantId) {
    const items = await InventoryItem.find({ merchantId }).sort({ product: 1 }).lean();
    const openOrders = await PurchaseOrder.find({
        merchantId,
        status: { $in: ['draft', 'ordered', 'partially-received'] },
    }).select('inventoryItemId quantity receivedQuantity').lean();
    const incomingByItem = new Map();
    openOrders.forEach((order) => {
        const key = order.inventoryItemId.toString();
        incomingByItem.set(key, (incomingByItem.get(key) || 0) + Math.max(0, order.quantity - order.receivedQuantity));
    });
    const now = new Date();
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - 29);
    const start7Days = new Date(now);
    start7Days.setUTCHours(0, 0, 0, 0);
    start7Days.setUTCDate(start7Days.getUTCDate() - 6);
    const sales = await Sale.aggregate([
        { $match: { merchantId: new mongoose.Types.ObjectId(merchantId), createdAt: { $gte: start } } },
        { $group: {
            _id: { $toLower: { $trim: { input: '$product' } } },
            units: { $sum: '$quantity' },
            orders: { $sum: 1 },
            unitsLast7Days: { $sum: { $cond: [{ $gte: ['$createdAt', start7Days] }, '$quantity', 0] } },
            ordersLast7Days: { $sum: { $cond: [{ $gte: ['$createdAt', start7Days] }, 1, 0] } },
            firstSaleAt: { $min: '$createdAt' },
            lastSaleAt: { $max: '$createdAt' },
        } },
    ]);
    const salesMap = new Map(sales.map((entry) => [entry._id, entry]));
    return items.map((item) => {
        const salesInfo = salesMap.get(item.productKey) || {};
        const unitsSoldLast30Days = salesInfo.units || 0;
        const orderCountLast30Days = salesInfo.orders || 0;
        const unitsSoldLast7Days = salesInfo.unitsLast7Days || 0;
        const ordersLast7Days = salesInfo.ordersLast7Days || 0;
        const observedDays = salesInfo.firstSaleAt
            ? Math.max(1, Math.min(30, Math.ceil((now.getTime() - new Date(salesInfo.firstSaleAt).getTime()) / 86400000)))
            : 30;
        const averageDailyUnits = unitsSoldLast30Days / observedDays;
        const typicalDaysBetweenOrders = orderCountLast30Days > 1
            ? Math.max(1, Math.round((new Date(salesInfo.lastSaleAt).getTime() - new Date(salesInfo.firstSaleAt).getTime()) / 86400000 / (orderCountLast30Days - 1)))
            : null;
        const leadTimeDays = item.leadTimeDays ?? 7;
        const incomingQuantity = incomingByItem.get(item._id.toString()) || 0;
        const targetStock = Math.max(item.lowStockThreshold + 1, Math.ceil(averageDailyUnits * (leadTimeDays + 7)));
        const recommendedQuantity = Math.max(0, targetStock - item.quantity - incomingQuantity);
        const needsReorder = item.quantity + incomingQuantity <= item.lowStockThreshold || recommendedQuantity > 0;
        return {
            inventoryItemId: item._id,
            product: item.product,
            quantityOnHand: item.quantity,
            incomingQuantity,
            lowStockThreshold: item.lowStockThreshold,
            supplierName: item.supplierName || '',
            supplierContact: item.supplierContact || '',
            leadTimeDays,
            unitsSoldLast30Days,
            unitsSoldLast7Days,
            ordersLast7Days,
            orderCountLast30Days,
            observedDays,
            averageDailyUnits: Number(averageDailyUnits.toFixed(2)),
            typicalDaysBetweenOrders,
            targetStock,
            recommendedQuantity: needsReorder ? Math.max(1, recommendedQuantity) : 0,
            needsReorder,
            reason: unitsSoldLast30Days
                ? `${unitsSoldLast30Days} units sold across ${orderCountLast30Days} orders in the last 30 days; the observed pace is about ${Number(averageDailyUnits.toFixed(2))} units per day over ${observedDays} days${typicalDaysBetweenOrders ? `, with orders about every ${typicalDaysBetweenOrders} days` : ''}.`
                : 'No sales were recorded in the last 30 days. This suggestion uses the refill threshold plus one unit as a basic minimum.',
        };
    }).filter((item) => item.needsReorder);
}

router.get('/recommendations', async (req, res) => {
    try {
        return res.json({ recommendations: await getRecommendations(req.userId) });
    } catch {
        return res.status(500).json({ message: 'Could not calculate restock suggestions.' });
    }
});

router.get('/', async (req, res) => {
    try {
        const orders = await PurchaseOrder.find({ merchantId: req.userId }).sort({ createdAt: -1 }).limit(100).lean();
        return res.json({ orders });
    } catch {
        return res.status(500).json({ message: 'Could not load purchase orders.' });
    }
});

router.post('/', async (req, res) => {
    const body = req.body || {};
    const itemId = typeof body.inventoryItemId === 'string' ? body.inventoryItemId : '';
    const quantity = Number(body.quantity);
    if (!mongoose.isValidObjectId(itemId) || !Number.isInteger(quantity) || quantity < 1) {
        return res.status(400).json({ message: 'Choose an inventory item and a whole order quantity greater than zero.' });
    }
    try {
        const item = await InventoryItem.findOne({ _id: itemId, merchantId: req.userId }).lean();
        if (!item) return res.status(404).json({ message: 'Inventory item not found.' });
        if (!item.supplierName) return res.status(409).json({ message: 'Add a supplier to this inventory item before creating its order.' });
        const recommendations = await getRecommendations(req.userId);
        const recommendation = recommendations.find((entry) => entry.inventoryItemId.toString() === itemId);
        if (!recommendation) return res.status(409).json({ message: 'This item does not currently need a reorder. Refresh the suggestions and try again.' });
        const order = await PurchaseOrder.create({
            merchantId: req.userId,
            inventoryItemId: item._id,
            product: item.product,
            quantity,
            supplierName: item.supplierName || '',
            supplierContact: item.supplierContact || '',
            leadTimeDays: item.leadTimeDays ?? 7,
        });
        return res.status(201).json({ message: 'Draft purchase order created.', order });
    } catch {
        return res.status(500).json({ message: 'Could not create the draft purchase order.' });
    }
});

router.patch('/:id/order', async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid purchase order.' });
    try {
        const order = await PurchaseOrder.findOneAndUpdate(
            { _id: req.params.id, merchantId: req.userId, status: 'draft' },
            { $set: { status: 'ordered', orderedAt: new Date() } },
            { new: true },
        );
        if (!order) return res.status(404).json({ message: 'Draft purchase order not found.' });
        return res.json({ message: 'Order marked as placed.', order });
    } catch {
        return res.status(500).json({ message: 'Could not update the purchase order.' });
    }
});

router.patch('/:id/receive', async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid purchase order.' });
    const amount = Number(req.body?.quantity);
    if (!Number.isInteger(amount) || amount < 1) return res.status(400).json({ message: 'Enter a whole received quantity greater than zero.' });
    try {
        const order = await PurchaseOrder.findOne({ _id: req.params.id, merchantId: req.userId }).lean();
        if (!order || !['ordered', 'partially-received'].includes(order.status)) {
            return res.status(409).json({ message: 'Only placed purchase orders can receive stock.' });
        }
        const newReceived = order.receivedQuantity + amount;
        if (newReceived > order.quantity) {
            return res.status(400).json({ message: `Only ${order.quantity - order.receivedQuantity} units remain to be received on this order.` });
        }
        const newStatus = newReceived === order.quantity ? 'received' : 'partially-received';
        const updatedOrder = await PurchaseOrder.findOneAndUpdate(
            {
                _id: order._id,
                merchantId: req.userId,
                status: { $in: ['ordered', 'partially-received'] },
                receivedQuantity: order.receivedQuantity,
            },
            { $inc: { receivedQuantity: amount }, $set: { status: newStatus, ...(newStatus === 'received' ? { receivedAt: new Date() } : {}) } },
            { new: true, runValidators: true },
        );
        if (!updatedOrder) return res.status(409).json({ message: 'This purchase order changed. Refresh and try again.' });
        let updatedItem;
        try {
            updatedItem = await InventoryItem.findOneAndUpdate(
                { _id: order.inventoryItemId, merchantId: req.userId },
                { $inc: { quantity: amount }, $set: { updatedAt: new Date() } },
                { new: true, runValidators: true },
            );
            if (!updatedItem) throw new Error('Inventory item not found.');
        } catch (error) {
            await PurchaseOrder.updateOne(
                { _id: order._id, merchantId: req.userId, receivedQuantity: newReceived },
                { $inc: { receivedQuantity: -amount }, $set: { status: order.status, receivedAt: order.receivedAt || null } },
            );
            throw error;
        }
        try {
            await evaluateLowStock(updatedItem);
        } catch (error) {
            console.error('Could not update low-stock notification after receiving a purchase order:', error.message);
        }
        return res.json({ message: `${amount} ${order.product} ${amount === 1 ? 'unit' : 'units'} received and added to inventory.`, order: updatedOrder, item: updatedItem });
    } catch (error) {
        return res.status(500).json({ message: error.message === 'Inventory item not found.' ? error.message : 'Could not receive this purchase order.' });
    }
});

router.post('/recommendations/explain', async (req, res) => {
    const itemId = typeof req.body?.inventoryItemId === 'string' ? req.body.inventoryItemId : '';
    if (!mongoose.isValidObjectId(itemId)) return res.status(400).json({ message: 'Choose an inventory item.' });
    try {
        const recommendations = await getRecommendations(req.userId);
        const recommendation = recommendations.find((item) => item.inventoryItemId.toString() === itemId);
        if (!recommendation) return res.status(404).json({ message: 'This item no longer has a restock suggestion.' });
        const merchant = await require('../models/user.models').findById(req.userId).select('profession').lean();
        let explanation;
        try {
            explanation = await askBusinessAI(
                'Explain this restock suggestion in plain language in 2-3 short sentences. State the recorded sales period, current stock, refill threshold, supplier lead time, open-order quantity, and suggested quantity. When recent sales exist, describe the seven-day buffer. When recent sales are zero, describe the refill-threshold-plus-one fallback and do not claim the lead-time buffer affected the quantity. Make clear this is a planning estimate, not a guarantee. Do not invent supplier availability, costs, or demand.',
                { profession: merchant?.profession || 'General retailer', period: 'Last 30 days', recommendation },
            );
        } catch {
            explanation = recommendation.unitsSoldLast30Days
                ? `${recommendation.unitsSoldLast30Days} units sold over the last 30 days averages about ${recommendation.averageDailyUnits} per day. The target covers ${recommendation.leadTimeDays} lead-time days plus a 7-day buffer; after current stock and ${recommendation.incomingQuantity} units on open orders, the estimate is ${recommendation.recommendedQuantity} units. This is a planning estimate, not a guarantee.`
                : `No sales were recorded in the last 30 days, so the estimate uses the refill threshold (${recommendation.lowStockThreshold}) plus one unit, minus current stock and ${recommendation.incomingQuantity} units on open orders. The suggested amount is ${recommendation.recommendedQuantity} units; this is a basic planning estimate, not a demand forecast.`;
        }
        return res.json({ explanation });
    } catch (error) {
        return res.status(error.status || 502).json({ message: error.message || 'Could not explain this restock suggestion.' });
    }
});

module.exports = router;
