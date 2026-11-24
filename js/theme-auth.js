import { auth, onAuthStateChanged } from './firebase-config.js?v=3';

onAuthStateChanged(auth, (user) => {
    if (!user) window.resetMotoCareTheme?.();
});
