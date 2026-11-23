const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    inventoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem' },
    type: { type: String, enum: ['low-stock'], required: true },
    product: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    threshold: { type: Number, required: true, min: 0 },
    message: { type: String, required: true },
    readAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
});

notificationSchema.index({ merchantId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
