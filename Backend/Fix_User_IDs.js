const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('./models/User');
const School = require('./models/School');
const Assignment = require('./models/Assignment');
const Submission = require('./models/Submission');

const MONGODB_URI = 'mongodb+srv://Smartstudentadmin:IAjFedj31EADYiZQ@cluster0.qtnlydx.mongodb.net/smartstudentact?retryWrites=true&w=majority&appName=Cluster0';

// Map of specific users and their raw passwords
const rawPasswords = {
  'vmensa564@gmail.com': 'Victoria123%',
  'afedziesylvanus@gmail.com': 'Afedzie123%',
};

// File to log auto-generated passwords
const logFilePath = path.join(__dirname, 'generated_passwords.log');
fs.writeFileSync(logFilePath, 'Auto-generated passwords for migrated users:\n\n'); // Clear previous content

// Generate a secure random password
function generateRandomPassword() {
  return crypto.randomBytes(8).toString('base64') + '1!'; // Ensure complexity
}

// Configure NodeMailer
const transporter = nodemailer.createTransport({
  host: 'smtp.example.com', // Replace with your SMTP host
  port: 587,                
  secure: false,            
  auth: {
    user: 'your-email@example.com', 
    pass: 'your-email-password',    
  },
});

async function sendPasswordEmail(toEmail, password) {
  const mailOptions = {
    from: '"SmartStudentAct" <your-email@example.com>',
    to: toEmail,
    subject: 'Your Account Password',
    text: `Hello,\n\nYour account password has been generated as part of a migration. Please use the following password to log in:\n\n${password}\n\nYou can change your password after logging in.\n\nBest regards,\nSmartStudentAct Team`
  };
  await transporter.sendMail(mailOptions);
}

async function fixUserIds() {
  console.log('Starting user ID migration...');
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Database connected successfully.');

    // Ensure "My School" exists
    let mySchool = await School.findOne({ name: 'My School' });
    if (!mySchool) {
      mySchool = await School.create({
        name: 'My School',
        tier: 1,               
        schoolCountry: 'Ghana', 
      });
      console.log(`Created new school: My School with ID ${mySchool._id}`);
    } else {
      console.log(`Found existing school: My School with ID ${mySchool._id}`);
    }

    const usersWithInvalidIds = await User.find({
      _id: { $not: { $type: 'objectId' } }
    }).select('+password');

    if (usersWithInvalidIds.length === 0) {
      console.log('No invalid user IDs found. No migration needed.');
      return;
    }

    console.log(`Found ${usersWithInvalidIds.length} users with invalid IDs to migrate.`);

    for (const user of usersWithInvalidIds) {
      console.log(`- Migrating user: ${user.email} (Old ID: ${user._id})`);

      // Assign default school if missing
      if (!user.school) user.school = mySchool._id;

      // Determine password
      let passwordToUse;
      let isPasswordGenerated = false;
      if (rawPasswords[user.email]) {
        passwordToUse = rawPasswords[user.email];
      } else if (!user.password) {
        passwordToUse = generateRandomPassword();
        fs.appendFileSync(logFilePath, `${user.email}: ${passwordToUse}\n`);
        isPasswordGenerated = true;
        console.log(`  - Generated random password for user ${user.email}: ${passwordToUse}`);
      } else {
        passwordToUse = user.password;
      }
      user.setRawHashedPassword(passwordToUse);

      // Check if a user with the same email already exists
      const existingUser = await User.findOne({ email: user.email });
      const targetUserId = existingUser ? existingUser._id : new mongoose.Types.ObjectId();

      if (existingUser) {
        console.log(`  - User with email ${user.email} already exists. Updating missing fields and references.`);
        if (!existingUser.school) {
          existingUser.school = mySchool._id;
          console.log(`  - Assigned default school to ${user.email}`);
        }
        existingUser.setRawHashedPassword(passwordToUse);
        await existingUser.save();
      } else {
        // Otherwise, create a new user
        const newUserData = { ...user.toObject(), _id: targetUserId };
        delete newUserData.__v;
        await User.create(newUserData);
        console.log(`  - Created new user document with ID: ${targetUserId}`);
      }

      // Update related documents ONLY if old _id is a valid ObjectId
      if (mongoose.Types.ObjectId.isValid(user._id)) {
        await Assignment.updateMany({ teacher_id: user._id }, { teacher_id: targetUserId });
        await Assignment.updateMany({ user_id: user._id }, { user_id: targetUserId });
        await Submission.updateMany({ user_id: user._id }, { user_id: targetUserId });
        await Submission.updateMany({ teacher_id: user._id }, { teacher_id: targetUserId });
        console.log('  - Related documents updated.');
      } else {
        console.log(`  - Skipping reference updates for ${user.email} because old ID is invalid.`);
      }

      // Delete old invalid user
      await User.deleteOne({ _id: user._id });
      console.log(`  - Deleted old invalid user document.`);

      if (isPasswordGenerated) {
        await sendPasswordEmail(user.email, passwordToUse);
        console.log(`  - Sent email to ${user.email} with generated password.`);
      }
    }

    console.log('Migration complete. All users with invalid IDs have been updated.');
    console.log(`Auto-generated passwords (if any) are saved in ${logFilePath}`);

  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Database connection closed.');
  }
}

fixUserIds();





