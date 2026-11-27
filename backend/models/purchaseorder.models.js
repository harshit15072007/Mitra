const mongoose = require('mongoose');

const purchaseOrderSchema = new mongoose.Schema({
    merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    inventoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
    product: { type: String, required: true, trim: true, maxlength: 100 },
    quantity: { type: Number, required: true, min: 1 },
    receivedQuantity: { type: Number, required: true, min: 0, default: 0 },
    supplierName: { type: String, trim: true, maxlength: 120, default: '' },
    supplierContact: { type: String, trim: true, maxlength: 160, default: '' },
    leadTimeDays: { type: Number, min: 0, max: 365, default: 7 },
    status: { type: String, enum: ['draft', 'ordered', 'partially-received', 'received'], default: 'draft' },
    createdAt: { type: Date, default: Date.now },
    orderedAt: { type: Date, default: null },
    receivedAt: { type: Date, default: null },
});

purchaseOrderSchema.index({ merchantId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
