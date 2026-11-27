const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
    merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    product: { type: String, required: true, trim: true, maxlength: 100 },
    productKey: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 0, default: 0 },
    lowStockThreshold: { type: Number, required: true, min: 0, default: 5 },
    supplierName: { type: String, trim: true, maxlength: 120, default: '' },
    supplierContact: { type: String, trim: true, maxlength: 160, default: '' },
    leadTimeDays: { type: Number, min: 0, max: 365, default: 7 },
    lowStockAlertActive: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

inventorySchema.index({ merchantId: 1, productKey: 1 }, { unique: true });
inventorySchema.index({ merchantId: 1, quantity: 1 });

module.exports = mongoose.model('InventoryItem', inventorySchema);
