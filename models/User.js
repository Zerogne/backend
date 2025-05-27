const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true },
  role: { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
