import { auth, db, onAuthStateChanged } from './firebase-config.js?v=2';
import { collection, getDoc, onSnapshot, query, updateDoc, where, writeBatch, doc } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js';

const GREEN = '#2E7D32';
let unsubscribe = null;
let notifications = [];
let activeUserId = '';
let panelOpen = false;
let animatePanelRows = false;
let notificationPreferences = { maintenanceReminders: true, overdueAlerts: true, aiInsights: true };

function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function asDate(value) {
    const date = value && typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function timeAgo(value) {
    const date = asDate(value);
    if (!date) return 'Recently';
    const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

function getNotificationMeta(item) {
    const text = `${item.type || ''} ${item.category || ''} ${item.title || ''} ${item.message || item.body || ''}`.toLowerCase();
    if (item.ai === true || text.includes('ai') || text.includes('insight')) return { key: 'ai', className: 'notification-panel__icon--ai' };
    if (text.includes('overdue') || text.includes('alert')) return { key: 'overdue', className: 'notification-panel__icon--overdue' };
    if (text.includes('due') || text.includes('reminder') || text.includes('soon')) return { key: 'due', className: 'notification-panel__icon--due' };
    if (text.includes('logged') || text.includes('success') || text.includes('complete')) return { key: 'complete', className: 'notification-panel__icon--complete' };
    return { key: 'other', className: 'notification-panel__icon--other' };
}

function notificationIcon(meta) {
    const common = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    const paths = {
        due: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
        ai: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
        overdue: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
        complete: '<path d="M20 6 9 17l-5-5"/>',
        other: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'
    };
    return `<svg ${common}>${paths[meta.key] || paths.other}</svg>`;
}

function getTarget(item, meta) {
    if (item.targetUrl) return item.targetUrl;
    if (meta.key === 'ai') return `motoai.html?context=${encodeURIComponent(item.message || item.body || item.title || 'Tell me more about this notification.')}`;
    if (meta.key === 'due' || meta.key === 'overdue') return 'schedule.html';
    return item.target || 'history.html';
}

function isNotificationEnabled(meta) {
    if (meta.key === 'ai') return notificationPreferences.aiInsights !== false;
    if (meta.key === 'overdue') return notificationPreferences.overdueAlerts !== false;
    if (meta.key === 'due') return notificationPreferences.maintenanceReminders !== false;
    return true;
}

function ensurePanel() {
    if (document.getElementById('notificationPanelRoot')) return;
    const root = document.createElement('div');
    root.id = 'notificationPanelRoot';
    root.innerHTML = `
        <div class="notification-panel__backdrop" data-notification-dismiss hidden>
            <section class="notification-panel" role="dialog" aria-modal="true" aria-labelledby="notificationPanelTitle">
                <header class="notification-panel__header">
                    <div><h2 id="notificationPanelTitle">Notifications</h2><p id="notificationPanelUnread">0 unread</p></div>
                    <div class="notification-panel__header-actions"><button id="notificationMarkAll" type="button">Mark all read</button><button class="notification-panel__close" type="button" aria-label="Close notifications" data-notification-dismiss><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>
                </header>
                <div id="notificationPanelList" class="notification-panel__list" aria-live="polite"><p class="notification-panel__empty">Loading notifications...</p></div>
            </section>
        </div>`;
    document.body.appendChild(root);
    const backdrop = root.querySelector('[data-notification-dismiss]');
    backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop || event.target.closest('.notification-panel__close')) closePanel();
    });
    root.querySelector('#notificationMarkAll').addEventListener('click', markAllRead);
    root.querySelector('#notificationPanelList').addEventListener('click', (event) => {
        const row = event.target.closest('[data-notification-id]');
        if (!row) return;
        const item = notifications.find((entry) => entry.id === row.dataset.notificationId);
        if (!item) return;
        if (!item.read) updateDoc(doc(db, 'notifications', item.id), { read: true }).catch((error) => console.warn('Notification read update failed:', error));
        closePanel();
        const target = getTarget(item, getNotificationMeta(item));
        if (target.startsWith('motoai.html')) {
            document.dispatchEvent(new CustomEvent('motoai:open', { detail: { context: new URL(target, window.location.href).searchParams.get('context') || '' } }));
        } else {
            window.location.href = target;
        }
    });
}

function updateBell(unreadCount) {
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;
    badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
    badge.classList.toggle('hidden', unreadCount === 0);
}

function renderNotifications() {
    const list = document.getElementById('notificationPanelList');
    const visibleNotifications = notifications.filter((item) => isNotificationEnabled(getNotificationMeta(item)));
    const unread = visibleNotifications.filter((item) => item.read !== true).length;
    const unreadLabel = document.getElementById('notificationPanelUnread');
    if (unreadLabel) unreadLabel.textContent = unread ? `${unread} unread` : 'All caught up';
    const markAll = document.getElementById('notificationMarkAll');
    if (markAll) markAll.hidden = unread === 0;
    updateBell(unread);
    if (!list) return;
    if (!visibleNotifications.length) {
        list.innerHTML = '<p class="notification-panel__empty">You\'re all caught up.</p>';
        return;
    }
    const shouldAnimateRows = animatePanelRows;
    animatePanelRows = false;
    list.innerHTML = visibleNotifications.map((item, index) => {
        const meta = getNotificationMeta(item);
        const title = item.title || (meta.key === 'overdue' ? 'Maintenance overdue' : meta.key === 'due' ? 'Maintenance due soon' : meta.key === 'ai' ? 'AI Insight' : 'Record logged');
        const description = item.message || item.body || item.reminderText || 'You have a new MotoCare update.';
        return `<button type="button" class="notification-panel__row${shouldAnimateRows ? ' notification-panel__row--enter' : ''} ${item.read ? 'is-read' : 'is-unread'}" style="--notification-delay:${index * 50}ms" data-notification-id="${escapeHtml(item.id)}">
            <span class="notification-panel__icon ${meta.className}">${notificationIcon(meta)}</span>
            <span class="notification-panel__content"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)}</span><time>${timeAgo(item.createdAt || item.date || item.updatedAt)}</time></span>
            <span class="notification-panel__indicators">${item.read ? '' : '<i aria-label="Unread"></i>'}</span>
        </button>`;
    }).join('') + '<p class="notification-panel__empty notification-panel__empty--footer">You\'re all caught up.</p>';
}

async function markAllRead() {
    const unread = notifications.filter((item) => item.read !== true);
    if (!unread.length) return;
    const button = document.getElementById('notificationMarkAll');
    if (button) button.disabled = true;
    notifications = notifications.map((item) => ({ ...item, read: true }));
    renderNotifications();
    try {
        const batch = writeBatch(db);
        unread.forEach((item) => batch.update(doc(db, 'notifications', item.id), { read: true }));
        await batch.commit();
    } catch (error) {
        console.error('Mark all notifications read failed:', error);
        notifications = notifications.map((item) => unread.some((entry) => entry.id === item.id) ? { ...item, read: false } : item);
        renderNotifications();
    } finally {
        if (button) button.disabled = false;
    }
}

function openPanel() {
    ensurePanel();
    const backdrop = document.querySelector('.notification-panel__backdrop');
    if (!backdrop) return;
    backdrop.hidden = false;
    panelOpen = true;
    animatePanelRows = true;
    renderNotifications();
    document.body.classList.add('notification-panel-open');
}

function closePanel() {
    const backdrop = document.querySelector('.notification-panel__backdrop');
    if (backdrop) backdrop.hidden = true;
    panelOpen = false;
    document.body.classList.remove('notification-panel-open');
}

function bindBell() {
    const bell = document.getElementById('notificationBtn');
    if (!bell || bell.dataset.notificationBound === 'true') return;
    bell.dataset.notificationBound = 'true';
    bell.addEventListener('click', (event) => { event.preventDefault(); event.stopImmediatePropagation(); panelOpen ? closePanel() : openPanel(); });
}

function subscribe(user) {
    if (unsubscribe) unsubscribe();
    activeUserId = user.uid;
    ensurePanel();
    getDoc(doc(db, 'userSettings', user.uid)).then((snapshot) => {
        if (snapshot.exists()) notificationPreferences = { ...notificationPreferences, ...snapshot.data() };
        renderNotifications();
    }).catch((error) => console.warn('Notification preferences unavailable:', error));
    const notificationQuery = query(collection(db, 'notifications'), where('uid', '==', user.uid));
    unsubscribe = onSnapshot(notificationQuery, (snapshot) => {
        notifications = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })).sort((a, b) => (asDate(b.createdAt || b.date || b.updatedAt)?.getTime() || 0) - (asDate(a.createdAt || a.date || a.updatedAt)?.getTime() || 0));
        renderNotifications();
    }, (error) => {
        console.error('Notification listener failed:', error);
        const list = document.getElementById('notificationPanelList');
        if (list) list.innerHTML = '<p class="notification-panel__empty">Notifications are unavailable right now.</p>';
    });
}

function addStyles() {
    if (document.getElementById('notification-panel-styles')) return;
    const style = document.createElement('style');
    style.id = 'notification-panel-styles';
    style.textContent = `
        body.notification-panel-open { overflow: hidden; }
        .notification-panel__backdrop { position: fixed; inset: 0; z-index: 80; display: flex; justify-content: flex-end; align-items: flex-start; padding: 72px 14px 20px; background: rgba(27, 35, 30, .38); backdrop-filter: blur(9px); -webkit-backdrop-filter: blur(9px); }
        .notification-panel__backdrop[hidden] { display: none; }
        .notification-panel { width: min(100%, 420px); max-height: min(650px, calc(100vh - 92px)); overflow: hidden; border-radius: 16px; color: var(--moto-text, #111613); background: var(--moto-bg, #f6f7f5); box-shadow: 0 20px 55px rgba(20, 35, 25, .24); animation: notification-panel-in 180ms ease-out; }
        .notification-panel__header { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; padding: 18px 16px 14px; background: var(--moto-bg, #f6f7f5); }
        .notification-panel__header h2 { margin: 0; color: var(--moto-text, #111613); font: 700 20px/1.2 var(--moto-font, sans-serif); }
        .notification-panel__header p { margin: 6px 0 0; color: var(--moto-muted, #7a817c); font: 500 10px/1 var(--moto-font, sans-serif); }
        .notification-panel__header-actions { display: flex; align-items: center; gap: 9px; }
        #notificationMarkAll { padding: 4px 0; border: 0; color: ${GREEN}; background: transparent; font: 600 10px var(--moto-font, sans-serif); cursor: pointer; white-space: nowrap; }
        #notificationMarkAll:disabled { opacity: .5; }
        .notification-panel__close { display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 50%; color: var(--moto-muted, #7a817c); background: var(--moto-surface, #fff); cursor: pointer; }
        .notification-panel__close svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.75; }
        .notification-panel__list { max-height: min(560px, calc(100vh - 160px)); overflow-y: auto; padding: 0 10px 12px; }
        .notification-panel__row { display: flex; width: 100%; align-items: flex-start; gap: 10px; min-height: 92px; margin-bottom: 12px; padding: 14px 12px; border: 0; border-radius: 16px; color: inherit; background: var(--moto-surface, #fff); box-shadow: 0 3px 12px rgba(20, 35, 25, .04); text-align: left; cursor: pointer; transition: background 120ms ease, transform 120ms ease; }
        .notification-panel__row:active { background: var(--moto-icon-tile, #eff1ee); transform: scale(.99); }
        .notification-panel__row.is-read .notification-panel__content strong { color: #53605a; }
        .notification-panel__row.notification-panel__row--enter { animation: notification-row-in 400ms ease both; animation-delay: var(--notification-delay, 0ms); }
        .notification-panel__icon { display: grid; place-items: center; width: 44px; height: 44px; flex: 0 0 44px; border-radius: 50%; background: var(--moto-icon-tile, #eff1ee); }
        .notification-panel__icon svg { display: block; width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.75; }
        .notification-panel__icon--due, .notification-panel__icon--ai, .notification-panel__icon--complete, .notification-panel__icon--other { color: ${GREEN}; }
        .notification-panel__icon--overdue { color: var(--moto-overdue, #ef4444); }
        .notification-panel__content { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 4px; padding-top: 1px; }
        .notification-panel__content strong { overflow: hidden; color: var(--moto-text, #111613); font: 600 12px/1.3 var(--moto-font, sans-serif); text-overflow: ellipsis; white-space: nowrap; }
        .notification-panel__content span { color: var(--moto-muted, #7a817c); font: 400 10px/1.4 var(--moto-font, sans-serif); }
        .notification-panel__content time { color: var(--moto-muted, #7a817c); font: 400 9px/1 var(--moto-font, sans-serif); }
        .notification-panel__indicators { display: flex; align-items: flex-start; flex-direction: column; padding-top: 2px; }
        .notification-panel__indicators i { display: block; width: 8px; height: 8px; border-radius: 50%; background: ${GREEN}; transition: opacity 200ms ease, transform 200ms ease; }
        .notification-panel__row.is-read .notification-panel__indicators i { opacity: 0; transform: scale(0); }
        .notification-panel__empty { padding: 30px 14px; color: var(--moto-muted, #7a817c); font: 400 10px/1.4 var(--moto-font, sans-serif); text-align: center; }
        .notification-panel__empty--footer { padding: 18px 14px 8px; }
        @keyframes notification-panel-in { from { opacity: 0; transform: translateY(-8px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes notification-row-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) { .notification-panel, .notification-panel__row { animation: none !important; transition: none !important; } }
        @media (max-width: 480px) { .notification-panel__backdrop { padding: 64px 10px 16px; } .notification-panel { max-height: calc(100vh - 80px); } .notification-panel__header-actions { gap: 6px; } }
    `;
    document.head.appendChild(style);
}

addStyles();
onAuthStateChanged(auth, (user) => {
    if (user) {
        bindBell();
        subscribe(user);
    } else {
        if (unsubscribe) unsubscribe();
        activeUserId = '';
        notifications = [];
        notificationPreferences = { maintenanceReminders: true, overdueAlerts: true, aiInsights: true };
        updateBell(0);
    }
});

export { openPanel, closePanel, markAllRead };
