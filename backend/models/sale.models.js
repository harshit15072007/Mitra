const mongoose = require('mongoose');

const saleSchema = new mongoose.Schema({
    merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', default: null },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerName: { type: String, trim: true, maxlength: 120, default: '' },
    customerContact: { type: String, trim: true, maxlength: 160, default: '' },
    product: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    amount: { type: Number, required: true, min: 0 },
    createdAt: { type: Date, default: Date.now },
});

saleSchema.index({ merchantId: 1, createdAt: -1 });

module.exports = mongoose.model('Sale', saleSchema);
