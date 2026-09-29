
const { TOTP, generateSecret, generateURI, verify } = require('otplib');
const secret = generateSecret(20);
console.log('Secret:', secret);
const uri = generateURI({ service: 'KovalCloud', account: 'test@example.com', secret, type: 'totp' });
console.log('URI:', uri);
