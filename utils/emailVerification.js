const crypto = require("crypto");

const CODE_TTL_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

const hashCode = (code) =>
  crypto.createHash("sha256").update(code).digest("hex");

const newCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, "0");

const prepareCode = (account) => {
  const code = newCode();
  account.emailVerificationCodeHash = hashCode(code);
  account.emailVerificationExpiresAt = new Date(Date.now() + CODE_TTL_MS);
  account.emailVerificationSentAt = new Date();
  account.emailVerificationAttempts = 0;
  return code;
};

const sendEmailCode = async ({ email, code, subject, purpose }) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error("Resend email configuration is missing");
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject,
      text: `Your Somfuel ${purpose} code is ${code}. It expires in 15 minutes.`,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    throw new Error(`Resend rejected verification email (${response.status})`);
  }
};

const sendCode = (email, code) =>
  sendEmailCode({
    email,
    code,
    subject: "Verify your Somfuel email",
    purpose: "email verification",
  });

const sendPasswordResetCode = (email, code) =>
  sendEmailCode({
    email,
    code,
    subject: "Reset your Somfuel password",
    purpose: "password reset",
  });

const mayResend = (account) =>
  !account.emailVerificationSentAt ||
  Date.now() - account.emailVerificationSentAt.getTime() >= RESEND_COOLDOWN_MS;

const verifyCode = (account, code) => {
  if (
    !account.emailVerificationCodeHash ||
    !account.emailVerificationExpiresAt ||
    account.emailVerificationExpiresAt <= new Date() ||
    account.emailVerificationAttempts >= 5
  ) {
    return false;
  }
  account.emailVerificationAttempts += 1;
  const expected = Buffer.from(account.emailVerificationCodeHash, "hex");
  const actual = Buffer.from(hashCode(code), "hex");
  if (!crypto.timingSafeEqual(expected, actual)) return false;
  account.emailVerified = true;
  account.emailVerificationCodeHash = undefined;
  account.emailVerificationExpiresAt = undefined;
  account.emailVerificationSentAt = undefined;
  account.emailVerificationAttempts = 0;
  return true;
};

const preparePasswordResetCode = (account) => {
  const code = newCode();
  account.passwordResetCodeHash = hashCode(code);
  account.passwordResetExpiresAt = new Date(Date.now() + CODE_TTL_MS);
  account.passwordResetSentAt = new Date();
  account.passwordResetAttempts = 0;
  return code;
};

const maySendPasswordReset = (account) =>
  !account.passwordResetSentAt ||
  Date.now() - account.passwordResetSentAt.getTime() >= RESEND_COOLDOWN_MS;

const verifyPasswordResetCode = (account, code) => {
  if (
    !account.passwordResetCodeHash ||
    !account.passwordResetExpiresAt ||
    account.passwordResetExpiresAt <= new Date() ||
    account.passwordResetAttempts >= 5
  ) {
    return false;
  }
  account.passwordResetAttempts += 1;
  const expected = Buffer.from(account.passwordResetCodeHash, "hex");
  const actual = Buffer.from(hashCode(code), "hex");
  if (!crypto.timingSafeEqual(expected, actual)) return false;
  account.passwordResetCodeHash = undefined;
  account.passwordResetExpiresAt = undefined;
  account.passwordResetSentAt = undefined;
  account.passwordResetAttempts = 0;
  return true;
};

module.exports = {
  prepareCode,
  sendCode,
  mayResend,
  verifyCode,
  preparePasswordResetCode,
  sendPasswordResetCode,
  maySendPasswordReset,
  verifyPasswordResetCode,
};
