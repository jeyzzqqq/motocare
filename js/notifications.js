import { auth, db } from './firebase-config.js?v=3';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js';
import { collection, doc, getDocs, query, updateDoc, where } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js';

let notificationItems = [];

function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[character]));
}

function formatDate(value) {
    const date = value && typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function timestampValue(value) {
    if (value && typeof value.toDate === 'function') return value.toDate().getTime();
    const date = value instanceof Date ? value : new Date(value || 0);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function getNotificationMeta(item) {
    const type = String(item.type || '').toLowerCase();
    const status = String(item.status || '').toLowerCase();
    if (item.ai === true || type === 'ai') return { key: 'ai', colorClass: 'text-green-700' };
    if (status === 'overdue') return { key: 'overdue', colorClass: 'text-red-500' };
    if (status === 'due_soon') return { key: 'due_soon', colorClass: 'text-amber-500' };
    if (status || type) {
        if (type === 'maintenance') return { key: 'due_soon', colorClass: 'text-amber-500' };
        return { key: 'other', colorClass: 'text-green-700' };
    }

    const text = `${item.category || ''} ${item.title || ''} ${item.message || item.body || ''}`.toLowerCase();
    if (text.includes('overdue') || text.includes('alert')) return { key: 'overdue', colorClass: 'text-red-500' };
    if (text.includes('due') || text.includes('reminder') || text.includes('soon')) return { key: 'due_soon', colorClass: 'text-amber-500' };
    if (text.includes('logged') || text.includes('success') || text.includes('complete')) return { key: 'complete', colorClass: 'text-green-700' };
    return { key: 'other', colorClass: 'text-green-700' };
}

function notificationIcon(meta) {
    const paths = {
        overdue: '<path d="m10.29 3.86-8.52 14.14a2 2 0 0 0 1.71 3h17.04a2 2 0 0 0 1.71-3l-8.52-14.14a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
        due_soon: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
        ai: '<path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z"/>',
        complete: '<path d="m5 12 4 4L19 6"/>',
        other: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>'
    };
    return `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[meta.key] || paths.other}</svg>`;
}

function getNotificationTarget(item, meta) {
    if (item.targetUrl) return item.targetUrl;
    if (meta.key === 'ai') return `motoai.html?context=${encodeURIComponent(item.message || item.body || item.title || 'Tell me more about this notification.')}`;
    if (meta.key === 'overdue' || meta.key === 'due_soon') return 'schedule.html';
    return item.target || 'history.html';
}

function renderNotifications(items) {
    const list = document.getElementById('notificationsList');
    if (!items.length) {
        list.innerHTML = '<p class="rounded-xl bg-white p-4 text-sm text-gray-500 shadow-sm">You are all caught up.</p>';
        return;
    }

    list.innerHTML = items.map((item) => {
        const meta = getNotificationMeta(item);
        return `
            <button type="button" class="w-full rounded-xl border ${item.read ? 'border-gray-100' : 'border-green-200'} bg-white p-4 text-left shadow-sm" data-notification-id="${escapeHtml(item.id)}">
                <span class="flex items-start gap-3">
                    <span class="grid h-11 w-11 shrink-0 place-items-center rounded-xl ${meta.colorClass}" style="background:var(--moto-icon-tile,#eff1ee)">${notificationIcon(meta)}</span>
                    <span class="min-w-0 flex-1">
                        <strong class="block text-sm font-semibold text-gray-800">${escapeHtml(item.title || 'MotoCare notification')}</strong>
                        <span class="mt-1 block text-xs text-gray-500">${escapeHtml(item.message || item.body || 'You have a new MotoCare update.')}</span>
                        <time class="mt-2 block text-[10px] text-gray-400">${escapeHtml(formatDate(item.createdAt || item.date))}</time>
                    </span>
                </span>
            </button>
        `;
    }).join('');
}

document.getElementById('notificationsList')?.addEventListener('click', async (event) => {
    const row = event.target.closest?.('[data-notification-id]');
    if (!row) return;
    const item = notificationItems.find((entry) => entry.id === row.dataset.notificationId);
    if (!item) return;

    if (item.read !== true) {
        try {
            await updateDoc(doc(db, 'notifications', item.id), { read: true });
        } catch (error) {
            console.warn('Notification read update failed:', error);
        }
    }
    window.location.href = getNotificationTarget(item, getNotificationMeta(item));
});

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    try {
        const snapshot = await getDocs(query(collection(db, 'notifications'), where('uid', '==', user.uid)));
        notificationItems = snapshot.docs
            .map((entry) => ({ id: entry.id, ...entry.data() }))
            .sort((a, b) => timestampValue(b.createdAt || b.date) - timestampValue(a.createdAt || a.date));
        renderNotifications(notificationItems);
    } catch (error) {
        console.error('Notifications load failed:', error);
        document.getElementById('notificationsList').innerHTML = '<p class="rounded-xl bg-white p-4 text-sm text-gray-500 shadow-sm">Notifications are unavailable right now.</p>';
    }
});
