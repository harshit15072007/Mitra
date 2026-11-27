const express = require('express');
const mongoose = require('mongoose');
const Customer = require('../models/customer.models');
const Sale = require('../models/sale.models');

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const customers = await Customer.find({ merchantId: req.userId }).sort({ name: 1 }).lean();
        const customerIds = customers.map((customer) => customer._id);
        const totals = customerIds.length ? await Sale.aggregate([
            { $match: { merchantId: new mongoose.Types.ObjectId(req.userId), customerId: { $in: customerIds } } },
            { $group: {
                _id: '$customerId',
                orders: { $sum: 1 },
                units: { $sum: '$quantity' },
                revenue: { $sum: '$amount' },
                lastPurchase: { $max: '$createdAt' },
            } },
        ]) : [];
        const totalsById = new Map(totals.map((entry) => [entry._id.toString(), entry]));
        return res.json({ customers: customers.map((customer) => ({
            ...customer,
            metrics: totalsById.get(customer._id.toString()) || { orders: 0, units: 0, revenue: 0, lastPurchase: null },
        })).filter((customer) => customer.metrics.orders > 0) });
    } catch {
        return res.status(500).json({ message: 'Could not load customers.' });
    }
});

router.get('/:id/history', async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid customer.' });
    try {
        const customer = await Customer.findOne({ _id: req.params.id, merchantId: req.userId }).select('name contact').lean();
        if (!customer) return res.status(404).json({ message: 'Customer not found.' });
        const sales = await Sale.find({ merchantId: req.userId, customerId: customer._id })
            .sort({ createdAt: -1 }).limit(100).select('product quantity amount createdAt').lean();
        return res.json({ customer, sales });
    } catch {
        return res.status(500).json({ message: 'Could not load customer purchase history.' });
    }
});

module.exports = router;
