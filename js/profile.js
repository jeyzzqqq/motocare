import { auth, db, storage, onAuthStateChanged } from "./firebase-config.js";
import { updateProfile, updatePassword, deleteUser } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { getFirestoreDocs } from './firebaseUtils.js';

let currentUser = null;
let accountSettings = { language: 'English', currency: 'PHP' };
let currentBikeCount = 0;

const STREAK_PREFIX = 'motocare-streak-v1:';
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function dateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getStreakState(uid) {
    let data = {};
    try { data = JSON.parse(localStorage.getItem(`${STREAK_PREFIX}${uid}`)) || {}; } catch { data = {}; }
    const today = new Date();
    const todayKey = dateKey(today);
    const dates = new Set([...(data.dates || []), todayKey]);
    let streak = 1;
    const cursor = new Date(today);
    while (true) {
        cursor.setDate(cursor.getDate() - 1);
        if (!dates.has(dateKey(cursor))) break;
        streak += 1;
    }
    const monday = new Date(today);
    const day = monday.getDay();
    monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));
    const completed = DAY_LABELS.map((_, index) => {
        const current = new Date(monday);
        current.setDate(monday.getDate() + index);
        return dates.has(dateKey(current)) && dateKey(current) <= todayKey;
    });
    return { streak, completed, remaining: Math.max(0, 7 - completed.filter(Boolean).length) };
}

function renderProfile(user, bikeCount) {
    const name = user.displayName || user.email?.split('@')[0] || 'Rider';
    document.getElementById('profileName').textContent = name;
    document.getElementById('profileEmail').textContent = user.email || '';
    document.getElementById('bikeCount').textContent = `${bikeCount} bike${bikeCount === 1 ? '' : 's'} registered`;
    if (user.photoURL) {
        const avatar = document.getElementById('profileAvatar');
        const image = document.createElement('img');
        image.src = user.photoURL;
        image.alt = `${name} profile photo`;
        avatar.replaceChildren(image);
    }

    const state = getStreakState(user.uid);
    document.getElementById('profileStreak').textContent = `${state.streak}-Day Streak`;
    document.getElementById('profileWeek').innerHTML = state.completed.map((complete, index) => `<span class="streak-day${complete ? ' is-complete' : ''}">${complete ? '&#10003;' : DAY_LABELS[index]}</span>`).join('');
    document.getElementById('profileProgress').textContent = state.remaining ? `${state.remaining} more day${state.remaining === 1 ? '' : 's'} to complete your week.` : 'You completed your week. Keep it going!';
}

function ensureAccountSettingsMarkup() {
    if (document.getElementById('accountSettingsBackdrop')) return;
    const root = document.createElement('div');
    root.innerHTML = `<div id="accountSettingsBackdrop" class="motorcycles-modal-backdrop">
        <section class="motorcycles-modal-sheet account-settings" role="dialog" aria-modal="true" aria-labelledby="accountSettingsTitle">
            <div class="account-settings__handle"></div>
            <header class="account-settings__header"><h2 id="accountSettingsTitle">Account Settings</h2><button id="accountSettingsClose" class="account-settings__close" type="button" aria-label="Close account settings"><i class="lucide lucide-x"></i></button></header>
            <div class="account-settings__body">
                <div class="account-settings__photo"><button id="accountPhotoButton" class="account-settings__avatar" type="button" aria-label="Change profile photo"><i class="lucide lucide-user-round"></i><img id="accountPhoto" alt="" hidden><span><i class="lucide lucide-camera"></i></span></button><input id="accountPhotoInput" type="file" accept="image/*" hidden><p>Tap to change photo</p></div>
                <section class="account-settings__card"><div class="account-settings__row"><div class="account-settings__field"><small>FULL NAME</small><strong id="accountName">Loading...</strong><input id="accountNameInput" type="text" maxlength="80" hidden></div><button id="accountNameEdit" class="account-settings__link" type="button">Edit</button></div><div class="account-settings__divider"></div><div class="account-settings__row"><div class="account-settings__field"><small>EMAIL ADDRESS</small><strong id="accountEmail">Loading...</strong></div><span id="accountVerification" class="account-settings__verified"></span></div><div class="account-settings__divider"></div><button id="accountPasswordButton" class="account-settings__password" type="button"><span class="account-settings__icon"><i class="lucide lucide-lock-keyhole"></i></span><span class="account-settings__field"><strong>Change Password</strong><small id="accountPasswordChanged">Not changed yet</small></span><i class="lucide lucide-chevron-right"></i></button><form id="accountPasswordForm" class="account-settings__password-form" hidden><label for="accountNewPassword">New password</label><input id="accountNewPassword" type="password" minlength="6" autocomplete="new-password" required><button type="submit">Update Password</button></form></section>
                <section class="account-settings__card"><h3>PREFERENCES</h3><div class="account-settings__preference"><small>LANGUAGE</small><div class="account-settings__toggles"><button type="button" data-account-language="Filipino">Filipino</button><button type="button" data-account-language="English">English</button></div></div><div class="account-settings__divider"></div><div class="account-settings__preference"><small>CURRENCY</small><div class="account-settings__toggles"><button type="button" data-account-currency="PHP">PHP (₱)</button><button type="button" data-account-currency="USD">USD ($)</button></div></div></section>
                <section class="account-settings__danger"><div><i class="lucide lucide-shield-alert"></i><span><strong>Danger Zone</strong><small>These actions are permanent and cannot be undone.</small></span></div><button id="accountDeleteButton" type="button">Delete Account</button></section>
            </div>
        </section>
    </div>`;
    document.body.appendChild(root.firstElementChild);
    const backdrop = document.getElementById('accountSettingsBackdrop');
    backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeAccountSettings(); const button = event.target.closest('[data-account-language], [data-account-currency]'); if (button) updatePreference(button); });
    document.getElementById('accountSettingsClose').addEventListener('click', closeAccountSettings);
    document.getElementById('accountPhotoButton').addEventListener('click', () => document.getElementById('accountPhotoInput').click());
    document.getElementById('accountPhotoInput').addEventListener('change', changePhoto);
    document.getElementById('accountNameEdit').addEventListener('click', toggleNameEdit);
    document.getElementById('accountPasswordButton').addEventListener('click', () => { document.getElementById('accountPasswordForm').hidden = false; document.getElementById('accountNewPassword').focus(); });
    document.getElementById('accountPasswordForm').addEventListener('submit', changePassword);
    document.getElementById('accountDeleteButton').addEventListener('click', deleteAccount);
}

function relativeTime(value) {
    if (!value) return 'Not changed yet';
    const date = value?.toDate ? value.toDate() : new Date(value);
    const days = Math.floor((Date.now() - date.getTime()) / 86400000);
    return Number.isNaN(date.getTime()) ? 'Not changed yet' : days < 1 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

function renderAccountSettings() {
    const name = currentUser.displayName || currentUser.email?.split('@')[0] || 'Rider';
    document.getElementById('accountName').textContent = name;
    document.getElementById('accountEmail').textContent = currentUser.email || '';
    document.getElementById('accountVerification').innerHTML = currentUser.emailVerified ? '<i class="lucide lucide-check"></i> Verified' : '<i class="lucide lucide-circle-alert"></i> Unverified';
    document.getElementById('accountPasswordChanged').textContent = relativeTime(accountSettings.passwordChangedAt);
    const photo = document.getElementById('accountPhoto');
    if (currentUser.photoURL) { photo.src = currentUser.photoURL; photo.hidden = false; photo.previousElementSibling.hidden = true; }
    document.querySelectorAll('[data-account-language]').forEach((button) => button.classList.toggle('is-selected', button.dataset.accountLanguage === accountSettings.language));
    document.querySelectorAll('[data-account-currency]').forEach((button) => button.classList.toggle('is-selected', button.dataset.accountCurrency === accountSettings.currency));
}

async function loadAccountSettings() {
    const snapshot = await getDoc(doc(db, 'userSettings', currentUser.uid));
    accountSettings = { language: 'English', currency: 'PHP', ...(snapshot.exists() ? snapshot.data() : {}) };
    localStorage.setItem('motocare.currency', accountSettings.currency);
}

async function saveAccountSettings() {
    await setDoc(doc(db, 'userSettings', currentUser.uid), { language: accountSettings.language, currency: accountSettings.currency, updatedAt: serverTimestamp() }, { merge: true });
}

function updatePreference(button) {
    const key = button.dataset.accountLanguage ? 'language' : 'currency';
    accountSettings[key] = button.dataset.accountLanguage || button.dataset.accountCurrency;
    if (key === 'currency') localStorage.setItem('motocare.currency', accountSettings.currency);
    renderAccountSettings();
    saveAccountSettings().then(() => window.showToast?.('Preference updated.', 'success')).catch(() => window.showToast?.('Could not save preference.', 'error'));
}

function toggleNameEdit() {
    const input = document.getElementById('accountNameInput');
    const button = document.getElementById('accountNameEdit');
    if (input.hidden) { input.value = document.getElementById('accountName').textContent; input.hidden = false; document.getElementById('accountName').hidden = true; button.textContent = 'Save'; input.focus(); return; }
    const name = input.value.trim();
    if (!name) return;
    updateProfile(currentUser, { displayName: name }).then(() => { input.hidden = true; document.getElementById('accountName').hidden = false; button.textContent = 'Edit'; renderProfile(currentUser, currentBikeCount); renderAccountSettings(); window.showToast?.('Name updated.', 'success'); }).catch(() => window.showToast?.('Could not update your name.', 'error'));
}

async function changePhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try { const photoRef = ref(storage, `profilePhotos/${currentUser.uid}`); await uploadBytes(photoRef, file); await updateProfile(currentUser, { photoURL: await getDownloadURL(photoRef) }); renderProfile(currentUser, currentBikeCount); renderAccountSettings(); window.showToast?.('Profile photo updated.', 'success'); } catch (error) { console.error(error); window.showToast?.('Could not update your photo.', 'error'); }
}

async function changePassword(event) {
    event.preventDefault();
    try { await updatePassword(currentUser, document.getElementById('accountNewPassword').value); accountSettings.passwordChangedAt = new Date().toISOString(); await setDoc(doc(db, 'userSettings', currentUser.uid), { passwordChangedAt: accountSettings.passwordChangedAt, updatedAt: serverTimestamp() }, { merge: true }); event.target.reset(); event.target.hidden = true; renderAccountSettings(); window.showToast?.('Password updated.', 'success'); } catch (error) { console.error(error); window.showToast?.('Please sign in again before changing your password.', 'error'); }
}

async function deleteAccount() {
    if (!currentUser || !window.confirm('Delete your MotoCare account permanently? This cannot be undone.') || !window.confirm('This will permanently remove your account access. Continue?')) return;
    try { await deleteUser(currentUser); window.location.href = './index.html'; } catch (error) { console.error(error); window.showToast?.('Please sign in again before deleting your account.', 'error'); }
}

function addAccountSettingsStyles() {
    const style = document.createElement('style');
    style.textContent = `body.notification-settings-open{overflow:hidden}.account-settings{max-height:88vh;overflow:hidden;padding:10px 14px max(16px,env(safe-area-inset-bottom))}.account-settings__handle{width:48px;height:6px;margin:0 auto 8px;border-radius:999px;background:#d1d5d3}.account-settings__header{display:flex;align-items:center;justify-content:space-between;padding:2px 1px 12px;border-bottom:1px solid #edf0ee}.account-settings__header h2{margin:0;color:#172033;font:700 17px/1.2 sans-serif}.account-settings__close{display:grid;place-items:center;width:32px;height:32px;border:0;border-radius:50%;color:#7e8783;background:#f1f3f2}.account-settings__body{max-height:calc(88vh - 58px);overflow-y:auto;padding:14px 0}.account-settings__photo{text-align:center}.account-settings__avatar{position:relative;width:88px;height:88px;border:0;border-radius:50%;color:#2e9e4f;background:#e7f8eb;font-size:34px}.account-settings__avatar img{position:absolute;inset:0;width:100%;height:100%;border-radius:50%;object-fit:cover}.account-settings__avatar>span{position:absolute;right:-2px;bottom:0;display:grid;place-items:center;width:30px;height:30px;border:3px solid #fff;border-radius:50%;color:#fff;background:#2e9e4f;font-size:13px}.account-settings__photo p{margin:7px 0 14px;color:#737d78;font:500 11px sans-serif}.account-settings__card,.account-settings__danger{margin-top:12px;padding:4px 12px;border:1px solid #e4e9e5;border-radius:14px;background:#fff}.account-settings__row,.account-settings__password,.account-settings__preference{display:flex;align-items:center;gap:10px;min-height:64px}.account-settings__field{display:flex;min-width:0;flex:1;flex-direction:column;gap:4px;text-align:left}.account-settings__field small,.account-settings__preference>small,.account-settings__card>h3{color:#737d78;font:700 10px sans-serif;letter-spacing:.04em}.account-settings__field strong{overflow:hidden;color:#202a27;font:700 13px sans-serif;text-overflow:ellipsis;white-space:nowrap}.account-settings__link{min-width:44px;border:0;color:#2e9e4f;background:transparent;font-weight:700}.account-settings__verified{display:flex;align-items:center;gap:3px;color:#2e9e4f;font-size:11px;font-weight:700;white-space:nowrap}.account-settings__divider{height:1px;background:#f0f2f1}.account-settings__password{width:100%;border:0;background:#fff;text-align:left}.account-settings__password .account-settings__field small{font-weight:500}.account-settings__icon{display:grid;place-items:center;width:36px;height:36px;flex:0 0 36px;border-radius:50%;color:#2e9e4f;background:#e7f8eb}.account-settings__password>i{color:#c3c9c6}.account-settings__card>h3{margin:12px 0 0}.account-settings__preference{justify-content:space-between;min-height:58px}.account-settings__toggles{display:grid;grid-template-columns:1fr 1fr;min-width:170px}.account-settings__toggles button{min-height:44px;padding:6px 8px;border:1px solid #dfe5e1;color:#737d78;background:#fff;font:700 11px sans-serif}.account-settings__toggles button:first-child{border-radius:9px 0 0 9px}.account-settings__toggles button:last-child{border-left:0;border-radius:0 9px 9px 0}.account-settings__toggles button.is-selected{border-color:#2e9e4f;color:#fff;background:#2e9e4f}.account-settings__danger{border-color:#f0b8b8;background:#fff5f5}.account-settings__danger>div{display:flex;align-items:flex-start;gap:10px;padding:12px 0}.account-settings__danger>div>i{color:#dc4b4b;font-size:22px}.account-settings__danger strong,.account-settings__danger small{display:block}.account-settings__danger strong{color:#b42323;font-size:14px}.account-settings__danger small{margin-top:3px;color:#b95b5b;font-size:10px}.account-settings__danger button{width:100%;min-height:44px;margin:2px 0 12px;border:1px solid #dc4b4b;border-radius:10px;color:#c53030;background:#fff;font-weight:700}.account-settings__input,.account-settings__password-form input{width:100%;padding:8px;border:1px solid #dfe5e1;border-radius:8px}.account-settings__password-form{padding:10px 0}.account-settings__password-form label{display:block;margin-bottom:5px;color:#737d78;font-size:11px}.account-settings__password-form button{min-height:44px;margin-top:8px;padding:0 14px;border:0;border-radius:9px;color:#fff;background:#2e9e4f;font-weight:700}@media(min-width:480px){.account-settings{width:min(100%,420px)}}`;
    document.head.appendChild(style);
}

async function openAccountSettings() {
    ensureAccountSettingsMarkup();
    try { await loadAccountSettings(); } catch (error) { console.error('Account settings load failed:', error); }
    renderAccountSettings();
    document.getElementById('accountSettingsBackdrop').classList.add('is-open');
    document.querySelector('#accountSettingsBackdrop .account-settings').classList.add('is-open');
    document.body.classList.add('notification-settings-open');
}

function closeAccountSettings() {
    const backdrop = document.getElementById('accountSettingsBackdrop');
    backdrop?.classList.remove('is-open');
    backdrop?.querySelector('.account-settings')?.classList.remove('is-open');
    document.body.classList.remove('notification-settings-open');
}

addAccountSettingsStyles();

// Auth State Listener - redirect ONLY if explicitly checked and no user
onAuthStateChanged(auth, async (user) => {
    console.log('Auth state changed:', user ? user.uid : 'no user');
    if (user) {
        currentUser = user;
        console.log('User authenticated:', user.uid);
        await loadUserStats();
    } else {
        console.log('No user, redirecting to login');
        setTimeout(() => {
            window.location.href = "./index.html";
        }, 1000);
    }
});

// Load user statistics
async function loadUserStats() {
    if (!currentUser) return;
    
    try {
        // Get motorcycles count
        const bikes = await getFirestoreDocs('motorcycles');
        const bikeCount = bikes.length;
        currentBikeCount = bikeCount;
        console.log('Motorcycles count:', bikeCount);
        renderProfile(currentUser, bikeCount);

        // Get repairs/services count
        const repairs = await getFirestoreDocs('repairs');
        const serviceCount = repairs.length;
        console.log('Services count:', serviceCount);

        // Calculate total spent from repairs collection (use 'cost' field)
        let totalSpent = 0;
        repairs.forEach(doc => {
            totalSpent += parseFloat(doc.cost || 0);
        });
        
        console.log('Total spent:', totalSpent);
    } catch (error) {
        console.error("Error loading stats:", error);
    }
}

// Edit toggle - simple for now (no email editing)
window.toggleEdit = function() {
    openAccountSettings();
};

// Save profile - no-op for now
window.saveProfile = async function() {
    console.log('Save clicked');
};

// Cancel edit - no-op for now
window.cancelEdit = function() {
    console.log('Cancel clicked');
};

// Logout
window.logoutUser = async function() {
    try {
        await auth.signOut();
        window.location.href = "./index.html";
    } catch (error) {
        console.error("Logout error:", error);
        showToast('Error logging out', 'error');
    }
};

// Show toast notification
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;
    
    const toast = document.createElement('div');
    const colors = {
        success: 'bg-green-700 text-white',
        error: 'bg-red-500 text-white',
        info: 'bg-blue-500 text-white'
    };
    
    const icons = {
        success: 'check-circle',
        error: 'alert-circle',
        info: 'info'
    };

    toast.className = `${colors[type]} rounded-lg px-4 py-3 shadow-lg flex items-center gap-2`;
    toast.innerHTML = `
        <i class="fa-solid fa-${icons[type]}"></i>
        <span class="text-sm font-medium">${message}</span>
    `;
    
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}