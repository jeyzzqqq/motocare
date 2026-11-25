import { auth, db } from './firebase-config.js?v=3';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js';
import { MAINTENANCE_RULES, classifyMotorcycleCategory } from './maintenanceOptions.js';
import { normalizeRecord } from './utils-module.js';
import { getMaintenanceTaskStatus } from './maintenanceStatus.js';

const STREAK_PREFIX = 'motocare-streak-v1:';
const isDevelopment = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
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
    if (typeof window.formatCurrency === 'function') {
        return window.formatCurrency(Number(value) || 0).replace(/\.00$/, '');
    }
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(Number(value) || 0).replace(/\.00$/, '');
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

function buildMaintenanceItems(motorcycles, records, now = new Date()) {
    const activeRecords = records.filter((record) => record.deleted !== true);
    return motorcycles.filter((motorcycle) => motorcycle.deleted !== true).flatMap((motorcycle) => {
        const category = classifyMotorcycleCategory(motorcycle);
        const rules = MAINTENANCE_RULES[category.key] || [];
        const currentMileage = mileage(motorcycle);
        return rules.map((rule) => {
            const taskStatus = getMaintenanceTaskStatus(motorcycle, rule, activeRecords, now);
            const statusKey = taskStatus.status.key;
            const dueMileage = taskStatus.dueMileage;
            const remaining = Math.max(0, dueMileage - currentMileage);
            const overdueBy = Math.max(0, currentMileage - dueMileage);
            const text = statusKey === 'overdue'
                ? `Overdue by ${overdueBy.toLocaleString()} km (target ${dueMileage.toLocaleString()} km)`
                : statusKey === 'due'
                    ? `Due now at ${dueMileage.toLocaleString()} km`
                    : `${remaining.toLocaleString()} km left until ${dueMileage.toLocaleString()} km`;
            const completedRecord = taskStatus.completedRecord;
            const lastDoneDate = completedRecord
                ? dateValue(completedRecord.completedAt || completedRecord.date || completedRecord.createdAt)
                : null;
            const progress = dueMileage > 0
                ? Math.max(0, Math.min(100, (currentMileage / dueMileage) * 100))
                : 0;
            return {
                motorcycleId: motorcycle.id,
                bikeName: motorcycleName(motorcycle),
                task: rule.task,
                statusKey,
                dueMileage,
                dueDate: taskStatus.dueDate,
                text,
                icon: rule.icon || 'wrench',
                lastDoneDate,
                progress
            };
        });
    }).sort((a, b) => {
        const priority = { overdue: 0, due: 1, upcoming: 2, scheduled: 3 };
        const statusDiff = priority[a.statusKey] - priority[b.statusKey];
        if (statusDiff !== 0) return statusDiff;
        if (a.dueMileage !== b.dueMileage) return a.dueMileage - b.dueMileage;
        return String(a.bikeName).localeCompare(String(b.bikeName));
    });
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
        <span class="row-main"><strong class="row-title">${escapeHtml(item.task)}</strong><small class="row-subtitle">${escapeHtml(item.bikeName)}</small></span>
        <span class="row-meta"><span class="status status--${item.statusKey === 'overdue' ? 'overdue' : 'due-soon'}">${item.statusKey === 'overdue' ? 'Overdue' : 'Due soon'}</span><small class="row-date">${escapeHtml(item.text)}</small></span>
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
    const startedAt = Date.now();
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
    const days = 0;
    if (hero) hero.classList.toggle('is-animated', shouldAnimate);
    if (daysElement) animateNumber(daysElement, days, (value) => String(Math.round(value)), shouldAnimate);
    document.getElementById('heroService').textContent = item ? `${item.task} · ${item.bikeName}` : 'No service scheduled';
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
    const scheduleItems = buildMaintenanceItems(motorcycles, maintenance, now);
    const alerts = scheduleItems.filter((item) => item.statusKey !== 'scheduled');
    const urgent = alerts.slice(0, 3);
    if (isDevelopment) {
        console.log('[Dashboard] maintenance alerts', alerts.map((item) => ({
            task: item.task,
            statusKey: item.statusKey,
            dueMileage: item.dueMileage
        })));
    }
    const nextItem = scheduleItems[0];
    const shouldAnimate = !dashboardHasRendered;
    renderStreak(uid);
    renderInsight(motorcycles);
    renderHero(nextItem, motorcycles, shouldAnimate);
    renderMotorcycles(motorcycles);
    renderUrgent(urgent, shouldAnimate);
    renderRecent(repairs);
    dashboardHasRendered = true;
    await loadNotificationCount(uid);
}

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
