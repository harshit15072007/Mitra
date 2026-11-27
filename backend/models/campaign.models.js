const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
    merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    product: { type: String, required: true, trim: true, maxlength: 100 },
    productKey: { type: String, required: true, trim: true },
    promotionText: { type: String, required: true, maxlength: 4000 },
    spend: { type: Number, default: null, min: 0 },
    status: { type: String, enum: ['active', 'completed'], default: 'active' },
    createdAt: { type: Date, default: Date.now },
    closedAt: { type: Date, default: null },
});

campaignSchema.index({ merchantId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Campaign', campaignSchema);
