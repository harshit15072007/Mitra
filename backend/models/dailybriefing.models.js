const mongoose = require('mongoose');

const dailyBriefingSchema = new mongoose.Schema({
    merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    dayKey: { type: String, required: true },
    briefing: { type: String, required: true, maxlength: 4000 },
    generatedAt: { type: Date, required: true, default: Date.now },
});

dailyBriefingSchema.index({ merchantId: 1, dayKey: 1 }, { unique: true });

module.exports = mongoose.model('DailyBriefing', dailyBriefingSchema);
