const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        trim: true,
        unique: true,
    },
    businessName: {
        type: String,
        trim: true,
        minlength: 2,
        maxlength: 100,
        default: '',
    },
    profession: {
        type: String,
        trim: true,
        minlength: 2,
        maxlength: 80,
        default: 'General retailer',
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        unique: true,
    },
    password: {
        type: String,
        required: true,
        select: false,
    },
    createdAt: {    
        type: Date,
        default: Date.now,
    },
});

const User = mongoose.model('User', userSchema);

module.exports = User;
