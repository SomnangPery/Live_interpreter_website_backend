import { auth } from '../config/firebase.js';

/**
 * Middleware to strictly verify Firebase ID token in Authorization header
 */
export async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized. Authorization Bearer token is required.' });
  }

  const idToken = authHeader.split('Bearer ')[1].trim();

  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    req.user = {
      uid: decodedToken.uid,
      userId: decodedToken.uid,
      email: decodedToken.email || '',
      name: decodedToken.name || decodedToken.displayName || '',
      picture: decodedToken.picture || '',
    };
    next();
  } catch (error) {
    console.error('Firebase token verification failed:', error.message);
    return res.status(401).json({ error: 'Unauthorized. Invalid or expired authentication token.' });
  }
}

/**
 * Middleware to optionally verify Firebase ID token (allows guest operations if token absent)
 */
export async function optionalFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const idToken = authHeader.split('Bearer ')[1].trim();
    try {
      const decodedToken = await auth.verifyIdToken(idToken);
      req.user = {
        uid: decodedToken.uid,
        userId: decodedToken.uid,
        email: decodedToken.email || '',
        name: decodedToken.name || decodedToken.displayName || '',
        picture: decodedToken.picture || '',
      };
    } catch (error) {
      console.warn('Optional token verification failed, proceeding as guest:', error.message);
      req.user = null;
    }
  } else {
    req.user = null;
  }

  next();
}
