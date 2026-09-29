
const otplib = require('otplib');
console.log('otplib keys:', Object.keys(otplib));
console.log('typeof authenticator:', typeof otplib.authenticator);
if (!otplib.authenticator && otplib.default) {
  console.log('typeof default.authenticator:', typeof otplib.default.authenticator);
}
