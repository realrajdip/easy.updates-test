const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

const KEYS_PATH = path.join(__dirname, '..', '.vapid-keys.json');
let publicKey = '';
let privateKey = '';

// Load or generate VAPID keys
if (fs.existsSync(KEYS_PATH)) {
  try {
    const keys = JSON.parse(fs.readFileSync(KEYS_PATH, 'utf8'));
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
  } catch (err) {
    console.error('Error reading VAPID keys, regenerating:', err);
  }
}

if (!publicKey || !privateKey) {
  const keys = webpush.generateVAPIDKeys();
  publicKey = keys.publicKey;
  privateKey = keys.privateKey;
  try {
    fs.writeFileSync(KEYS_PATH, JSON.stringify(keys, null, 2), 'utf8');
    console.log('Generated new VAPID keys and saved to .vapid-keys.json');
  } catch (err) {
    console.error('Error writing VAPID keys:', err);
  }
}

webpush.setVapidDetails(
  'mailto:admin@easyupdates.com',
  publicKey,
  privateKey
);

/**
 * Send a web push notification payload to a subscription.
 * Returns true if successful, false if the subscription is invalid/expired (410/404).
 */
const sendPush = async (subscription, payload) => {
  if (!subscription || !subscription.endpoint) return false;
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return true;
  } catch (err) {
    // 410 Gone or 404 Not Found indicates subscription expired or invalid
    if (err.statusCode === 410 || err.statusCode === 404) {
      console.log(`Push subscription expired/invalid (status ${err.statusCode}). Cleaning up.`);
      return false;
    }
    console.error('Error sending push notification:', err.message || err);
    return true; // Keep subscription for other transient errors
  }
};

module.exports = {
  getPublicKey: () => publicKey,
  sendPush
};
