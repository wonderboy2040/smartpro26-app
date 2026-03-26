import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, collection, query, onSnapshot, addDoc, deleteDoc, updateDoc, getDocFromServer, FirestoreError } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Firebase connection test failed. Operating in offline mode.");
    }
  }
}

// --- Firestore Helpers ---

export const collections = {
  users: (userId: string) => doc(db, 'users', userId),
  portfolio: (userId: string) => collection(db, 'users', userId, 'portfolio'),
  logs: (userId: string) => collection(db, 'users', userId, 'logs'),
  chatHistory: (userId: string) => collection(db, 'users', userId, 'chat_history'),
};

export async function saveUser(userId: string, data: any) {
  try {
    await setDoc(collections.users(userId), { ...data, lastSync: new Date().toISOString() }, { merge: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `users/${userId}`);
  }
}

export async function addAsset(userId: string, asset: any) {
  try {
    await addDoc(collections.portfolio(userId), asset);
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, `users/${userId}/portfolio`);
  }
}

export async function deleteAsset(userId: string, assetId: string) {
  try {
    await deleteDoc(doc(db, 'users', userId, 'portfolio', assetId));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `users/${userId}/portfolio/${assetId}`);
  }
}

export async function addLog(userId: string, msg: string, type: 'info' | 'warn' | 'success' | 'error') {
  try {
    await addDoc(collections.logs(userId), {
      msg,
      type,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, `users/${userId}/logs`);
  }
}

export async function addChatMessage(userId: string, role: 'user' | 'model', text: string) {
  try {
    await addDoc(collections.chatHistory(userId), {
      role,
      text,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, `users/${userId}/chat_history`);
  }
}

export { onSnapshot, query, collection };
