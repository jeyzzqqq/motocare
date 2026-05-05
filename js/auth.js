import { auth } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  GoogleAuthProvider,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// SIGN UP
export function signUp(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

// LOGIN
export function login(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

// GOOGLE SIGN-IN
export async function googleSignIn() {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
}

// AUTH STATE (NO AUTO LOGIN BUG)
onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log("Logged in:", user.email);
  } else {
    console.log("No user logged in");
  }
});