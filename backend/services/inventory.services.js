const InventoryItem = require('../models/inventory.models');
const Notification = require('../models/notification.models');

async function evaluateLowStock(item) {
    if (!item) return;

    if (item.quantity > item.lowStockThreshold) {
        if (item.lowStockAlertActive) {
            await InventoryItem.updateOne(
                { _id: item._id, merchantId: item.merchantId },
                { $set: { lowStockAlertActive: false, updatedAt: new Date() } },
            );
        }
        return;
    }

    if (item.lowStockAlertActive) return;

    const activatedItem = await InventoryItem.findOneAndUpdate(
        {
            _id: item._id,
            merchantId: item.merchantId,
            lowStockAlertActive: { $ne: true },
            quantity: { $lte: item.lowStockThreshold },
        },
        { $set: { lowStockAlertActive: true, updatedAt: new Date() } },
        { new: true },
    );

    if (!activatedItem) return;
    try {
        await Notification.create({
            merchantId: activatedItem.merchantId,
            inventoryItemId: activatedItem._id,
            type: 'low-stock',
            product: activatedItem.product,
            quantity: activatedItem.quantity,
            threshold: activatedItem.lowStockThreshold,
            message: `${activatedItem.product} is low: ${activatedItem.quantity} remaining (refill threshold ${activatedItem.lowStockThreshold}).`,
        });
    } catch (error) {
        await InventoryItem.updateOne(
            { _id: activatedItem._id, merchantId: activatedItem.merchantId },
            { $set: { lowStockAlertActive: false } },
        );
        throw error;
    }
}

module.exports = { evaluateLowStock };
