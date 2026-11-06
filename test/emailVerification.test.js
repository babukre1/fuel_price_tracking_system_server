const assert = require("node:assert/strict");
const test = require("node:test");
const {
  prepareCode,
  mayResend,
  verifyCode,
  preparePasswordResetCode,
  maySendPasswordReset,
  verifyPasswordResetCode,
} = require("../utils/emailVerification");

test("a fresh code verifies once and clears the stored secret", () => {
  const account = { emailVerified: false };
  const code = prepareCode(account);
  assert.match(code, /^\d{6}$/);
  assert.equal(mayResend(account), false);
  assert.equal(verifyCode(account, code), true);
  assert.equal(account.emailVerified, true);
  assert.equal(account.emailVerificationCodeHash, undefined);
  assert.equal(verifyCode(account, code), false);
});

test("wrong codes are limited to five attempts", () => {
  const account = { emailVerified: false };
  const code = prepareCode(account);
  const wrong = code === "000000" ? "000001" : "000000";
  for (let i = 0; i < 5; i++) {
    assert.equal(verifyCode(account, wrong), false);
  }
  assert.equal(verifyCode(account, code), false);
});

test("expired codes are rejected and a new code can be requested after cooldown", () => {
  const account = { emailVerified: false };
  const code = prepareCode(account);
  account.emailVerificationExpiresAt = new Date(Date.now() - 1);
  account.emailVerificationSentAt = new Date(Date.now() - 61000);
  assert.equal(verifyCode(account, code), false);
  assert.equal(mayResend(account), true);
});

test("password reset codes verify once without changing email verification", () => {
  const account = { emailVerified: true };
  const code = preparePasswordResetCode(account);
  assert.match(code, /^\d{6}$/);
  assert.equal(maySendPasswordReset(account), false);
  assert.equal(verifyPasswordResetCode(account, code), true);
  assert.equal(account.emailVerified, true);
  assert.equal(account.passwordResetCodeHash, undefined);
  assert.equal(verifyPasswordResetCode(account, code), false);
});

test("expired password reset codes are rejected", () => {
  const account = {};
  const code = preparePasswordResetCode(account);
  account.passwordResetExpiresAt = new Date(Date.now() - 1);
  assert.equal(verifyPasswordResetCode(account, code), false);
});
