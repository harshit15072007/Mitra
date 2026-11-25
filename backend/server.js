const express = require('express');
const app = require('./src/app');
const port = process.env.PORT || 3000;
const connectDB = require('../Database/db');

// Connect to MongoDB
connectDB();

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

