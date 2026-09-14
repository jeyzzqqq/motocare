import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

function formatDate(value) {
    const date = value && typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function renderNotifications(items) {
    const list = document.getElementById('notificationsList');
    if (!items.length) {
        list.innerHTML = '<p class="rounded-xl bg-white p-4 text-sm text-gray-500 shadow-sm">You are all caught up.</p>';
        return;
    }

    list.innerHTML = items.map((item) => `
        <article class="rounded-xl border ${item.read ? 'border-gray-100' : 'border-green-200'} bg-white p-4 shadow-sm">
            <div class="flex items-start gap-3">
                <div class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-green-50 text-green-700"><i class="lucide lucide-bell" aria-hidden="true"></i></div>
                <div class="min-w-0 flex-1"><h2 class="text-sm font-semibold text-gray-800">${item.title || 'MotoCare notification'}</h2><p class="mt-1 text-xs text-gray-500">${item.message || item.body || 'You have a new MotoCare update.'}</p><time class="mt-2 block text-[10px] text-gray-400">${formatDate(item.createdAt || item.date)}</time></div>
            </div>
        </article>
    `).join('');
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    try {
        const snapshot = await getDocs(query(collection(db, 'notifications'), where('uid', '==', user.uid)));
        const notifications = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })).sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0));
        renderNotifications(notifications);
    } catch (error) {
        console.error('Notifications load failed:', error);
        document.getElementById('notificationsList').innerHTML = '<p class="rounded-xl bg-white p-4 text-sm text-gray-500 shadow-sm">Notifications are unavailable right now.</p>';
    }
});
