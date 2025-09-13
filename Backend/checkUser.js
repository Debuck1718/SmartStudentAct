require('dotenv').config();
const mongoose = require('mongoose');
const School = require('./models/School');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const schools = await School.find({}, { schoolName: 1, schoolCountry: 1, _id: 0 }).limit(10);
    console.log('Sample schools:', schools);

    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();







