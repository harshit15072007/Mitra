const mongoose = require('mongoose');
const InventoryItem = require('../models/inventory.models');
const PurchaseOrder = require('../models/purchaseorder.models');
const Sale = require('../models/sale.models');

async function getRestockRecommendations(merchantId) {
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
            saleTimes: { $push: '$createdAt' },
        } },
    ]);
    const salesMap = new Map(sales.map((entry) => [entry._id, entry]));
    return items.map((item) => {
        const salesInfo = salesMap.get(item.productKey) || {};
        const unitsSoldLast30Days = salesInfo.units || 0;
        const orderCountLast30Days = salesInfo.orders || 0;
        const unitsSoldLast7Days = salesInfo.unitsLast7Days || 0;
        const ordersLast7Days = salesInfo.ordersLast7Days || 0;
        const saleDays = [...new Set((salesInfo.saleTimes || []).map((date) => new Date(date).toISOString().slice(0, 10)))].sort();
        const firstSaleDay = saleDays.length ? new Date(`${saleDays[0]}T00:00:00.000Z`) : null;
        const lastSaleDay = saleDays.length ? new Date(`${saleDays[saleDays.length - 1]}T00:00:00.000Z`) : null;
        const daySpanBetweenSales = saleDays.length > 1
            ? Math.max(1, Math.ceil((lastSaleDay.getTime() - firstSaleDay.getTime()) / 86400000))
            : 0;
        // One observed sale day is not enough to project that day's volume forward.
        const paceWindowDays = saleDays.length > 1 ? Math.min(30, daySpanBetweenSales) : 30;
        const averageDailyUnits = unitsSoldLast30Days / paceWindowDays;
        const typicalDaysBetweenSales = saleDays.length > 1
            ? Math.max(1, Math.round(daySpanBetweenSales / (saleDays.length - 1)))
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
            saleDaysCount: saleDays.length,
            paceWindowDays,
            averageDailyUnits: Number(averageDailyUnits.toFixed(2)),
            typicalDaysBetweenSales,
            targetStock,
            recommendedQuantity: needsReorder ? Math.max(1, recommendedQuantity) : 0,
            needsReorder,
            reason: unitsSoldLast30Days
                ? `${unitsSoldLast30Days} units sold in the last 30 days across ${saleDays.length} separate sale days. ${typicalDaysBetweenSales ? `Sales happened about every ${typicalDaysBetweenSales} days; ` : saleDays.length === 1 ? 'Sales were recorded on only one day, so a conservative 30-day average is used; ' : ''}the estimated pace is ${Number(averageDailyUnits.toFixed(2))} units per day.`
                : 'No sales were recorded in the last 30 days. This suggestion uses the refill threshold plus one unit as a basic minimum.',
        };
    }).filter((item) => item.needsReorder);
}

module.exports = getRestockRecommendations;
