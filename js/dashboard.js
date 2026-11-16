import { auth, db } from './firebase-config.js?v=2';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { MAINTENANCE_RULES, classifyMotorcycleCategory } from './maintenanceOptions.js';
import { normalizeRecord } from './utils-module.js';

const STREAK_PREFIX = 'motocare-streak-v1:';
let dashboardHasRendered = false;

function dateValue(value) {
    if (value && typeof value.toDate === 'function') return value.toDate();
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDate(date) {
    return date ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date not set';
}

function formatShortDate(date) {
    return date ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Not set';
}

function formatDashboardCurrency(value) {
    return formatCurrency(Number(value) || 0).replace(/\.00$/, '');
}

function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function motorcycleName(motorcycle = {}) {
    return motorcycle.motorcycleName || [motorcycle.brand, motorcycle.model].filter(Boolean).join(' ') || 'Motorcycle';
}

function mileage(motorcycle = {}) {
    const value = Number(motorcycle.mileage ?? motorcycle.odo ?? motorcycle.currentOdo ?? motorcycle.odometer ?? 0);
    return Number.isFinite(value) ? value : 0;
}

function completion(record = {}) {
    const status = String(record.status || '').toLowerCase();
    return status === 'completed' || status === 'complete' || status === 'done' || Boolean(record.completedAt || record.completedMileage || record.date);
}

function latestCompletion(records, motorcycleId, rule) {
    return records.filter((record) => {
        if (String(record.motorcycleId || '') !== String(motorcycleId) || !completion(record)) return false;
        const task = String(record.task || record.title || record.name || '').toLowerCase();
        return record.taskKey === rule.key || task.includes(String(rule.task).toLowerCase()) || String(rule.task).toLowerCase().includes(task);
    }).sort((a, b) => (dateValue(b.completedAt || b.date || b.createdAt)?.getTime() || 0) - (dateValue(a.completedAt || a.date || a.createdAt)?.getTime() || 0))[0];
}

function buildMaintenanceItems(motorcycles, records) {
    return motorcycles.flatMap((motorcycle) => {
        const category = classifyMotorcycleCategory(motorcycle);
        const rules = MAINTENANCE_RULES[category.key] || [];
        const currentMileage = mileage(motorcycle);
        return rules.map((rule) => {
            const record = latestCompletion(records, motorcycle.id, rule);
            const anchor = Number(record?.completedMileage ?? record?.mileage ?? currentMileage);
            const interval = Number(rule.interval || 0);
            const dueMileage = record ? anchor + interval : Math.ceil(currentMileage / Math.max(1, interval)) * interval;
            const explicitDate = dateValue(record?.nextDueDate || record?.dueDate);
            const lastDoneDate = dateValue(record?.completedAt || record?.date || record?.createdAt);
            const daysUntil = explicitDate
                ? Math.ceil((explicitDate - new Date()) / 86400000)
                : Math.ceil((dueMileage - currentMileage) / Math.max(1, currentMileage / 30));
            const status = daysUntil < 0 ? 'overdue' : daysUntil <= 14 ? 'due-soon' : 'scheduled';
            const mileageProgress = dueMileage > anchor ? ((currentMileage - anchor) / (dueMileage - anchor)) * 100 : 0;
            const dateProgress = explicitDate && lastDoneDate
                ? ((Date.now() - lastDoneDate.getTime()) / Math.max(1, explicitDate.getTime() - lastDoneDate.getTime())) * 100
                : mileageProgress;
            return {
                id: `${motorcycle.id}-${rule.key}`,
                task: rule.task,
                icon: rule.icon || 'wrench',
                motorcycleName: motorcycleName(motorcycle),
                dueDate: explicitDate,
                lastDoneDate,
                dueMileage,
                daysUntil,
                progress: Math.max(0, Math.min(100, dateProgress)),
                status
            };
        });
    }).sort((a, b) => a.daysUntil - b.daysUntil);
}

function renderStreak(uid) {
    let data = {};
    try {
        data = JSON.parse(localStorage.getItem(`${STREAK_PREFIX}${uid}`)) || {};
    } catch (error) {
        console.warn('Unable to read dashboard streak:', error);
    }
    const today = new Date();
    const dates = new Set([...(data.dates || []), dateKey(today)]);
    let streak = 1;
    const cursor = new Date(today);
    while (streak > 0) {
        cursor.setDate(cursor.getDate() - 1);
        if (!dates.has(dateKey(cursor))) break;
        streak += 1;
    }
    const element = document.getElementById('streakCount');
    if (element) element.textContent = `${streak}-day streak`;
    document.getElementById('streakButton')?.classList.add('is-animated');
    return streak;
}

function maintenanceIcon(item) {
    const icon = `${item.task || ''} ${item.icon || ''}`.toLowerCase();
    if (icon.includes('oil') || icon.includes('fluid')) return 'droplet';
    if (icon.includes('tire') || icon.includes('pressure')) return 'gauge';
    return 'wrench';
}

function renderUrgent(items, shouldAnimate = false) {
    const container = document.getElementById('urgentMaintenanceList');
    if (!container) return;
    container.classList.toggle('is-animated', shouldAnimate);
    container.classList.remove('is-visible');
    if (!items.length) {
        container.innerHTML = '<div class="empty-state"><i class="lucide lucide-circle-check" aria-hidden="true"></i><strong>All caught up</strong><span>No urgent maintenance needed</span></div>';
        container.classList.add('is-visible');
        return;
    }
    container.innerHTML = items.map((item, index) => `<a href="schedule.html" class="maintenance-row" style="--row-index:${index}">
        <span class="row-icon"><i class="lucide lucide-${maintenanceIcon(item)}" aria-hidden="true"></i></span>
        <span class="row-main"><strong class="row-title">${escapeHtml(item.task)}</strong><small class="row-subtitle">${escapeHtml(item.motorcycleName)}</small></span>
        <span class="row-meta"><span class="status status--${item.status}">${item.status === 'overdue' ? 'Overdue' : 'Due soon'}</span><small class="row-date">${item.dueDate ? formatShortDate(item.dueDate) : `${Math.max(1, item.dueMileage).toLocaleString()} km`}</small></span>
    </a>`).join('');
    if (shouldAnimate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        requestAnimationFrame(() => container.classList.add('is-visible'));
    } else {
        container.classList.add('is-visible');
    }
}

function renderRecent(records) {
    const container = document.getElementById('recentRecordsList');
    if (!container) return;
    const items = records.sort((a, b) => (dateValue(b.date || b.createdAt)?.getTime() || 0) - (dateValue(a.date || a.createdAt)?.getTime() || 0)).slice(0, 3);
    if (!items.length) {
        container.innerHTML = '<div class="empty-state"><span>No recent records</span></div>';
        return;
    }
    container.innerHTML = items.map((item) => `<a href="history.html" class="record-row"><span class="row-icon"><i class="lucide lucide-wrench" aria-hidden="true"></i></span><span class="row-main"><strong class="row-title">${escapeHtml(item.title || item.task || 'Service record')}</strong><small class="row-subtitle">${escapeHtml(item.motorcycleName || item.motorcycle || 'Motorcycle')} · ${formatDate(dateValue(item.date || item.createdAt)).replace(', 20', ' ')}</small></span><strong class="row-amount">${formatDashboardCurrency(item.cost ?? item.amount ?? 0)}</strong></a>`).join('');
}

function renderMotorcycles(motorcycles) {
    const container = document.getElementById('motorcyclesList');
    if (!container) return;
    container.innerHTML = motorcycles.slice(0, 4).map((bike) => `<a href="motorcycles.html">${escapeHtml(motorcycleName(bike))}</a>`).join('');
}

function animateNumber(element, target, formatter, shouldAnimate) {
    if (!element) return;
    if (!shouldAnimate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        element.textContent = formatter(target);
        return;
    }
    const startedAt = performance.now();
    const tick = (now) => {
        const progress = Math.min(1, (now - startedAt) / 700);
        const eased = 1 - ((1 - progress) ** 3);
        element.textContent = formatter(target * eased);
        if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

function renderHero(nextItem, motorcycles, shouldAnimate = false) {
    const hero = document.getElementById('homeHero');
    const daysElement = document.getElementById('heroDays');
    const progressElement = document.getElementById('heroProgress');
    const item = nextItem || null;
    const days = Math.max(0, item?.daysUntil ?? 0);
    if (hero) hero.classList.toggle('is-animated', shouldAnimate);
    if (daysElement) animateNumber(daysElement, days, (value) => String(Math.round(value)), shouldAnimate);
    document.getElementById('heroService').textContent = item ? `${item.task} · ${item.motorcycleName}` : 'No service scheduled';
    document.getElementById('heroLast').textContent = item?.lastDoneDate ? `Last ${formatShortDate(item.lastDoneDate)}` : 'Last not set';
    document.getElementById('heroDue').textContent = item?.dueDate ? `Due ${formatShortDate(item.dueDate)}` : item ? `Due ${item.dueMileage.toLocaleString()} km` : 'Due not set';
    if (progressElement) {
        progressElement.style.width = shouldAnimate ? '0%' : `${item?.progress || 0}%`;
        if (shouldAnimate) requestAnimationFrame(() => { progressElement.style.width = `${item?.progress || 0}%`; });
    }
}

function renderInsight(motorcycles) {
    const bike = motorcycles[0];
    const averageMileage = motorcycles.length ? Math.round(motorcycles.reduce((sum, item) => sum + mileage(item), 0) / motorcycles.length / 30) : 0;
    const category = bike ? classifyMotorcycleCategory(bike) : null;
    const insight = bike
        ? `Based on your ${escapeHtml(motorcycleName(bike))} and around ${averageMileage.toLocaleString()} km/day estimated usage, check your ${category?.key === 'scooter' ? 'oil and CVT service' : 'oil and chain service'} next.`
        : 'Add a motorcycle to receive a maintenance insight based on your real mileage.';
    document.getElementById('aiInsight').innerHTML = insight;
    document.getElementById('askMotoAi').href = `motoai.html?context=${encodeURIComponent(insight)}`;
}

function loadNotificationCount(uid) {
    return getDocs(query(collection(db, 'notifications'), where('uid', '==', uid), where('read', '==', false))).then((snapshot) => {
        const badge = document.getElementById('notificationBadge');
        if (badge) {
            badge.textContent = snapshot.size > 99 ? '99+' : String(snapshot.size);
            badge.classList.toggle('hidden', snapshot.size === 0);
        }
    }).catch((error) => console.warn('Unread notifications unavailable:', error.message));
}

async function loadDashboard(user) {
    const uid = user.uid;
    const [motorcyclesSnapshot, maintenanceSnapshot, repairsSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'motorcycles'), where('uid', '==', uid))),
        getDocs(query(collection(db, 'maintenance'), where('uid', '==', uid))),
        getDocs(query(collection(db, 'repairs'), where('uid', '==', uid)))
    ]);
    const motorcycles = motorcyclesSnapshot.docs.map((entry) => normalizeRecord({ id: entry.id, ...entry.data() })).filter((item) => item.deleted !== true);
    const maintenance = maintenanceSnapshot.docs.map((entry) => normalizeRecord({ id: entry.id, ...entry.data() })).filter((item) => item.deleted !== true);
    const repairs = repairsSnapshot.docs.map((entry) => normalizeRecord({ id: entry.id, ...entry.data() })).filter((item) => item.deleted !== true);
    const now = new Date();
    const monthTotal = repairs.filter((item) => {
        const date = dateValue(item.date || item.createdAt);
        return date && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }).reduce((sum, item) => sum + Number(item.cost ?? item.amount ?? item.total ?? 0), 0);
    const scheduleItems = buildMaintenanceItems(motorcycles, maintenance);
    const urgent = scheduleItems.filter((item) => item.status !== 'scheduled').slice(0, 3);
    const nextItem = scheduleItems[0];
    const shouldAnimate = !dashboardHasRendered;
    animateNumber(document.getElementById('totalBikes'), motorcycles.length, (value) => String(Math.round(value)), shouldAnimate);
    animateNumber(document.getElementById('totalRecords'), repairs.length, (value) => String(Math.round(value)), shouldAnimate);
    animateNumber(document.getElementById('monthTotal'), monthTotal, formatDashboardCurrency, shouldAnimate);
    renderStreak(uid);
    renderInsight(motorcycles);
    renderHero(nextItem, motorcycles, shouldAnimate);
    renderMotorcycles(motorcycles);
    renderUrgent(urgent, shouldAnimate);
    renderRecent(repairs);
    dashboardHasRendered = true;
    await loadNotificationCount(uid);
}

document.getElementById('logoutBtn')?.addEventListener('click', () => window.openLogoutConfirmation?.(() => signOut(auth)));
document.getElementById('streakButton')?.addEventListener('click', () => {
    if (typeof window.openStreakModal === 'function') window.openStreakModal(auth.currentUser?.uid);
});

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }
    const firstName = (user.displayName || user.email?.split('@')[0] || 'Rider').split(' ')[0];
    const hour = new Date().getHours();
    document.getElementById('userName').textContent = firstName;
    document.getElementById('greeting').textContent = `${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}`;
    try {
        await loadDashboard(user);
    } catch (error) {
        console.error('Dashboard load failed:', error);
    }
});
