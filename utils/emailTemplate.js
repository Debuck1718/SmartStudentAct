// utils/emailTemplates.js

/**
 * The base HTML template for all emails to ensure consistent styling.
 * @param {string} title The title for the email's header.
 * @param {string} body The main content of the email in HTML format.
 * @returns {string} The complete HTML string for the email.
 */
function baseTemplate(title, body) {
  return `
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 8px rgba(0,0,0,0.05);">
      <div style="background: linear-gradient(135deg, #4CAF50, #2E8B57); padding: 25px; color: white; text-align: center; border-bottom: 2px solid #38763C;">
        <h2 style="margin: 0; font-size: 28px; font-weight: 700;">${title}</h2>
      </div>
      <div style="padding: 30px; background: #ffffff;">
        ${body}
        <p style="font-size: 12px; color: #a0a0a0; margin-top: 30px; text-align: center;">
          This email was sent by SmartStudentAct. If you did not expect this, please ignore it.
        </p>
      </div>
    </div>
  `;
}

/**
 * Template for notifying a user they have been created by an admin.
 * @param {string} name User's first name.
 * @param {string} email User's email address.
 * @param {string} role User's assigned role (e.g., 'teacher', 'admin').
 * @returns {string} The formatted email HTML.
 */
function adminCreated(name, email, role) {
  return baseTemplate(
    `Welcome, ${role}!`,
    `<p style="font-size: 16px; color: #333;">Dear ${name},</p>
     <p style="font-size: 16px; color: #555;">You have been successfully added as a <strong>${role}</strong> in the SmartStudentAct system.</p>
     <p style="font-size: 16px; color: #555;">You can now log in using your registered email <strong>${email}</strong>.</p>
     <p style="font-size: 16px; color: #555;">For security, please change your password after logging in.</p>
     <p style="font-size: 16px; color: #555; margin-top: 25px;">Thank you,<br>SmartStudentAct Team</p>`
  );
}

/**
 * Template for a password reset request.
 * @param {string} name User's first name.
 * @param {string} resetLink The URL for the password reset page.
 * @returns {string} The formatted email HTML.
 */
function passwordReset(name, resetLink) {
  return baseTemplate(
    `Password Reset Request`,
    `<p style="font-size: 16px; color: #333;">Dear ${name},</p>
     <p style="font-size: 16px; color: #555;">We received a request to reset your password. Click the button below to set a new password:</p>
     <p style="text-align: center; margin-top: 30px; margin-bottom: 30px;">
       <a href="${resetLink}" style="display: inline-block; padding: 12px 25px; background: #4CAF50; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">Reset Password</a>
     </p>
     <p style="font-size: 16px; color: #555;">If you did not request this, you can safely ignore this email.</p>
     <p style="font-size: 16px; color: #555; margin-top: 25px;">Thank you,<br>SmartStudentAct Team</p>`
  );
}

/**
 * A generic notification template for simple messages.
 * @param {string} subject The subject line of the email.
 * @param {string} message The message body.
 * @returns {string} The formatted email HTML.
 */
function genericNotification(subject, message) {
  return baseTemplate(
    subject,
    `<p style="font-size: 16px; color: #333;">${message}</p>`
  );
}

// 📢 Updated Templates with new suggestions

/**
 * Template for confirming an assignment submission to a student.
 * @param {string} studentName The name of the student.
 * @param {string} assignmentTitle The title of the submitted assignment.
 * @param {string} submissionDate The date of submission.
 * @param {string} viewUrl The URL to view the submission.
 * @returns {string} The formatted email HTML.
 */
function submissionConfirmation(studentName, assignmentTitle, submissionDate, viewUrl) {
  return baseTemplate(
    `Submission Confirmed!`,
    `<p style="font-size: 16px; color: #333;">Hi ${studentName},</p>
     <p style="font-size: 16px; color: #555;">This is to confirm that your assignment, "<strong>${assignmentTitle}</strong>", was successfully submitted on ${submissionDate}.</p>
     <p style="font-size: 16px; color: #555;">Good work! You can view your submission details below.</p>
     <p style="text-align: center; margin-top: 30px;">
       <a href="${viewUrl}" style="display: inline-block; padding: 12px 25px; background: #4CAF50; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">View Submission</a>
     </p>`
  );
}

/**
 * Template for notifying a student that they have received feedback.
 * @param {string} studentName The name of the student.
 * @param {string} assignmentTitle The title of the assignment.
 * @param {string} viewUrl The URL to view the feedback.
 * @returns {string} The formatted email HTML.
 */
function feedbackReceived(studentName, assignmentTitle, viewUrl) {
  return baseTemplate(
    `You Have New Feedback!`,
    `<p style="font-size: 16px; color: #333;">Hi ${studentName},</p>
     <p style="font-size: 16px; color: #555;">A teacher has provided new feedback on your assignment, "<strong>${assignmentTitle}</strong>".</p>
     <p style="font-size: 16px; color: #555;">Click the button below to review their comments and suggestions.</p>
     <p style="text-align: center; margin-top: 30px;">
       <a href="${viewUrl}" style="display: inline-block; padding: 12px 25px; background: #4CAF50; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">View Feedback</a>
     </p>`
  );
}

/**
 * Template for notifying a student of a new grade and feedback.
 * @param {string} studentName The name of the student.
 * @param {string} assignmentTitle The title of the assignment.
 * @param {string} grade The grade received.
 * @param {string} viewUrl The URL to view the graded assignment.
 * @returns {string} The formatted email HTML.
 */
function gradedFeedback(studentName, assignmentTitle, grade, viewUrl) {
  return baseTemplate(
    `Assignment Graded: ${assignmentTitle}`,
    `<p style="font-size: 16px; color: #333;">Hi ${studentName},</p>
     <p style="font-size: 16px; color: #555;">Your assignment, "<strong>${assignmentTitle}</strong>", has been graded.</p>
     <p style="font-size: 20px; font-weight: 700; text-align: center; margin: 20px 0; color: #2E8B57;">Grade: ${grade}</p>
     <p style="font-size: 16px; color: #555;">Click the button below to see detailed feedback and a breakdown of your score.</p>
     <p style="text-align: center; margin-top: 30px;">
       <a href="${viewUrl}" style="display: inline-block; padding: 12px 25px; background: #4CAF50; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">View Graded Assignment</a>
     </p>`
  );
}


module.exports = {
  adminCreated,
  passwordReset,
  genericNotification,
  submissionConfirmation,
  feedbackReceived,
  gradedFeedback,
};

