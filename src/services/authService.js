import { auth, db } from '../config/firebase.js';
import { config } from '../config/env.js';

const USERS_COLLECTION = 'users';

/**
 * Register a new user with email, password, and display name using Firebase Auth REST API.
 * Syncs user profile document to Firestore /users/{uid}.
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
    createdAt: now,
    updatedAt: now,
  };

  // 3. Safely attempt to persist User Profile in Firestore (/users/{uid})
  try {
    await db.collection(USERS_COLLECTION).doc(uid).set(userProfile, { merge: true });
  } catch (err) {
    console.warn('Firestore write skipped or failed:', err.message);
  }

  return {
    user: userProfile,
    idToken,
    refreshToken: data.refreshToken,
    expiresIn: data.expiresIn,
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
 * Trigger Firebase Password Reset Email
 */
export async function sendPasswordReset(email) {
  if (!email || !email.trim()) {
    throw new Error('Email address is required.');
  }

  const apiKey = config.firebaseWebApiKey;
  if (!apiKey) {
    throw new Error('Firebase Web API key is missing in server configuration.');
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestType: 'PASSWORD_RESET',
        email: email.trim(),
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const errorMsg = data?.error?.message || 'Failed to send password reset email.';
    throw new Error(mapFirebaseError(errorMsg));
  }

  return { success: true, message: 'Password reset email sent successfully.' };
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
