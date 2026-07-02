const speakeasy = require('speakeasy');

const secret = process.argv[2];
if (!secret) {
  console.error('Please provide the secret key');
  process.exit(1);
}

const token = speakeasy.totp({
  secret: secret,
  encoding: 'base32'
});

console.log('Current TOTP Token:', token);
