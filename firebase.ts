import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, collection, query, onSnapshot, addDoc, deleteDoc, updateDoc, getDocFromServer, FirestoreError } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

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
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
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
      console.error("Please check your Firebase configuration. ");
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

export type { FirebaseUser };
export { signInWithPopup, signOut, onAuthStateChanged, GoogleAuthProvider, onSnapshot, query, collection };
