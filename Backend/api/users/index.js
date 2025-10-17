import express from "express";

import contact from "./contact.js";
import forgotPassword from "./forgot-password.js";
import login from "./login.js";
import logout from "./logout.js";
import resetPassword from "./reset-password.js";
import signupOtp from "./signup-otp.js";
import verifyOtp from "./verify-otp.js";

const router = express.Router();

router.use("/contact", contact);
router.use("/forgot-password", forgotPassword);
router.use("/login", login);
router.use("/logout", logout);
router.use("/reset-password", resetPassword);
router.use("/signup-otp", signupOtp);
router.use("/verify-otp", verifyOtp);

export default router;
