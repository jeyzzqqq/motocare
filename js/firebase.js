import {
  getApp,
  getApps,
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  setDoc,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDh8x7yRqZCiDKeGezlHoPEn4OBKidw3ys",
  authDomain: "motocare-b874a.firebaseapp.com",
  databaseURL: "https://motocare-b874a-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "motocare-b874a",
  storageBucket: "motocare-b874a.firebasestorage.app",
  messagingSenderId: "848906922742",
  appId: "1:848906922742:web:934e0c90f1950d118cdad7",
  measurementId: "G-ZC8E92M3M9"
};

const configured = Object.values(firebaseConfig).every((value) => value && !String(value).startsWith("YOUR_"));

let app = null;
let auth = null;
let db = null;

if (configured) {
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function requireFirebaseReady() {
  if (!isFirebaseReady()) {
    throw new Error("MotoCare is not configured for Firebase yet.");
  }
}

async function upsertUserDocument(user) {
  if (!user?.uid) {
    return;
  }
  const userRef = doc(db, "users", user.uid);
  const current = await getDoc(userRef);
  if (!current.exists()) {
    await setDoc(userRef, {
      uid: user.uid,
      email: user.email || "",
      displayName: user.displayName || user.email?.split("@")[0] || "Rider",
      photoURL: user.photoURL || "",
      createdAt: new Date(),
      updatedAt: new Date()
    });
    return;
  }
  await setDoc(userRef, {
    email: user.email || current.data().email || "",
    displayName: user.displayName || current.data().displayName || "Rider",
    photoURL: user.photoURL || current.data().photoURL || "",
    updatedAt: new Date()
  }, { merge: true });
}

export function isFirebaseReady() {
  return configured && auth && db;
}

export function getCurrentUser() {
  if (!isFirebaseReady()) {
    return null;
  }
  return auth.currentUser;
}

export function onAuthChange(callback) {
  if (!isFirebaseReady()) {
    queueMicrotask(() => callback(null));
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

export async function loginUser(email, password) {
  requireFirebaseReady();
  const credential = await signInWithEmailAndPassword(auth, normalizeEmail(email), password);
  await upsertUserDocument(credential.user);
  return credential.user;
}

export async function loginWithGoogle() {
  requireFirebaseReady();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const credential = await signInWithPopup(auth, provider);
  await upsertUserDocument(credential.user);
  return credential.user;
}

export async function registerUser(email, password, displayName) {
  requireFirebaseReady();
  const credential = await createUserWithEmailAndPassword(auth, normalizeEmail(email), password);
  if (displayName?.trim()) {
    await updateProfile(credential.user, { displayName: displayName.trim() });
  }
  await upsertUserDocument(credential.user);
  return credential.user;
}

export async function logoutUser() {
  requireFirebaseReady();
  await signOut(auth);
}

async function getActiveUid() {
  const user = getCurrentUser();
  return user ? user.uid : null;
}

function normalizeRecord(record) {
  return {
    ...record,
    createdAt: record.createdAt || nowIso(),
    updatedAt: record.updatedAt || nowIso(),
    uid: record.uid
  };
}

function sortRecords(records) {
  return [...records].sort((left, right) => {
    const leftValue = new Date(left.createdAt || left.date || 0).getTime();
    const rightValue = new Date(right.createdAt || right.date || 0).getTime();
    return rightValue - leftValue;
  });
}

export async function getUserProfile() {
  const uid = await getActiveUid();
  if (!uid) {
    return null;
  }
  requireFirebaseReady();
  const snapshot = await getDoc(doc(db, "users", uid));
  if (!snapshot.exists()) {
    const user = getCurrentUser();
    return user
      ? {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email?.split("@")[0] || "Rider"
      }
      : null;
  }
  return { id: snapshot.id, ...snapshot.data() };
}

export async function saveUserProfile(profile) {
  const uid = await getActiveUid();
  if (!uid) {
    throw new Error("You must be signed in to save a profile.");
  }
  requireFirebaseReady();
  const payload = {
    uid,
    ...profile,
    updatedAt: nowIso()
  };
  await setDoc(doc(db, "users", uid), payload, { merge: true });
  return payload;
}

export async function listUserRecords(collectionName) {
  const uid = await getActiveUid();
  if (!uid) {
    return [];
  }
  requireFirebaseReady();
  const snapshot = await getDocs(query(collection(db, collectionName), where("uid", "==", uid)));
  return sortRecords(snapshot.docs.map((record) => ({ id: record.id, ...record.data() })));
}

export async function saveUserRecord(collectionName, record, id = null) {
  const uid = await getActiveUid();
  if (!uid) {
    throw new Error("You must be signed in to save records.");
  }
  requireFirebaseReady();
  const payload = normalizeRecord({
    ...record,
    uid
  });
  if (id) {
    await updateDoc(doc(db, collectionName, id), payload);
    return { id, ...payload };
  }
  const created = await addDoc(collection(db, collectionName), payload);
  return { id: created.id, ...payload };
}

export async function deleteUserRecord(collectionName, id) {
  const uid = await getActiveUid();
  if (!uid) {
    throw new Error("You must be signed in to delete records.");
  }
  requireFirebaseReady();
  if (!id) {
    throw new Error("Record id is required.");
  }
  await deleteDoc(doc(db, collectionName, id));
}

export async function getPrimaryMotorcycle() {
  const motorcycles = await listUserRecords("motorcycles");
  return motorcycles[0] || null;
}

export function getCollectionLabel(collectionName) {
  return {
    users: "Users",
    motorcycles: "Motorcycles",
    maintenance: "Maintenance",
    repairs: "Repairs",
    expenses: "Expenses"
  }[collectionName] || collectionName;
}