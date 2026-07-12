export function isEmailLoginDisabled() {
  return process.env.DISABLE_EMAIL_LOGIN === "true";
}
