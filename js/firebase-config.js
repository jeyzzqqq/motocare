// Firebase v9+ modular SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-analytics.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";
import { getToken, initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app-check.js";

const firebaseConfig = {
  apiKey: "AIzaSyDh8x7yRqZCiDKeGezlHoPEn4OBKidw3ys",
  authDomain: "motocare-b874a.firebaseapp.com",
  projectId: "motocare-b874a",
  storageBucket: "motocare-b874a.appspot.com",
  messagingSenderId: "848906922742",
  appId: "1:848906922742:web:934e0c90f1950d118cdad7",
  measurementId: "G-ZC8E92M3M9"
};

export const firebaseAppCheckSiteKey = "6LdWySguAAAAADmM4fcp3kMKgfTiTXeG6vChTzri";

// Initialize Firebase
const app = initializeApp(firebaseConfig);

const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
if (isLocalhost) {
  const storedDebugToken = localStorage.getItem("MOTOCARE_APPCHECK_DEBUG_TOKEN");
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = storedDebugToken || true;
}

let appCheck = null;
try {
  appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(firebaseAppCheckSiteKey),
    isTokenAutoRefreshEnabled: true
  });

  if (isLocalhost) {
    getToken(appCheck, true)
      .then(() => console.log("[Firebase App Check] token obtained: true"))
      .catch((error) => console.warn("[Firebase App Check] token obtained: false", {
        name: error?.name,
        code: error?.code
      }));
  }
} catch (error) {
  console.error("Firebase App Check initialization failed:", error);
}

// Services
export { app };
export { appCheck };
export const auth = getAuth(app);
export const db = getFirestore(app);
export const analytics = getAnalytics(app);
export { onAuthStateChanged };