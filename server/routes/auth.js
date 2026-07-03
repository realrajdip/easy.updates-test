const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// Helper to generate premium initial avatar color
const getRandomColor = () => {
  const colors = [
    '#ed1aa0', // Pink Accent
    '#007d48', // Success Green
    '#1151ff', // Info Blue
    '#0a7281', // Accent Teal
    '#780700', // Deep Sale Red
    '#39393b', // Charcoal
    '#beaffd', // Accent Purple
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

// Helper to generate JWT token
const generateToken = (userId, is2faPending) => {
  return jwt.sign(
    { id: userId, is2faPending },
    process.env.JWT_SECRET || 'fallbacksecret',
    { expiresIn: '30d' }
  );
};

// Helper to generate backup codes
const generateBackupCodes = () => {
  const codes = [];
  for (let i = 0; i < 10; i++) {
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    codes.push(code.slice(0, 4) + '-' + code.slice(4));
  }
  return codes;
};

// @route   POST api/auth/register
// @desc    Register user and start 2FA onboarding
// @access  Public
router.post('/register', async (req, res) => {
  let { email, username, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ message: 'Please enter email and password' });
    }

    let userExists = await User.findOne({ email: email.toLowerCase() });
    if (userExists) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Derive username if not provided
    if (!username || username.trim() === '') {
      username = email.split('@')[0];
    }
    
    username = username.toLowerCase().trim();

    // Ensure username uniqueness
    let isUnique = false;
    let baseUsername = username;
    let suffix = 1;
    while (!isUnique) {
      const existingUsername = await User.findOne({ username });
      if (existingUsername) {
        username = `${baseUsername}${suffix}`;
        suffix++;
      } else {
        isUnique = true;
      }
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate speakeasy TOTP secret
    const secret = speakeasy.generateSecret({
      name: `EasyUpdates:${username}`
    });

    // Generate Backup Codes
    const backupCodes = generateBackupCodes();

    const isDevTest = process.env.NODE_ENV === 'development' && username.startsWith('test_');
    const user = new User({
      email: email.toLowerCase(),
      username: username,
      password: hashedPassword,
      avatarColor: getRandomColor(),
      twoFactorSecret: secret.base32,
      isTwoFactorEnabled: false,
      backupCodes: backupCodes,
      approvalStatus: isDevTest ? 'approved' : 'pending',
      isApproved: isDevTest
    });

    await user.save();

    // Generate QR Code URI
    const qrCodeDataUrl = await qrcode.toDataURL(secret.otpauth_url);

    // Generate a temporary JWT token with 2FA pending
    const token = generateToken(user._id, true);

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.status(201).json({
      message: 'Registration successful. Configure 2FA to complete setup.',
      token,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        avatarColor: user.avatarColor,
        isTwoFactorEnabled: false,
        approvalStatus: user.approvalStatus
      },
      qrCode: qrCodeDataUrl,
      secret: secret.base32,
      backupCodes
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// @route   POST api/auth/login
// @desc    Authenticate user & check if 2FA is needed
// @access  Public
router.post('/login', async (req, res) => {
  const { username, password } = req.body; // 'username' could be email or username

  try {
    if (!username || !password) {
      return res.status(400).json({ message: 'Please enter all fields' });
    }

    const searchTerm = username.toLowerCase();
    const user = await User.findOne({
      $or: [
        { email: searchTerm },
        { username: searchTerm }
      ]
    });
    
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // A token is signed with is2faPending = true until verified
    const token = generateToken(user._id, true);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    let qrCode = null;
    let secret = null;
    let backupCodes = null;

    if (!user.isTwoFactorEnabled) {
      const otpauth_url = speakeasy.otpauthURL({
        secret: user.twoFactorSecret,
        label: `EasyUpdates:${user.username}`,
        encoding: 'base32'
      });
      qrCode = await qrcode.toDataURL(otpauth_url);
      secret = user.twoFactorSecret;
      backupCodes = user.backupCodes;
    }

    res.json({
      message: user.isTwoFactorEnabled
        ? 'Please enter your 2FA OTP code.'
        : 'Please complete 2FA setup.',
      token,
      is2faRequired: user.isTwoFactorEnabled,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        avatarColor: user.avatarColor,
        isTwoFactorEnabled: user.isTwoFactorEnabled,
        approvalStatus: user.approvalStatus
      },
      qrCode,
      secret,
      backupCodes
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// @route   POST api/auth/2fa/verify
// @desc    Verify 2FA TOTP code for login or initial setup completion
// @access  Private (2FA pending token permitted via JWT)
router.post('/2fa/verify', protect, async (req, res) => {
  const { code } = req.body;

  try {
    if (!code) {
      return res.status(400).json({ message: 'Please enter verification code' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify TOTP token using speakeasy
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code,
      window: 1 // 30s window allowance
    });

    if (!verified) {
      return res.status(400).json({ message: 'Invalid 2FA code' });
    }

    // If initial setup, mark it enabled
    let responseData = { message: '2FA verification successful' };
    if (!user.isTwoFactorEnabled) {
      user.isTwoFactorEnabled = true;
      await user.save();
      responseData.backupCodes = user.backupCodes; // Return backup codes upon initial confirmation
    }

    // Issue new JWT token with is2faPending = false
    const token = generateToken(user._id, false);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.json({
      ...responseData,
      token,
      user: {
        id: user._id,
        username: user.username,
        avatarColor: user.avatarColor,
        isTwoFactorEnabled: true,
        approvalStatus: user.approvalStatus
      }
    });

  } catch (error) {
    console.error('2FA Verification error:', error);
    res.status(500).json({ message: 'Server error during 2FA verification' });
  }
});

// @route   POST api/auth/2fa/backup-verify
// @desc    Login using a 2FA backup code
// @access  Private (2FA pending token permitted)
router.post('/2fa/backup-verify', protect, async (req, res) => {
  const { backupCode } = req.body;

  try {
    if (!backupCode) {
      return res.status(400).json({ message: 'Please enter a backup code' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if backup code exists in user's list
    const cleanCode = backupCode.trim().toUpperCase();
    const codeIndex = user.backupCodes.indexOf(cleanCode);

    if (codeIndex === -1) {
      return res.status(400).json({ message: 'Invalid backup code' });
    }

    // Remove the used backup code
    user.backupCodes.splice(codeIndex, 1);
    await user.save();

    // Issue authenticated JWT token
    const token = generateToken(user._id, false);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.json({
      message: 'Backup code accepted. Authenticated successfully.',
      token,
      user: {
        id: user._id,
        username: user.username,
        avatarColor: user.avatarColor,
        isTwoFactorEnabled: true,
        approvalStatus: user.approvalStatus
      }
    });

  } catch (error) {
    console.error('Backup verification error:', error);
    res.status(500).json({ message: 'Server error during backup verification' });
  }
});

// @route   POST api/auth/2fa/regenerate-secrets
// @desc    Regenerate 2FA secret QR and backup codes (used to reset/re-enroll 2FA)
// @access  Private (Fully authenticated only)
router.post('/2fa/regenerate-secrets', protect, async (req, res) => {
  // Disallowed if pending
  if (req.is2faPending) {
    return res.status(403).json({ message: 'Complete 2FA to access this resource' });
  }

  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const secret = speakeasy.generateSecret({
      name: `EasyUpdates:${user.username}`
    });

    const backupCodes = generateBackupCodes();

    user.twoFactorSecret = secret.base32;
    user.isTwoFactorEnabled = false; // Set to false until they verify the new setup code
    user.backupCodes = backupCodes;
    await user.save();

    const qrCodeDataUrl = await qrcode.toDataURL(secret.otpauth_url);

    // Set JWT state back to pending because 2FA needs verification of the new secret
    const token = generateToken(user._id, true);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.json({
      message: 'Secrets generated. Verify the new OTP code to re-enable 2FA.',
      token,
      qrCode: qrCodeDataUrl,
      secret: secret.base32,
      backupCodes
    });

  } catch (error) {
    console.error('Regenerate secrets error:', error);
    res.status(500).json({ message: 'Server error during secrets regeneration' });
  }
});

// @route   POST api/auth/password-reset
// @desc    Reset password requiring username, 2FA code (or backup code), and new password
// @access  Public
router.post('/password-reset', async (req, res) => {
  const { username, code, newPassword } = req.body; // username could be email

  try {
    if (!username || !code || !newPassword) {
      return res.status(400).json({ message: 'Please enter all fields' });
    }

    const searchTerm = username.toLowerCase();
    const user = await User.findOne({
      $or: [
        { email: searchTerm },
        { username: searchTerm }
      ]
    });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify code: either TOTP or a backup code
    let isVerified = false;

    // Check TOTP
    if (user.twoFactorSecret) {
      isVerified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: code,
        window: 1
      });
    }

    // Check backup codes if not verified
    if (!isVerified) {
      const cleanCode = code.trim().toUpperCase();
      const codeIndex = user.backupCodes.indexOf(cleanCode);
      if (codeIndex !== -1) {
        isVerified = true;
        // Consume the backup code
        user.backupCodes.splice(codeIndex, 1);
      }
    }

    if (!isVerified) {
      return res.status(400).json({ message: 'Invalid 2FA code or backup code' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    await user.save();

    res.json({ message: 'Password reset successful. You can now login.' });

  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ message: 'Server error during password reset' });
  }
});

// @route   GET api/auth/me
// @desc    Get current logged in user details
// @access  Private (Valid for both fully verified and pending states, but response reveals states)
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    let qrCode = null;
    let secret = null;
    let backupCodes = null;

    if (user && !user.isTwoFactorEnabled) {
      const otpauth_url = speakeasy.otpauthURL({
        secret: user.twoFactorSecret,
        label: `EasyUpdates:${user.username}`,
        encoding: 'base32'
      });
      qrCode = await qrcode.toDataURL(otpauth_url);
      secret = user.twoFactorSecret;
      backupCodes = user.backupCodes;
    }

    res.json({
      user,
      is2faPending: req.is2faPending,
      qrCode,
      secret,
      backupCodes
    });
  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({ message: 'Server error retrieving user data' });
  }
});

// @route   POST api/auth/logout
// @desc    Logout user by clearing cookies
// @access  Private
router.post('/logout', protect, async (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

// @route   GET api/auth/vapid-public-key
// @desc    Get VAPID public key for push subscriptions
// @access  Public
router.get('/vapid-public-key', (req, res) => {
  const pushService = require('../services/pushService');
  res.json({ publicKey: pushService.getPublicKey() });
});

// @route   POST api/auth/request-access
// @desc    Request access again for a rejected user
// @access  Private (accessible to rejected users via middleware bypass)
router.post('/request-access', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    if (user.approvalStatus !== 'rejected') {
      return res.status(400).json({ message: 'Can only request access for revoked accounts' });
    }
    
    user.approvalStatus = 'pending';
    user.actedBy = null;
    user.actionDate = null;
    await user.save();
    
    // Broadcast auth update to notify user socket
    const io = req.app.get('socketio');
    if (io) {
      io.to(user._id.toString()).emit('auth:update', { approvalStatus: user.approvalStatus, role: user.role });
    }
    
    res.json({ message: 'Access request submitted successfully', user });
  } catch (error) {
    console.error('Request access error:', error);
    res.status(500).json({ message: 'Server error requesting access' });
  }
});

module.exports = router;
