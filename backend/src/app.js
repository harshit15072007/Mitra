const express = require('express');
const app = express();
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../../.env') });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/users', require('../routes/user.routes'));
app.use('/api', require('../services/auth.services').authenticate);
app.use('/api/sales', require('../routes/sales.routes'));
app.use('/api/campaigns', require('../routes/campaign.routes'));
app.use('/api/purchases', require('../routes/purchase.routes'));
app.use('/api/customers', require('../routes/customer.routes'));
app.use('/api/inventory', require('../routes/inventory.routes'));
app.use('/api', require('../routes/inventory.routes'));
app.use('/api', require('../routes/dashboard.routes'));

app.use(express.static(path.join(__dirname, '../../frontend/public')));

module.exports = app;
