import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/firebase.js';

const COLLECTION_NAME = 'conversations';
const inMemoryStore = new Map();

function buildTitle(entries, now) {
  if (entries && entries.length > 0) {
    const first = entries[0];
    const preview = (first.originalText && first.originalText.trim())
      ? first.originalText
      : first.translatedText;
    if (preview) {
      return preview.length > 30 ? `${preview.substring(0, 30)}…` : preview;
    }
  }
  const dateStr = now.toISOString().split('T')[0];
  return `Session ${dateStr}`;
}

function parseFirestoreDoc(doc) {
  if (!doc.exists) return null;
  const data = doc.data();

  const entries = (data.entries || []).map((e) => ({
    id: e.id || uuidv4(),
    originalText: e.originalText || '',
    translatedText: e.translatedText || '',
    sourceLanguage: e.sourceLanguage || 'en',
    targetLanguage: e.targetLanguage || 'ja',
    speaker: e.speaker || 'A',
    tone: e.tone || 'neutral',
    confidence: e.confidence || 'high',
    timestamp: e.timestamp ? (e.timestamp.toDate ? e.timestamp.toDate() : new Date(e.timestamp)) : new Date(),
    audioPlayed: Boolean(e.audioPlayed),
  }));

  return {
    id: doc.id,
    userId: data.userId || 'guest_user',
    title: data.title || 'Session',
    entries,
    sourceLanguage: data.sourceLanguage || 'en',
    targetLanguage: data.targetLanguage || 'ja',
    createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt)) : new Date(),
    updatedAt: data.updatedAt ? (data.updatedAt.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt)) : new Date(),
    entryCount: data.entryCount || entries.length,
  };
}

export async function saveConversation({
  id = null,
  userId = 'guest_user',
  entries = [],
  sourceLanguage = 'en',
  targetLanguage = 'ja',
  title = null,
}) {
  const sessionId = id || uuidv4();
  const now = new Date();

  const formattedEntries = (entries || []).map((e) => ({
    id: e.id || uuidv4(),
    originalText: e.originalText || '',
    translatedText: e.translatedText || '',
    sourceLanguage: e.sourceLanguage || sourceLanguage,
    targetLanguage: e.targetLanguage || targetLanguage,
    speaker: e.speaker || 'A',
    tone: e.tone || 'neutral',
    confidence: e.confidence || 'high',
    timestamp: e.timestamp ? new Date(e.timestamp).toISOString() : now.toISOString(),
    audioPlayed: Boolean(e.audioPlayed),
  }));

  const conversationData = {
    userId,
    title: title || buildTitle(formattedEntries, now),
    entries: formattedEntries,
    sourceLanguage,
    targetLanguage,
    entryCount: formattedEntries.length,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  const fullRecord = {
    id: sessionId,
    ...conversationData,
    createdAt: now,
    updatedAt: now,
  };

  // 1. Always update in-memory store
  inMemoryStore.set(sessionId, fullRecord);

  // 2. Safely attempt to persist to Firestore
  try {
    await db.collection(COLLECTION_NAME).doc(sessionId).set(conversationData, { merge: true });
  } catch (err) {
    console.warn('Firestore conversation save skipped (ADC credentials check):', err.message);
  }

  return fullRecord;
}

export async function getConversation(sessionId) {
  try {
    const doc = await db.collection(COLLECTION_NAME).doc(sessionId).get();
    if (doc.exists) return parseFirestoreDoc(doc);
  } catch (err) {
    console.warn(`Firestore getConversation skipped for ${sessionId}:`, err.message);
  }

  return inMemoryStore.get(sessionId) || null;
}

export async function listConversations(userId = null) {
  try {
    let query = db.collection(COLLECTION_NAME);
    if (userId) {
      query = query.where('userId', '==', userId);
    }
    const snapshot = await query.get();
    if (!snapshot.empty) {
      const conversations = snapshot.docs.map(parseFirestoreDoc);
      return conversations.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
  } catch (err) {
    console.warn('Firestore listConversations skipped:', err.message);
  }

  const all = Array.from(inMemoryStore.values());
  if (!userId) return all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return all.filter((c) => c.userId === userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function deleteConversation(sessionId) {
  inMemoryStore.delete(sessionId);

  try {
    const docRef = db.collection(COLLECTION_NAME).doc(sessionId);
    const doc = await docRef.get();
    if (doc.exists) {
      await docRef.delete();
      return true;
    }
  } catch (err) {
    console.warn(`Firestore deleteConversation skipped for ${sessionId}:`, err.message);
  }

  return true;
}
