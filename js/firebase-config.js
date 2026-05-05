// Firebase v9+ modular SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDh8x7yRqZCiDKeGezlHoPEn4OBKidw3ys",
  authDomain: "motocare-b874a.firebaseapp.com",
  projectId: "motocare-b874a",
  storageBucket: "motocare-b874a.appspot.com",
  messagingSenderId: "848906922742",
  appId: "1:848906922742:web:934e0c90f1950d118cdad7",
  measurementId: "G-ZC8E92M3M9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const analytics = getAnalytics(app);