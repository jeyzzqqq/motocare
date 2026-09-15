import { auth, db, onAuthStateChanged } from './firebase-config.js';
import { collection, onSnapshot, query, updateDoc, where, writeBatch, doc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const GREEN = '#2E9E4F';
let unsubscribe = null;
let notifications = [];
let activeUserId = '';
let panelOpen = false;

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
    if (item.ai === true || text.includes('ai') || text.includes('insight')) return { key: 'ai', icon: 'sparkles', className: 'notification-panel__icon--ai', label: 'AI' };
    if (text.includes('overdue') || text.includes('alert')) return { key: 'overdue', icon: 'triangle-alert', className: 'notification-panel__icon--overdue', label: '' };
    if (text.includes('due') || text.includes('reminder') || text.includes('soon')) return { key: 'due', icon: 'triangle-alert', className: 'notification-panel__icon--due', label: '' };
    return { key: 'complete', icon: 'circle-check', className: 'notification-panel__icon--complete', label: '' };
}

function getTarget(item, meta) {
    if (item.targetUrl) return item.targetUrl;
    if (meta.key === 'ai') return `motoai.html?context=${encodeURIComponent(item.message || item.body || item.title || 'Tell me more about this notification.')}`;
    if (meta.key === 'due' || meta.key === 'overdue') return 'schedule.html';
    return item.target || 'history.html';
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
                    <div class="notification-panel__header-actions"><button id="notificationMarkAll" type="button">Mark all read</button><button class="notification-panel__close" type="button" aria-label="Close notifications" data-notification-dismiss><i class="lucide lucide-x" aria-hidden="true"></i></button></div>
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
        window.location.href = getTarget(item, getNotificationMeta(item));
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
    const unread = notifications.filter((item) => item.read !== true).length;
    const unreadLabel = document.getElementById('notificationPanelUnread');
    if (unreadLabel) unreadLabel.textContent = `${unread} unread`;
    updateBell(unread);
    if (!list) return;
    if (!notifications.length) {
        list.innerHTML = '<p class="notification-panel__empty">You are all caught up.</p>';
        return;
    }
    list.innerHTML = notifications.map((item) => {
        const meta = getNotificationMeta(item);
        const title = item.title || (meta.key === 'overdue' ? 'Maintenance overdue' : meta.key === 'due' ? 'Maintenance due soon' : meta.key === 'ai' ? 'AI Insight' : 'Record logged');
        const description = item.message || item.body || item.reminderText || 'You have a new MotoCare update.';
        return `<button type="button" class="notification-panel__row ${item.read ? '' : 'is-unread'}" data-notification-id="${escapeHtml(item.id)}">
            <span class="notification-panel__icon ${meta.className}"><i class="lucide lucide-${meta.icon}" aria-hidden="true"></i></span>
            <span class="notification-panel__content"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)}</span><time>${timeAgo(item.createdAt || item.date || item.updatedAt)}</time></span>
            <span class="notification-panel__indicators">${meta.label ? `<small>✨ ${meta.label}</small>` : ''}${item.read ? '' : '<i aria-label="Unread"></i>'}</span>
        </button>`;
    }).join('');
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
        .notification-panel { width: min(100%, 420px); max-height: min(650px, calc(100vh - 92px)); overflow: hidden; border-radius: 16px; background: #fff; box-shadow: 0 20px 55px rgba(20, 35, 25, .24); animation: notification-panel-in 180ms ease-out; }
        .notification-panel__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 16px; border-bottom: 1px solid #edf0ee; }
        .notification-panel__header h2 { margin: 0; color: #172033; font: 700 18px/1.2 sans-serif; }
        .notification-panel__header p { margin: 4px 0 0; color: #89918d; font: 500 11px/1 sans-serif; }
        .notification-panel__header-actions { display: flex; align-items: center; gap: 9px; }
        #notificationMarkAll { padding: 4px 0; border: 0; color: ${GREEN}; background: transparent; font: 700 10px sans-serif; cursor: pointer; white-space: nowrap; }
        #notificationMarkAll:disabled { opacity: .5; }
        .notification-panel__close { display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 50%; color: #7e8783; background: #f1f3f2; cursor: pointer; }
        .notification-panel__list { max-height: min(560px, calc(100vh - 170px)); overflow-y: auto; padding: 6px; }
        .notification-panel__row { display: flex; width: 100%; align-items: flex-start; gap: 10px; padding: 12px 10px; border: 0; border-bottom: 1px solid #f0f2f1; color: inherit; background: #fff; text-align: left; cursor: pointer; }
        .notification-panel__row:last-child { border-bottom: 0; }
        .notification-panel__row:hover, .notification-panel__row.is-unread { background: rgba(46, 158, 79, .05); }
        .notification-panel__icon { display: grid; place-items: center; width: 36px; height: 36px; flex: 0 0 36px; border-radius: 50%; }
        .notification-panel__icon--due { color: #a15c00; background: #fff0cc; }
        .notification-panel__icon--overdue { color: #b42318; background: #fee4e2; }
        .notification-panel__icon--ai { color: #7044cf; background: #eee8ff; }
        .notification-panel__icon--complete { color: #237a3a; background: #e5f6e9; }
        .notification-panel__content { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 3px; }
        .notification-panel__content strong { overflow: hidden; color: #202a27; font: 700 12px/1.25 sans-serif; text-overflow: ellipsis; white-space: nowrap; }
        .notification-panel__content span { color: #737d78; font: 500 11px/1.35 sans-serif; }
        .notification-panel__content time { color: #a1aaa5; font: 500 9px/1 sans-serif; }
        .notification-panel__indicators { display: flex; align-items: flex-end; flex-direction: column; gap: 6px; color: #7044cf; }
        .notification-panel__indicators small { font: 700 9px sans-serif; white-space: nowrap; }
        .notification-panel__indicators i { width: 7px; height: 7px; border-radius: 50%; background: ${GREEN}; }
        .notification-panel__empty { padding: 36px 14px; color: #89918d; font: 500 12px/1.4 sans-serif; text-align: center; }
        @keyframes notification-panel-in { from { opacity: 0; transform: translateY(-8px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
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
        updateBell(0);
    }
});

export { openPanel, closePanel, markAllRead };
