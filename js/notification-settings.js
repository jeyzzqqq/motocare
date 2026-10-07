import { auth, db, onAuthStateChanged } from './firebase-config.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const GREEN = '#2e9e4f';
const DEFAULTS = {
    maintenanceReminders: true,
    overdueAlerts: true,
    aiInsights: true,
    emailNotifications: false,
    weeklySummary: false,
    reminderTiming: '3 days'
};
let currentUser = null;
let settings = { ...DEFAULTS };

const settingsRows = [
    ['maintenanceReminders', 'wrench', 'Maintenance Reminders', 'Notify before scheduled maintenance'],
    ['overdueAlerts', 'triangle-alert', 'Overdue Alerts', 'Alert when maintenance is past due'],
    ['aiInsights', 'sparkles', 'AI Insights', 'MotoAI predictions and suggestions'],
    ['emailNotifications', 'mail', 'Email Notifications', 'Receive alerts via email'],
    ['weeklySummary', 'circle-check', 'Weekly Summary', 'Weekly overview of your bikes']
];

function ensureMarkup() {
    if (document.getElementById('notificationSettingsBackdrop')) return;
    const root = document.createElement('div');
    root.innerHTML = `<div id="notificationSettingsBackdrop" class="motorcycles-modal-backdrop" data-notification-settings-dismiss>
        <section class="motorcycles-modal-sheet notification-settings" role="dialog" aria-modal="true" aria-labelledby="notificationSettingsTitle">
            <div class="notification-settings__handle" aria-hidden="true"></div>
            <header class="notification-settings__header"><div class="flex items-center gap-3"><span class="icon-badge"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M10 21h4"></path></svg></span><h2 id="notificationSettingsTitle">Notification Settings</h2></div><button id="notificationSettingsClose" class="notification-settings__close" type="button" aria-label="Close notification settings"><i class="lucide lucide-x" aria-hidden="true"></i></button></header>
            <div id="notificationSettingsRows" class="notification-settings__rows"></div>
            <div class="notification-settings__timing"><strong>Remind me how far in advance?</strong><span>Before a scheduled maintenance is due</span><div class="notification-settings__pills" role="group" aria-label="Reminder timing"><button type="button" data-reminder-timing="1 day">1 day</button><button type="button" data-reminder-timing="3 days">3 days</button><button type="button" data-reminder-timing="1 week">1 week</button><button type="button" data-reminder-timing="2 weeks">2 weeks</button></div></div>
            <button id="notificationSettingsSave" class="notification-settings__save" type="button">Save Preferences</button>
        </section>
    </div>`;
    document.body.appendChild(root.firstElementChild);
    const backdrop = document.getElementById('notificationSettingsBackdrop');
    backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeNotificationSettings(); });
    document.getElementById('notificationSettingsClose').addEventListener('click', closeNotificationSettings);
    document.getElementById('notificationSettingsSave').addEventListener('click', saveSettings);
    document.getElementById('notificationSettingsRows').addEventListener('click', (event) => {
        const button = event.target.closest('[data-setting-key]');
        if (!button) return;
        const key = button.dataset.settingKey;
        settings[key] = !settings[key];
        renderSettings();
    });
    backdrop.querySelector('.notification-settings__pills').addEventListener('click', (event) => {
        const button = event.target.closest('[data-reminder-timing]');
        if (button) { settings.reminderTiming = button.dataset.reminderTiming; renderSettings(); }
    });
}

function renderSettings() {
    const rows = document.getElementById('notificationSettingsRows');
    if (!rows) return;
    rows.innerHTML = settingsRows.map(([key, icon, title, subtitle]) => `<button type="button" class="notification-settings__row" data-setting-key="${key}" aria-pressed="${settings[key]}"><span class="notification-settings__icon"><i class="lucide lucide-${icon}" aria-hidden="true"></i></span><span class="notification-settings__copy"><strong>${title}</strong><small>${subtitle}</small></span><span class="notification-settings__toggle${settings[key] ? ' is-on' : ''}" aria-hidden="true"><span></span></span></button>`).join('');
    document.querySelectorAll('[data-reminder-timing]').forEach((button) => button.classList.toggle('is-selected', button.dataset.reminderTiming === settings.reminderTiming));
}

async function loadSettings() {
    if (!currentUser) return;
    const snapshot = await getDoc(doc(db, 'userSettings', currentUser.uid));
    settings = { ...DEFAULTS, ...(snapshot.exists() ? snapshot.data() : {}) };
}

async function saveSettings() {
    const button = document.getElementById('notificationSettingsSave');
    if (!currentUser || !button) return;
    button.disabled = true;
    try {
        await setDoc(doc(db, 'userSettings', currentUser.uid), { ...settings, uid: currentUser.uid, updatedAt: serverTimestamp() }, { merge: true });
        closeNotificationSettings();
        window.showToast?.('Notification preferences saved.', 'success');
    } catch (error) {
        console.error('Notification preferences save failed:', error);
        window.showToast?.('Could not save notification preferences.', 'error');
    } finally { button.disabled = false; }
}

async function openNotificationSettings() {
    ensureMarkup();
    try { await loadSettings(); } catch (error) { console.error('Notification preferences load failed:', error); }
    renderSettings();
    document.getElementById('notificationSettingsBackdrop').classList.add('is-open');
    document.querySelector('#notificationSettingsBackdrop .notification-settings').classList.add('is-open');
    document.body.classList.add('notification-settings-open');
}

function closeNotificationSettings() {
    const backdrop = document.getElementById('notificationSettingsBackdrop');
    if (backdrop) {
        backdrop.classList.remove('is-open');
        backdrop.querySelector('.notification-settings')?.classList.remove('is-open');
    }
    document.body.classList.remove('notification-settings-open');
}

function addStyles() {
    const style = document.createElement('style');
    style.textContent = `body.notification-settings-open { overflow: hidden; }.notification-settings { max-height: 82vh; overflow-y: auto; padding: 10px 14px max(16px,env(safe-area-inset-bottom)); }.notification-settings__handle { width:48px; height:6px; margin:0 auto 8px; border-radius:999px; background:#d1d5d3; }.notification-settings__header { display:flex; align-items:center; justify-content:space-between; padding:2px 1px 12px; border-bottom:1px solid #edf0ee; }.notification-settings__header h2 { margin:0; color:#172033; font:700 17px/1.2 sans-serif; }.notification-settings__close { display:grid; place-items:center; width:30px; height:30px; border:0; border-radius:50%; color:#7e8783; background:#f1f3f2; cursor:pointer; }.notification-settings__rows { padding:4px 0; }.notification-settings__row { display:flex; width:100%; align-items:center; gap:10px; padding:10px 1px; border:0; border-bottom:1px solid #f0f2f1; background:#fff; text-align:left; cursor:pointer; }.notification-settings__icon { display:grid; place-items:center; width:34px; height:34px; flex:0 0 34px; border-radius:50%; color:${GREEN}; background:#e7f8eb; }.notification-settings__copy { display:flex; min-width:0; flex:1; flex-direction:column; gap:3px; }.notification-settings__copy strong { color:#202a27; font:700 12px/1.2 sans-serif; }.notification-settings__copy small { color:#737d78; font:500 10px/1.3 sans-serif; }.notification-settings__toggle { display:flex; width:38px; height:22px; align-items:center; padding:2px; border-radius:999px; background:#d7dcda; transition:background 160ms ease; }.notification-settings__toggle span { width:18px; height:18px; border-radius:50%; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.18); transition:transform 160ms ease; }.notification-settings__toggle.is-on { background:${GREEN}; }.notification-settings__toggle.is-on span { transform:translateX(16px); }.notification-settings__timing { margin-top:12px; padding:12px; border:1px solid #e4e9e5; border-radius:12px; }.notification-settings__timing strong,.notification-settings__timing span { display:block; }.notification-settings__timing strong { color:#202a27; font:700 12px/1.2 sans-serif; }.notification-settings__timing span { margin-top:4px; color:#737d78; font:500 10px/1.3 sans-serif; }.notification-settings__pills { display:grid; grid-template-columns:repeat(4,1fr); gap:5px; margin-top:11px; }.notification-settings__pills button { min-width:0; padding:8px 3px; border:1px solid #e0e5e2; border-radius:999px; color:#737d78; background:#fff; font:600 10px sans-serif; cursor:pointer; }.notification-settings__pills button.is-selected { border-color:${GREEN}; color:#fff; background:${GREEN}; }.notification-settings__save { width:100%; margin-top:12px; padding:12px; border:0; border-radius:12px; color:#fff; background:${GREEN}; font:700 12px sans-serif; cursor:pointer; }.notification-settings__save:disabled { opacity:.6; cursor:wait; }`;
    document.head.appendChild(style);
}

addStyles();
onAuthStateChanged(auth, (user) => { currentUser = user; });
window.openNotificationSettings = openNotificationSettings;
window.closeNotificationSettings = closeNotificationSettings;