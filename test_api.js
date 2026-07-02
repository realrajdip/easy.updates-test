const speakeasy = require('speakeasy');

const runTests = async () => {
  const username = `test_${Math.floor(Math.random() * 100000)}`;
  const password = 'password123';
  let token = '';
  let secret = '';
  let backupCodes = [];

  console.log(`--- Running Automated API Flow Tests for User: ${username} ---`);

  // 1. Test Registration
  try {
    const registerRes = await fetch('http://localhost:5050/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    if (registerRes.status !== 201) {
      throw new Error(`Register failed with status ${registerRes.status}`);
    }
    
    const data = await registerRes.json();
    token = data.token;
    secret = data.secret;
    backupCodes = data.backupCodes;
    console.log('✅ Registration step successful. Secret key generated:', secret);
    console.log('✅ Backup codes generated successfully:', backupCodes.length);
  } catch (err) {
    console.error('❌ Registration test failed:', err);
    process.exit(1);
  }

  // 2. Test 2FA TOTP Verification (Initial Setup)
  try {
    // Generate code using speakeasy
    const otp = speakeasy.totp({
      secret: secret,
      encoding: 'base32'
    });
    console.log('Generated OTP Code:', otp);

    const verifyRes = await fetch('http://localhost:5050/api/auth/2fa/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ code: otp })
    });

    if (verifyRes.status !== 200) {
      throw new Error(`2FA verification failed with status ${verifyRes.status}`);
    }

    const data = await verifyRes.json();
    token = data.token; // Save the fully authenticated token
    console.log('✅ 2FA initial verification completed. Account fully enabled.');
  } catch (err) {
    console.error('❌ 2FA verification test failed:', err);
    process.exit(1);
  }

  // 3. Test Login
  let loginToken = '';
  try {
    const loginRes = await fetch('http://localhost:5050/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (loginRes.status !== 200) {
      throw new Error(`Login failed with status ${loginRes.status}`);
    }

    const data = await loginRes.json();
    loginToken = data.token;
    if (!data.is2faRequired) {
      throw new Error('Expected 2fa to be required upon login');
    }
    console.log('✅ Credentials login accepted. 2FA is required as expected.');
  } catch (err) {
    console.error('❌ Login test failed:', err);
    process.exit(1);
  }

  // 4. Test 2FA Backup Code Verification for Login
  try {
    const selectedBackupCode = backupCodes[0];
    console.log('Attempting login using backup code:', selectedBackupCode);

    const backupVerifyRes = await fetch('http://localhost:5050/api/auth/2fa/backup-verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${loginToken}`
      },
      body: JSON.stringify({ backupCode: selectedBackupCode })
    });

    if (backupVerifyRes.status !== 200) {
      const errData = await backupVerifyRes.json();
      throw new Error(`Backup verify failed with status ${backupVerifyRes.status}: ${errData.message}`);
    }

    const data = await backupVerifyRes.json();
    token = data.token; // Save new fully authenticated token
    console.log('✅ Backup code login successful. Session authenticated.');
  } catch (err) {
    console.error('❌ Backup verification test failed:', err);
    process.exit(1);
  }

  // 5. Test Update Creation (Secure route validation)
  try {
    const updateRes = await fetch('http://localhost:5050/api/updates', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        description: 'Handover report: all servers running correctly on fallback port 5050.',
        isPinned: true
      })
    });

    if (updateRes.status !== 201) {
      throw new Error(`Update creation failed with status ${updateRes.status}`);
    }

    const updateData = await updateRes.json();
    console.log('✅ Secure routes verified. Shift update published:', updateData.description);
  } catch (err) {
    console.error('❌ Secure routes test failed:', err);
    process.exit(1);
  }

  console.log('\n🎉 ALL MERN BACKEND & 2FA SECURITY FLOW TESTS PASSED SUCCESSFULLY! 🎉\n');
};

runTests();
