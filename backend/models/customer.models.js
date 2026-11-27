const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
    merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    contact: { type: String, trim: true, maxlength: 160, default: '' },
    customerKey: { type: String, required: true, trim: true, maxlength: 180 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

customerSchema.index({ merchantId: 1, customerKey: 1 }, { unique: true });

module.exports = mongoose.model('Customer', customerSchema);
