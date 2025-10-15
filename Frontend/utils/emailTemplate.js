function baseTemplate(title, body) {
  return `
    <div style="font-family: Arial; max-width:600px; margin:auto; border-radius:12px; overflow:hidden; box-shadow:0 4px 8px rgba(0,0,0,0.05);">
      <div style="background:#4CAF50; padding:25px; color:white; text-align:center;">
        <h2>${title}</h2>
      </div>
      <div style="padding:30px; background:#fff;">
        ${body}
      </div>
    </div>
  `;
}

function passwordReset(name, resetLink) {
  return baseTemplate(
    "Password Reset Request",
    `<p>Hi ${name}, click <a href="${resetLink}">here</a> to reset your password.</p>`
  );
}

module.exports = { baseTemplate, passwordReset };
