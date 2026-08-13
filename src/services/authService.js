import { auth, db } from '../config/firebase.js';
import { config } from '../config/env.js';
import { sendVerificationEmail, sendPasswordResetEmail } from './emailService.js';

const USERS_COLLECTION = 'users';

// In-memory stores for 6-digit verification codes and password reset codes
const verificationStore = new Map();
const passwordResetStore = new Map();

/**
 * Helper: Save 6-digit OTP password reset code in memory and Firestore
 */
async function savePasswordResetCode(email, code) {
  const normalizedEmail = email.trim().toLowerCase();
  const now = Date.now();
  const expiresAt = now + 15 * 60 * 1000; // 15 minutes validity
  const record = {
    email: normalizedEmail,
    code,
    createdAt: new Date(now).toISOString(),
    expiresAt,
  };

  passwordResetStore.set(normalizedEmail, record);

  try {
    await db.collection('password_resets').doc(normalizedEmail).set(record);
  } catch (err) {
    console.warn(`[Firestore] password reset code save skipped/failed for ${normalizedEmail}:`, err.message);
  }
  return record;
}

/**
 * Helper: Generate 6-digit OTP code string
 */
function generate6DigitCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Helper: Save 6-digit OTP verification code in memory and Firestore
 */
async function saveVerificationCode(email, code) {
  const normalizedEmail = email.trim().toLowerCase();
  const now = Date.now();
  const expiresAt = now + 15 * 60 * 1000; // 15 minutes validity
  const record = {
    email: normalizedEmail,
    code,
    createdAt: new Date(now).toISOString(),
    expiresAt,
  };

  verificationStore.set(normalizedEmail, record);

  try {
    await db.collection('email_verifications').doc(normalizedEmail).set(record);
  } catch (err) {
    console.warn(`[Firestore] verification code save skipped/failed for ${normalizedEmail}:`, err.message);
  }
  return record;
}

/**
 * Register a new user with email, password, and display name using Firebase Auth REST API.
 * Syncs user profile document to Firestore /users/{uid} and sends 6-digit verification email.
 */
export async function signUp({ email, password, displayName }) {
  if (!email || !password) {
    throw new Error('Email and password are required.');
  }

  const trimmedEmail = email.trim();
  const trimmedName = (displayName || '').trim();
  const apiKey = config.firebaseWebApiKey;

  if (!apiKey) {
    throw new Error('Firebase Web API key is missing in server configuration.');
  }

  // 1. Create User via Firebase Auth REST API
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: trimmedEmail,
        password,
        returnSecureToken: true,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const errorMsg = data?.error?.message || 'Registration failed.';
    throw new Error(mapFirebaseError(errorMsg));
  }

  const uid = data.localId;
  let idToken = data.idToken;

  // 2. Set display name via REST API if provided
  if (trimmedName) {
    try {
      const updateRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idToken: data.idToken,
            displayName: trimmedName,
            returnSecureToken: true,
          }),
        }
      );
      const updateData = await updateRes.json();
      if (updateData.idToken) idToken = updateData.idToken;
    } catch (_) {}
  }

  const now = new Date().toISOString();
  const userProfile = {
    uid,
    email: trimmedEmail,
    displayName: trimmedName || '',
    photoURL: null,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  };

  // 3. Safely attempt to persist User Profile in Firestore (/users/{uid})
  try {
    await db.collection(USERS_COLLECTION).doc(uid).set(userProfile, { merge: true });
  } catch (err) {
    console.warn('Firestore write skipped or failed:', err.message);
  }

  // 4. Generate 6-digit verification code and send email
  const verificationCode = generate6DigitCode();
  await saveVerificationCode(trimmedEmail, verificationCode);
  try {
    await sendVerificationEmail({ toEmail: trimmedEmail, code: verificationCode, displayName: trimmedName });
  } catch (emailErr) {
    console.warn('Sending verification email failed:', emailErr.message);
  }

  return {
    message: 'Registration successful. A 6-digit verification code has been sent to your email.',
    user: userProfile,
    idToken,
    refreshToken: data.refreshToken,
    expiresIn: data.expiresIn,
    emailVerified: false,
  };
}

/**
 * Sign in existing user with email and password via Firebase Identity Toolkit REST API.
 */
export async function signIn({ email, password }) {
  if (!email || !password) {
    throw new Error('Email and password are required.');
  }

  const trimmedEmail = email.trim();

  // 1. Authenticate credentials via REST API
  const tokenData = await signInWithPassword(trimmedEmail, password);
  const uid = tokenData.localId;

  // 2. Fetch or construct User Profile
  let userProfile = await getUserProfile(uid);

  if (!userProfile) {
    userProfile = {
      uid,
      email: tokenData.email || trimmedEmail,
      displayName: tokenData.displayName || '',
      photoURL: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Safely attempt to create user profile in Firestore
    try {
      await db.collection(USERS_COLLECTION).doc(uid).set(userProfile, { merge: true });
    } catch (err) {
      console.warn('Firestore write skipped (Service Account Key check):', err.message);
    }
  }

  return {
    user: userProfile,
    idToken: tokenData.idToken,
    refreshToken: tokenData.refreshToken,
    expiresIn: tokenData.expiresIn,
  };
}

/**
 * Trigger 6-digit OTP Password Reset Email
 */
export async function sendPasswordReset(email) {
  if (!email || !email.trim()) {
    throw new Error('Email address is required.');
  }

  const normalizedEmail = email.trim().toLowerCase();

  let displayName = '';
  try {
    const usersSnapshot = await db.collection(USERS_COLLECTION).where('email', '==', normalizedEmail).get();
    if (!usersSnapshot.empty) {
      displayName = usersSnapshot.docs[0].data()?.displayName || '';
    }
  } catch (_) {}

  const code = generate6DigitCode();
  await savePasswordResetCode(normalizedEmail, code);

  await sendPasswordResetEmail({ toEmail: normalizedEmail, code, displayName });

  return {
    success: true,
    message: `Password reset code sent to ${normalizedEmail}.`,
  };
}

/**
 * Get User Profile document from Firestore (safely wrapped)
 */
export async function getUserProfile(uid) {
  try {
    const doc = await db.collection(USERS_COLLECTION).doc(uid).get();
    if (!doc.exists) return null;
    return doc.data();
  } catch (err) {
    console.warn(`Firestore getUserProfile failed for ${uid}:`, err.message);
    return null;
  }
}

/**
 * Update User Profile display name / photoURL in Auth and Firestore
 */
export async function updateUserProfile(uid, { displayName, photoURL }) {
  const updates = {};
  if (displayName !== undefined) updates.displayName = displayName.trim();
  if (photoURL !== undefined) updates.photoURL = photoURL;

  // 1. Update Firebase Auth record safely
  if (Object.keys(updates).length > 0) {
    try {
      await auth.updateUser(uid, updates);
    } catch (err) {
      console.warn('Firebase Admin updateUser skipped:', err.message);
    }
  }

  // 2. Safely update Firestore document
  const now = new Date().toISOString();
  const firestoreUpdates = {
    ...updates,
    updatedAt: now,
  };

  try {
    await db.collection(USERS_COLLECTION).doc(uid).set(firestoreUpdates, { merge: true });
  } catch (err) {
    console.warn('Firestore update profile skipped:', err.message);
  }

  const profile = await getUserProfile(uid);
  return profile || { uid, ...updates, updatedAt: now };
}

/**
 * Helper: Sign in via Firebase Auth REST API
 */
async function signInWithPassword(email, password) {
  const apiKey = config.firebaseWebApiKey;
  if (!apiKey) {
    throw new Error('Firebase Web API key is missing in server configuration.');
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const errorMsg = data?.error?.message || 'Authentication failed.';
    throw new Error(mapFirebaseError(errorMsg));
  }

  return data;
}

/**
 * Map Firebase Auth REST Error codes to user friendly messages
 */
function mapFirebaseError(code) {
  switch (code) {
    case 'EMAIL_NOT_FOUND':
      return 'No account found with this email address.';
    case 'INVALID_PASSWORD':
      return 'Incorrect password. Please try again.';
    case 'USER_DISABLED':
      return 'This user account has been disabled.';
    case 'EMAIL_EXISTS':
      return 'An account with this email address already exists.';
    case 'INVALID_EMAIL':
      return 'Invalid email address format.';
    case 'TOO_MANY_ATTEMPTS_TRY_LATER':
      return 'Access to this account has been temporarily disabled due to many failed login attempts.';
    default:
      return code.replace(/_/g, ' ').toLowerCase();
  }
}

/**
 * Verify 6-digit code for a user's email address
 */
export async function verifyEmailCode({ email, code }) {
  if (!email || !code) {
    throw new Error('Email address and 6-digit verification code are required.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const cleanCode = code.toString().trim();

  let record = verificationStore.get(normalizedEmail);

  if (!record) {
    try {
      const doc = await db.collection('email_verifications').doc(normalizedEmail).get();
      if (doc.exists) {
        record = doc.data();
      }
    } catch (_) {}
  }

  if (!record) {
    throw new Error('No verification code found for this email. Please request a new code.');
  }

  if (Date.now() > record.expiresAt) {
    verificationStore.delete(normalizedEmail);
    throw new Error('Verification code has expired. Please request a new code.');
  }

  if (record.code !== cleanCode) {
    throw new Error('Invalid verification code. Please check and try again.');
  }

  // Verification succeeded - clear verification record
  verificationStore.delete(normalizedEmail);
  try {
    await db.collection('email_verifications').doc(normalizedEmail).delete();
  } catch (_) {}

  // Update user document emailVerified status
  let updatedUser = null;
  const now = new Date().toISOString();
  try {
    const usersSnapshot = await db.collection(USERS_COLLECTION).where('email', '==', normalizedEmail).get();
    if (!usersSnapshot.empty) {
      const userDoc = usersSnapshot.docs[0];
      const uid = userDoc.id;
      await db.collection(USERS_COLLECTION).doc(uid).set({
        emailVerified: true,
        verifiedAt: now,
        updatedAt: now,
      }, { merge: true });

      try {
        await auth.updateUser(uid, { emailVerified: true });
      } catch (_) {}

      const freshDoc = await db.collection(USERS_COLLECTION).doc(uid).get();
      if (freshDoc.exists) updatedUser = freshDoc.data();
    }
  } catch (err) {
    console.warn('Updating user profile verification status skipped/failed:', err.message);
  }

  return {
    success: true,
    message: 'Email address verified successfully.',
    emailVerified: true,
    user: updatedUser,
  };
}

/**
 * Resend a new 6-digit verification code to user's email
 */
export async function resendVerificationCode(email) {
  if (!email || !email.trim()) {
    throw new Error('Email address is required.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const code = generate6DigitCode();
  await saveVerificationCode(normalizedEmail, code);

  let displayName = '';
  try {
    const usersSnapshot = await db.collection(USERS_COLLECTION).where('email', '==', normalizedEmail).get();
    if (!usersSnapshot.empty) {
      displayName = usersSnapshot.docs[0].data()?.displayName || '';
    }
  } catch (_) {}

  await sendVerificationEmail({ toEmail: normalizedEmail, code, displayName });

  return {
    success: true,
    message: `Verification code resent to ${normalizedEmail}.`,
  };
}

/**
 * Verify 6-digit password reset code
 */
export async function verifyResetCode({ email, code }) {
  if (!email || !code) {
    throw new Error('Email address and 6-digit password reset code are required.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const cleanCode = code.toString().trim();

  let record = passwordResetStore.get(normalizedEmail);

  if (!record) {
    try {
      const doc = await db.collection('password_resets').doc(normalizedEmail).get();
      if (doc.exists) {
        record = doc.data();
      }
    } catch (_) {}
  }

  if (!record) {
    throw new Error('No password reset request found for this email address. Please request a new code.');
  }

  if (Date.now() > record.expiresAt) {
    passwordResetStore.delete(normalizedEmail);
    throw new Error('Password reset code has expired. Please request a new code.');
  }

  if (record.code !== cleanCode) {
    throw new Error('Invalid password reset code. Please check and try again.');
  }

  return {
    valid: true,
    message: 'Password reset code is valid.',
  };
}

/**
 * Reset user password with verified 6-digit reset code
 */
export async function confirmPasswordReset({ email, code, newPassword }) {
  if (!email || !code || !newPassword) {
    throw new Error('Email address, 6-digit reset code, and new password are required.');
  }

  if (newPassword.length < 6) {
    throw new Error('New password must be at least 6 characters long.');
  }

  // 1. Verify code validity
  await verifyResetCode({ email, code });

  const normalizedEmail = email.trim().toLowerCase();

  // 2. Find user UID
  let uid = null;
  try {
    const usersSnapshot = await db.collection(USERS_COLLECTION).where('email', '==', normalizedEmail).get();
    if (!usersSnapshot.empty) {
      uid = usersSnapshot.docs[0].id;
    }
  } catch (_) {}

  if (!uid) {
    try {
      const userRecord = await auth.getUserByEmail(normalizedEmail);
      uid = userRecord.uid;
    } catch (_) {}
  }

  if (!uid) {
    throw new Error('No account found associated with this email address.');
  }

  // 3. Update password in Firebase Auth
  try {
    await auth.updateUser(uid, { password: newPassword });
  } catch (err) {
    console.warn('[Firebase Admin] updateUser password error:', err.message);
    throw new Error(`Failed to update password: ${err.message}`);
  }

  // 4. Clean up password reset record
  passwordResetStore.delete(normalizedEmail);
  try {
    await db.collection('password_resets').doc(normalizedEmail).delete();
  } catch (_) {}

  // 5. Update user document timestamp
  const now = new Date().toISOString();
  try {
    await db.collection(USERS_COLLECTION).doc(uid).set({ updatedAt: now }, { merge: true });
  } catch (_) {}

  return {
    success: true,
    message: 'Your password has been reset successfully. You can now log in with your new password.',
  };
}


