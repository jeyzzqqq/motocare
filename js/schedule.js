import { auth, db } from './firebase-config.js?v=3';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";
import { getFirestoreDocs, addFirestoreDoc, updateFirestoreDoc, ensureMotorcyclesTrackedFromOdo } from './firebaseUtils.js?v=4';
import { collection, doc, query, runTransaction, serverTimestamp, where, onSnapshot } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";
import { normalizeRecord } from './utils-module.js';
import { MAINTENANCE_RULES, classifyMotorcycleCategory } from './maintenanceOptions.js?v=2';
import { showToast } from './toast.js?v=1';
import { syncMaintenanceNotifications } from './maintenanceNotifications.js?v=1';
import {
    getMaintenanceTaskStatus,
    getCompletionMileage,
    getReminderThreshold
} from './maintenanceStatus.js?v=2';

let currentUserId = null;
let currentUserEmail = '';
let scheduleItems = [];
let motorcycles = [];
let maintenanceRecords = [];
let maintenanceRecordsReady = false;
let selectedMotorcycleId = '';
let motorcyclesUnsub = null;
let maintenanceUnsub = null;
let currentScheduleFilter = 'all';
let activeCompletionItem = null;
const completionSaveProgress = new Map();
const completedSubmissionKeys = new Set();

const SELECTED_MOTORCYCLE_STORAGE_KEY = 'motocare.selectedMotorcycleId';

function deferMaintenanceNotificationSync(uid, options) {
    window.setTimeout(() => {
        void syncMaintenanceNotifications(uid, options);
    }, 0);
}

function bindScheduleControls() {
    const drawerButton = document.getElementById('motorcycleDrawerButton');
    const drawerBackdrop = document.getElementById('motorcycleDrawerBackdrop');
    const closeButton = document.getElementById('motorcycleDrawerCloseButton');
    const scheduleList = document.getElementById('scheduleList');
    const completionBackdrop = document.getElementById('scheduleDoneBackdrop');
    const completionForm = document.getElementById('scheduleDoneForm');

    drawerButton?.addEventListener('click', openMotorcycleDrawer);
    drawerBackdrop?.addEventListener('click', closeMotorcycleDrawer);
    closeButton?.addEventListener('click', closeMotorcycleDrawer);
    scheduleList?.addEventListener('click', (event) => {
        const button = event.target.closest?.('[data-schedule-mark-done]');
        if (!button) return;
        openMarkDoneSheet(button.dataset.motorcycleId, button.dataset.ruleKey);
    });
    completionBackdrop?.addEventListener('click', (event) => {
        if (event.target === completionBackdrop) closeMarkDoneSheet();
    });
    document.getElementById('scheduleDoneCancel')?.addEventListener('click', closeMarkDoneSheet);
    document.getElementById('scheduleDoneClose')?.addEventListener('click', closeMarkDoneSheet);
    completionForm?.addEventListener('submit', submitMarkDone);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && completionBackdrop && !completionBackdrop.hidden) {
            closeMarkDoneSheet();
        }
    });
    document.getElementById('logoutBtn')?.addEventListener('click', () => window.openLogoutConfirmation?.(() => {
        window.resetMotoCareTheme?.();
        return signOut(auth);
    }));
    document.querySelectorAll('[data-schedule-filter]').forEach((button) => {
        button.addEventListener('click', () => {
            currentScheduleFilter = button.dataset.scheduleFilter || 'all';
            document.querySelectorAll('[data-schedule-filter]').forEach((tab) => {
                tab.classList.toggle('is-active', tab === button);
            });
            displaySchedule(getSelectedScheduleItems());
        });
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindScheduleControls);
} else {
    bindScheduleControls();
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    currentUserId = user.uid;
    currentUserEmail = user.email || '';
    // Use realtime listeners so schedule reflects recent saves immediately
    setupScheduleListeners(user.uid);
});

function normalizeText(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getMotorcycleLabel(motorcycle) {
    return motorcycle.motorcycleName || [motorcycle.brand, motorcycle.model].filter(Boolean).join(' ') || 'Motorcycle';
}

function getMileageValue(motorcycle) {
    const raw = motorcycle.mileage ?? motorcycle.odo ?? motorcycle.currentOdo ?? motorcycle.odometer ?? 0;
    const numeric = Number(raw);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function getCategoryIndicator(taskStatuses, odo) {
    const priority = { overdue: 0, upcoming: 1, scheduled: 2 };
    const mostUrgent = [...taskStatuses].sort((left, right) => {
        const leftStatus = left.taskStatus.status.key;
        const rightStatus = right.taskStatus.status.key;
        const statusDiff = priority[leftStatus] - priority[rightStatus];
        if (statusDiff !== 0) return statusDiff;
        if (leftStatus === 'overdue') {
            return (odo - right.taskStatus.dueMileage) - (odo - left.taskStatus.dueMileage);
        }
        return left.taskStatus.dueMileage - right.taskStatus.dueMileage;
    })[0];

    if (!mostUrgent || mostUrgent.taskStatus.status.key === 'scheduled') {
        return { label: 'OK', icon: 'check-circle-2', className: 'bg-green-100 text-green-700' };
    }

    const isOverdue = mostUrgent.taskStatus.status.key === 'overdue';
    return {
        label: isOverdue ? `${mostUrgent.rule.task} Overdue` : `${mostUrgent.rule.task} Due Soon`,
        icon: mostUrgent.rule.icon,
        className: isOverdue ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
    };
}

function buildReminderSignature(item = {}) {
    const moto = String(item.motorcycleId || '').trim();
    const key = String(item.ruleKey || '').trim();
    const taskNorm = normalizeText(item.task || item.title || '');
    const due = String(item.dueMileage || item.due || '').trim();
    // Prefer ruleKey when available, otherwise use normalized task name
    const idPart = key ? key : taskNorm;
    return `${moto}::${idPart}::${due}`;
}

function buildScheduleForMotorcycle(motorcycle, maintenanceItems) {
    const category = classifyMotorcycleCategory(motorcycle);
    const odo = getMileageValue(motorcycle);
    const motorcycleLabel = getMotorcycleLabel(motorcycle);
    const taskStatuses = MAINTENANCE_RULES[category.key].map((rule) => ({
        rule,
        taskStatus: getMaintenanceTaskStatus(motorcycle, rule, maintenanceItems)
    }));
    const overall = getCategoryIndicator(taskStatuses, odo);

    return taskStatuses.map(({ rule, taskStatus }) => {
        const completedRecord = taskStatus.completedRecord;
        const hasCompletion = taskStatus.hasCompletion;
        const anchorMileage = completedRecord
            ? getCompletionMileage(completedRecord)
            : Number(motorcycle.trackedFromOdo);
        const anchorSource = completedRecord ? 'last completed service' : 'tracked odometer';
        const dueMileage = taskStatus.dueMileage;
        const status = taskStatus.status;
        const remaining = Math.max(0, dueMileage - odo);
        const overdueBy = Math.max(0, odo - dueMileage);
        const reminder = status.key === 'overdue'
            ? `Overdue by ${overdueBy.toLocaleString()} km (target ${dueMileage.toLocaleString()} km)`
            : status.key === 'due'
                ? `Due now at ${dueMileage.toLocaleString()} km`
                : `${remaining.toLocaleString()} km left until ${dueMileage.toLocaleString()} km`;

        return {
            id: completedRecord?.id || `${motorcycle.id}-${rule.key}`,
            motorcycleId: motorcycle.id,
            motorcycleName: motorcycleLabel,
            categoryKey: category.key,
            categoryLabel: category.label,
            categoryBadge: category.badge,
            categoryChip: category.chip,
            currentOdo: odo,
            overall,
            ruleKey: rule.key,
            task: rule.task,
            threshold: rule.interval,
            dueMileage,
            icon: rule.icon,
            status,
            reminder,
            maintenanceId: completedRecord?.id || '',
            completed: status.key === 'completed',
            lastCompletedMileage: completedRecord ? getCompletionMileage(completedRecord) : null,
            lastCompletedDate: completedRecord ? completedRecord.completedAt || completedRecord.date || completedRecord.createdAt || null : null,
            anchorMileage,
            anchorSource
        };
    });
}

function buildComputationNote(item) {
    const intervalText = `${Number(item?.threshold || 0).toLocaleString()} km`;
    const anchorText = `${Number(item?.anchorMileage || 0).toLocaleString()} km`;
    const dueText = `${Number(item?.dueMileage || 0).toLocaleString()} km`;
    const sourceText = String(item?.anchorSource || 'computed source');
    return `Interval: ${intervalText} | Anchor: ${anchorText} (${sourceText}) | Next due: ${dueText}`;
}

function groupScheduleByMotorcycle(items) {
    const groups = new Map();

    items.forEach((item) => {
        const key = String(item.motorcycleId || 'unknown');
        if (!groups.has(key)) {
            groups.set(key, {
                motorcycleId: item.motorcycleId,
                motorcycleName: item.motorcycleName,
                categoryLabel: item.categoryLabel,
                categoryBadge: item.categoryBadge,
                currentOdo: item.currentOdo,
                items: []
            });
        }

        groups.get(key).items.push(item);
    });

    return Array.from(groups.values()).sort((a, b) => {
        const aName = String(a.motorcycleName || '');
        const bName = String(b.motorcycleName || '');
        return aName.localeCompare(bName);
    });
}

function getSelectedMotorcycle() {
    return motorcycles.find((motorcycle) => motorcycle.id === selectedMotorcycleId) || motorcycles[0] || null;
}

function getSelectedScheduleItems() {
    if (!selectedMotorcycleId) {
        return [];
    }

    return scheduleItems.filter((item) => String(item.motorcycleId || '') === String(selectedMotorcycleId));
}

function persistSelectedMotorcycleId(motorcycleId) {
    try {
        localStorage.setItem(SELECTED_MOTORCYCLE_STORAGE_KEY, motorcycleId || '');
    } catch (error) {
        console.warn('Could not persist selected motorcycle:', error);
    }
}

function readSelectedMotorcycleId() {
    try {
        return localStorage.getItem(SELECTED_MOTORCYCLE_STORAGE_KEY) || '';
    } catch (error) {
        return '';
    }
}

function openMotorcycleDrawer() {
    const drawer = document.getElementById('motorcycleDrawer');
    const backdrop = document.getElementById('motorcycleDrawerBackdrop');
    if (!drawer || !backdrop) return;

    drawer.classList.remove('hidden');
    backdrop.classList.remove('hidden');
    requestAnimationFrame(() => {
        drawer.classList.remove('-translate-x-full');
    });
}

function closeMotorcycleDrawer() {
    const drawer = document.getElementById('motorcycleDrawer');
    const backdrop = document.getElementById('motorcycleDrawerBackdrop');
    if (!drawer || !backdrop) return;

    drawer.classList.add('-translate-x-full');
    backdrop.classList.add('hidden');
    setTimeout(() => {
        drawer.classList.add('hidden');
    }, 180);
}

function renderMotorcycleDrawer() {
    const list = document.getElementById('motorcycleDrawerList');
    if (!list) return;

    const selectedMotorcycle = getSelectedMotorcycle();

    if (!motorcycles.length) {
        list.innerHTML = '<div class="text-sm text-gray-500">No motorcycles found in your profile.</div>';
        return;
    }

    list.innerHTML = motorcycles.map((motorcycle) => {
        const isActive = motorcycle.id === selectedMotorcycleId;
        return `
            <button type="button" onclick="selectMotorcycleUnit('${motorcycle.id}')" class="w-full text-left rounded-xl border px-4 py-3 transition-colors ${isActive ? 'border-green-700 bg-green-50' : 'border-gray-200 bg-white hover:bg-gray-50'}">
                <div class="flex items-start justify-between gap-3">
                    <div>
                        <p class="font-semibold text-gray-800">${escapeHtml(getMotorcycleLabel(motorcycle))}</p>
                        <p class="text-xs text-gray-500 mt-1">ODO ${getMileageValue(motorcycle).toLocaleString()} km</p>
                    </div>
                    <span class="text-xs px-2 py-1 rounded-full font-medium ${isActive ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600'}">
                        ${isActive ? 'Selected' : 'View'}
                    </span>
                </div>
            </button>
        `;
    }).join('');
}

function selectMotorcycleUnit(motorcycleId) {
    selectedMotorcycleId = motorcycleId;
    persistSelectedMotorcycleId(motorcycleId);
    renderMotorcycleDrawer();
    displaySchedule(getSelectedScheduleItems());
    updateCounts(getSelectedScheduleItems());
    closeMotorcycleDrawer();
}

window.openMotorcycleDrawer = openMotorcycleDrawer;
window.closeMotorcycleDrawer = closeMotorcycleDrawer;
window.selectMotorcycleUnit = selectMotorcycleUnit;

async function loadSchedule(userId) {
    // Deprecated: loadSchedule is now handled by realtime listeners in setupScheduleListeners
    return;
}

function setupScheduleListeners(userId) {
    // Unsubscribe existing listeners
    try { if (motorcyclesUnsub) motorcyclesUnsub(); } catch (e) {}
    try { if (maintenanceUnsub) maintenanceUnsub(); } catch (e) {}

    const motorcyclesQuery = query(collection(db, 'motorcycles'), where('uid', '==', userId));
    const maintenanceQuery = query(collection(db, 'maintenance'), where('uid', '==', userId));

    motorcyclesUnsub = onSnapshot(motorcyclesQuery, async (snap) => {
        const loadedMotorcycles = [];
        snap.forEach((doc) => {
            const data = normalizeRecord({ id: doc.id, ...doc.data() });
            if (data.deleted !== true) loadedMotorcycles.push(data);
        });

        try {
            motorcycles = await ensureMotorcyclesTrackedFromOdo(loadedMotorcycles);
        } catch (error) {
            console.error('Could not persist tracked odometer baselines:', error);
            return;
        }

        if (!motorcycles.length) {
            scheduleItems = [];
            window.scheduleItems = scheduleItems;
            selectedMotorcycleId = '';
            renderMotorcycleDrawer();
            renderEmptySchedule('No motorcycles yet. Add one first to generate maintenance reminders.');
            return;
        }

        const storedSelection = readSelectedMotorcycleId();
        const hasStoredSelection = storedSelection && motorcycles.some((motorcycle) => motorcycle.id === storedSelection);
        selectedMotorcycleId = hasStoredSelection ? storedSelection : motorcycles[0].id;
        persistSelectedMotorcycleId(selectedMotorcycleId);

        // Recompute schedule with latest maintenance items
        scheduleItems = motorcycles
            .flatMap((motorcycle) => buildScheduleForMotorcycle(motorcycle, maintenanceRecords))
            .sort((a, b) => {
                const priority = { overdue: 0, due: 1, upcoming: 2, scheduled: 3, completed: 4 };
                const statusDiff = priority[a.status.key] - priority[b.status.key];
                if (statusDiff !== 0) return statusDiff;
                if (a.dueMileage !== b.dueMileage) return a.dueMileage - b.dueMileage;
                return a.currentOdo - b.currentOdo;
            });
        window.scheduleItems = scheduleItems;

        renderMotorcycleDrawer();
        displaySchedule(getSelectedScheduleItems());
        updateCounts(getSelectedScheduleItems());
        if (maintenanceRecordsReady) {
            deferMaintenanceNotificationSync(userId, { motorcycles, maintenance: maintenanceRecords });
        }
        // create pending reminders from current schedule
        (async () => {
            try { await createPendingReminders(scheduleItems); } catch (err) { console.error('Error creating pending reminders:', err); }
        })();
    }, (err) => {
        console.error('Motorcycles listener error:', err);
    });

    maintenanceUnsub = onSnapshot(maintenanceQuery, (snap) => {
        maintenanceRecords = [];
        snap.forEach((doc) => {
            const data = normalizeRecord({ id: doc.id, ...doc.data() });
            if (data.deleted !== true) maintenanceRecords.push(data);
        });
        maintenanceRecordsReady = true;

        // Recompute schedule when maintenance changes
        if (motorcycles && motorcycles.length) {
            scheduleItems = motorcycles
                .flatMap((motorcycle) => buildScheduleForMotorcycle(motorcycle, maintenanceRecords))
                .sort((a, b) => {
                    const priority = { overdue: 0, due: 1, upcoming: 2, scheduled: 3, completed: 4 };
                    const statusDiff = priority[a.status.key] - priority[b.status.key];
                    if (statusDiff !== 0) return statusDiff;
                    if (a.dueMileage !== b.dueMileage) return a.dueMileage - b.dueMileage;
                    return a.currentOdo - b.currentOdo;
                });
            window.scheduleItems = scheduleItems;

            renderMotorcycleDrawer();
            displaySchedule(getSelectedScheduleItems());
            updateCounts(getSelectedScheduleItems());
            deferMaintenanceNotificationSync(userId, { motorcycles, maintenance: maintenanceRecords });
            (async () => {
                try { await createPendingReminders(scheduleItems); } catch (err) { console.error('Error creating pending reminders:', err); }
            })();
        }
    }, (err) => {
        console.error('Maintenance listener error:', err);
    });
}

function renderEmptySchedule(message = 'No maintenance reminders yet') {
    const container = document.getElementById('scheduleList');
    if (container) {
        container.innerHTML = `
            <div class="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-center text-gray-500 text-sm">
                ${escapeHtml(message)}
            </div>
        `;
    }

    const dueEl = document.getElementById('dueCount');
    const upcomingEl = document.getElementById('upcomingCount');
    const completedEl = document.getElementById('completedCount');
    if (dueEl) dueEl.textContent = '0';
    if (upcomingEl) upcomingEl.textContent = '0';
    if (completedEl) completedEl.textContent = '0';
}

function formatMileage(value) {
    const numeric = Number(value || 0);
    return Number.isFinite(numeric) ? numeric.toLocaleString() : '0';
}

function formatServiceDate(value) {
    if (!value) return 'None yet';
    const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? 'None yet' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getDisplayStatus(item) {
    if (item.status.key === 'overdue' || item.status.key === 'due') {
        return { label: 'Overdue', className: 'schedule-status--overdue', filter: 'overdue' };
    }
    if (item.status.key === 'upcoming') {
        return { label: 'Due soon', className: 'schedule-status--due', filter: 'due-soon' };
    }
    return { label: 'On track', className: 'schedule-status--scheduled', filter: 'upcoming' };
}

function filterScheduleItems(items) {
    if (currentScheduleFilter === 'all') return items;
    return items.filter((item) => getDisplayStatus(item).filter === currentScheduleFilter);
}

function scheduleIconMarkup(iconName) {
    const icons = {
        'droplets': 'fa-droplet',
        'wrench': 'fa-wrench',
        'settings-2': 'fa-gears',
        'shield-check': 'fa-shield-halved',
        'alert-triangle': 'fa-triangle-exclamation',
        'sparkles': 'fa-wand-magic-sparkles',
        'clipboard-check': 'fa-clipboard-check',
        'link': 'fa-link',
        'thermometer': 'fa-temperature-half',
        'alert-circle': 'fa-circle-exclamation',
        'check-circle-2': 'fa-circle-check',
        'clock': 'fa-clock'
    };
    const icon = icons[iconName] || icons.wrench;
    return `<i class="fa-solid ${icon}" aria-hidden="true"></i>`;
}

function displaySchedule(items) {
    const container = document.getElementById('scheduleList');
    if (!container) return;

    const visibleItems = filterScheduleItems(items);

    if (!visibleItems.length) {
        const selectedMotorcycle = getSelectedMotorcycle();
        if (currentScheduleFilter !== 'all') {
            const emptyMessage = currentScheduleFilter === 'overdue' ? 'No overdue items. Great job!' : `No ${currentScheduleFilter.replace('-', ' ')} items right now.`;
            renderEmptySchedule(emptyMessage);
        } else if (selectedMotorcycle) {
            renderEmptySchedule(`No reminders available for ${selectedMotorcycle.motorcycleName}.`);
        } else {
            renderEmptySchedule('Select a motorcycle from the menu to view reminders.');
        }
        return;
    }

    const selectedMotorcycle = getSelectedMotorcycle();
    const motorcycleName = selectedMotorcycle ? getMotorcycleLabel(selectedMotorcycle) : 'Selected motorcycle';
    const motorcycleCategory = selectedMotorcycle ? classifyMotorcycleCategory(selectedMotorcycle) : null;
    const currentOdo = selectedMotorcycle ? formatMileage(selectedMotorcycle?.mileage ?? selectedMotorcycle?.odo ?? selectedMotorcycle?.currentOdo ?? selectedMotorcycle?.odometer) : '0';
    const currentThreshold = selectedMotorcycle ? getReminderThreshold(selectedMotorcycle.id) : getReminderThreshold();

    container.innerHTML = `
        <div class="schedule-controls">
            <div class="flex items-center justify-between gap-3">
                <div>
                    <p class="text-sm font-bold text-gray-900">${escapeHtml(motorcycleName)}</p>
                    <p class="mt-0.5 text-[10px] text-gray-500">${visibleItems.length} reminder${visibleItems.length === 1 ? '' : 's'}</p>
                </div>
            </div>
            <div class="mt-3 flex items-center justify-between gap-2">
                <label for="reminderThresholdInput" class="schedule-label">REMINDER THRESHOLD</label>
                <div class="flex items-center gap-2">
                <label for="reminderThresholdInput" class="sr-only">Threshold in kilometers</label>
                <div class="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1">
                    <input id="reminderThresholdInput" type="number" min="0" step="50" class="w-16 bg-transparent text-xs outline-none" value="${Number(currentThreshold)}" aria-label="Reminder threshold in kilometers">
                    <span class="text-xs text-gray-600">km</span>
                </div>
                <button id="reminderThresholdSave" class="rounded-lg bg-green-700 px-3 py-1.5 text-xs font-bold text-white">Apply</button>
                <button id="reminderThresholdReset" class="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs">Reset</button>
                </div>
            </div>
        </div>

        ${visibleItems.map((item) => { const displayStatus = getDisplayStatus(item); const canMarkDone = maintenanceRecordsReady && (item.status.key === 'upcoming' || item.status.key === 'overdue' || item.status.key === 'due'); return `
            <article class="schedule-card">
                <div class="schedule-card__top">
                    <div class="schedule-icon">${scheduleIconMarkup(item.icon || item.overall.icon)}</div>
                    <div class="schedule-card__identity">
                        <div class="flex items-start justify-between gap-2">
                            <h2 class="schedule-card__name">${escapeHtml(item.task)}</h2>
                            <span class="schedule-status ${displayStatus.className}">${displayStatus.label}</span>
                        </div>
                        <p class="schedule-card__bike">${escapeHtml(item.motorcycleName)}</p>
                    </div>
                </div>
                <div class="schedule-card__details">
                    <div><p class="schedule-label">DUE</p><p class="schedule-value">At ${formatMileage(item.dueMileage)} km</p></div>
                    <div><p class="schedule-label">LAST DONE</p><p class="schedule-value">${formatServiceDate(item.lastCompletedDate)}</p></div>
                </div>
                <div class="schedule-card__footer">
                    <p class="schedule-interval">Every ${formatMileage(item.threshold)} km</p>
                    <div class="schedule-card__footer-actions">
                        ${canMarkDone ? `
                            <button type="button" class="schedule-mark-done-button" data-schedule-mark-done data-motorcycle-id="${escapeHtml(item.motorcycleId)}" data-rule-key="${escapeHtml(item.ruleKey)}">
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>
                                <span>Mark as done</span>
                            </button>
                        ` : ''}
                        <button class="schedule-complete-button" onclick="markComplete('${item.id}'); return false;">Mark as Complete</button>
                    </div>
                </div>
            </article>
        `; }).join('')}
    `;

    // Hook threshold controls
    const thresholdInput = document.getElementById('reminderThresholdInput');
    const thresholdSave = document.getElementById('reminderThresholdSave');
    const thresholdReset = document.getElementById('reminderThresholdReset');
    if (thresholdSave && thresholdInput) {
        thresholdSave.addEventListener('click', () => {
            const btn = thresholdSave;
            const raw = thresholdInput.value;
            const val = Number(raw);
            if (!Number.isFinite(val) || val < 0) {
                showToast({ type: 'error', title: 'Invalid threshold', message: 'Enter a threshold of 0 or greater.' });
                return;
            }
            // guard unrealistic values
            if (val > 200000) {
                if (!confirm('Threshold seems very large. Continue?')) return;
            }

            btn.disabled = true;
            const prevText = btn.textContent;
            btn.textContent = 'Saving...';

            try {
                const selected = getSelectedMotorcycle();
                if (selected && selected.id) {
                    localStorage.setItem(`motocare.reminderThreshold.${selected.id}`, String(Math.floor(val)));
                } else {
                    localStorage.setItem('motocare.reminderThreshold.default', String(Math.floor(val)));
                }
                showToast({ type: 'success', title: 'Threshold saved', message: 'Reminder threshold saved.' });
                // reload schedule so statuses recompute
                setTimeout(() => loadSchedule(currentUserId), 250);
            } catch (e) {
                console.warn('Could not save threshold', e);
                showToast({ type: 'error', title: 'Threshold save failed', message: 'Could not save threshold.' });
            } finally {
                btn.disabled = false;
                btn.textContent = prevText;
            }
        });
    }

    if (thresholdReset && thresholdInput) {
        thresholdReset.addEventListener('click', () => {
            try {
                const selected = getSelectedMotorcycle();
                if (selected && selected.id) {
                    localStorage.removeItem(`motocare.reminderThreshold.${selected.id}`);
                } else {
                    localStorage.removeItem('motocare.reminderThreshold.default');
                }
                const newVal = getReminderThreshold(selected?.id);
                thresholdInput.value = String(newVal);
                showToast({ type: 'info', title: 'Threshold reset', message: `Threshold reset to ${String(newVal)} km.` });
                loadSchedule(currentUserId);
            } catch (e) {
                console.warn('Could not reset threshold', e);
                showToast({ type: 'error', title: 'Threshold reset failed', message: 'Could not reset threshold.' });
            }
        });
    }
}

function updateCounts(items) {
    const due = items.filter((item) => item.status.key === 'due' || item.status.key === 'overdue').length;
    const upcoming = items.filter((item) => item.status.key === 'upcoming' || item.status.key === 'scheduled').length;
    const completed = items.filter((item) => item.status.key === 'completed' || item.lastCompletedMileage > 0).length;

    const dueEl = document.getElementById('dueCount');
    const upcomingEl = document.getElementById('upcomingCount');
    const completedEl = document.getElementById('completedCount');
    const overdueSubtitle = document.getElementById('overdueSubtitle');

    if (dueEl) dueEl.textContent = String(due);
    if (upcomingEl) upcomingEl.textContent = String(upcoming);
    if (completedEl) completedEl.textContent = String(completed);
    if (overdueSubtitle) {
        const overdue = items.filter((item) => item.status.key === 'overdue' || item.status.key === 'due').length;
        overdueSubtitle.textContent = `${overdue} overdue`;
    }
    const scheduleSubtitle = document.getElementById('scheduleSubtitle');
    if (scheduleSubtitle) {
        const overdue = items.filter((item) => item.status.key === 'overdue' || item.status.key === 'due').length;
        scheduleSubtitle.textContent = `${overdue} overdue · ${items.length} total`;
    }
}

window.markComplete = async function(id) {
    if (!currentUserId) {
        console.error('No user ID available');
        return;
    }

    const item = scheduleItems.find((entry) => entry.id === id);
    if (!item) {
        showToast({ type: 'error', title: 'Reminder not found', message: 'Could not find the selected maintenance reminder.' });
        return;
    }
    // Redirect to add-record page with prefilled fields so the user can confirm and save the record
    try {
        const params = new URLSearchParams();
        params.set('motorcycleId', String(item.motorcycleId || ''));
        // default mileage prefill to current recorded ODO (user can adjust on the add form)
        params.set('mileage', String(Number(item.currentOdo || 0)));
        // set today's date in ISO yyyy-mm-dd for date input
        const today = new Date();
        params.set('date', today.toISOString().slice(0, 10));
        // Set titleSelect value for scheduled maintenance so add-record selects the correct option
        if (item.ruleKey) params.set('titleValue', `scheduled:${item.ruleKey}`);
        // ensure add-record will redirect back to Schedule after saving
        params.set('source', 'schedule');
        // include customTitle so the form can use the exact task name if the scheduled option isn't present
        if (item.task) params.set('customTitle', String(item.task || ''));
        if (item.categoryLabel) params.set('category', String(item.categoryLabel || ''));
        params.set('notes', 'Prefilled from Schedule — confirm details and Save.');

        if (window.openAddRecordSheet) {
            window.openAddRecordSheet(`?${params.toString()}`);
        } else {
            window.location.href = `add-record.html?${params.toString()}`;
        }
    } catch (error) {
        console.error('Error redirecting to add-record:', error);
        showToast({ type: 'error', title: 'Could not open form', message: 'Could not open Add Record form. Please try again.' });
    }
};

function getLocalDateInputValue(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getCompletionKey(item, mileage) {
    return `${currentUserId}::${item.motorcycleId}::${item.ruleKey}::${mileage}`;
}

function isMatchingCompletedRecord(record, item, mileage) {
    if (String(record.motorcycleId || '') !== String(item.motorcycleId || '')) return false;

    const status = String(record.status || '').toLowerCase().trim();
    const hasCompletion = ['completed', 'complete', 'done', 'logged'].includes(status)
        || (record.completedMileage !== undefined && record.completedMileage !== null)
        || (record.completedAt !== undefined && record.completedAt !== null);
    if (!hasCompletion || getCompletionMileage(record) !== mileage) return false;

    const recordTaskKey = String(record.taskKey || '').trim();
    if (recordTaskKey) return recordTaskKey === item.ruleKey;

    const recordTask = normalizeText(record.task || record.title || record.name || '');
    const scheduledTask = normalizeText(item.task);
    return Boolean(recordTask && (recordTask === scheduledTask
        || recordTask.includes(scheduledTask)
        || scheduledTask.includes(recordTask)));
}

function openMarkDoneSheet(motorcycleId, ruleKey) {
    const item = scheduleItems.find((entry) =>
        String(entry.motorcycleId) === String(motorcycleId)
        && String(entry.ruleKey) === String(ruleKey)
    );
    if (!item || !['upcoming', 'overdue', 'due'].includes(item.status.key)) return;

    const motorcycle = motorcycles.find((entry) => String(entry.id) === String(item.motorcycleId));
    const backdrop = document.getElementById('scheduleDoneBackdrop');
    const form = document.getElementById('scheduleDoneForm');
    if (!motorcycle || !backdrop || !form) {
        showToast({ type: 'error', title: 'Sheet unavailable', message: 'Could not open the completion form.' });
        return;
    }

    activeCompletionItem = item;
    document.getElementById('scheduleDoneTitle').textContent = item.task;
    document.getElementById('scheduleDoneMotorcycle').textContent = item.motorcycleName;
    document.getElementById('scheduleDoneOdo').value = String(getMileageValue(motorcycle));
    document.getElementById('scheduleDoneDate').value = getLocalDateInputValue();
    document.getElementById('scheduleDoneCost').value = '';

    backdrop.hidden = false;
    document.body.classList.add('schedule-done-open');
    requestAnimationFrame(() => {
        backdrop.classList.add('is-open');
        document.getElementById('scheduleDoneOdo').focus({ preventScroll: true });
    });
}

function closeMarkDoneSheet() {
    const backdrop = document.getElementById('scheduleDoneBackdrop');
    if (!backdrop || backdrop.hidden) return;
    backdrop.classList.remove('is-open');
    document.body.classList.remove('schedule-done-open');
    window.setTimeout(() => {
        if (!backdrop.classList.contains('is-open')) backdrop.hidden = true;
    }, 220);
    activeCompletionItem = null;
}

async function submitMarkDone(event) {
    event.preventDefault();
    if (!activeCompletionItem) return;

    const confirmButton = document.getElementById('scheduleDoneConfirm');
    const odoInput = document.getElementById('scheduleDoneOdo');
    const dateInput = document.getElementById('scheduleDoneDate');
    const costInput = document.getElementById('scheduleDoneCost');
    const odoText = odoInput.value.trim();
    const date = dateInput.value;
    const costText = costInput.value.trim();
    const mileage = Number(odoText);
    const cost = costText === '' ? 0 : Number(costText);
    const item = activeCompletionItem;
    const motorcycle = motorcycles.find((entry) => String(entry.id) === String(item.motorcycleId));

    if (!odoText || !Number.isFinite(mileage) || mileage < 0 || !date) {
        showToast({ type: 'error', title: 'Check required fields', message: 'Enter a valid odometer and date.' });
        return;
    }
    if (costText !== '' && (!Number.isFinite(cost) || cost < 0)) {
        showToast({ type: 'error', title: 'Invalid cost', message: 'Cost must be 0 or greater.' });
        return;
    }
    if (!motorcycle) {
        showToast({ type: 'error', title: 'Motorcycle unavailable', message: 'Could not find this motorcycle.' });
        return;
    }

    const currentMileage = getMileageValue(motorcycle);
    if (mileage < currentMileage) {
        showToast({ type: 'error', title: 'Mileage too low', message: `Mileage cannot be below current ODO (${currentMileage.toLocaleString()} km).` });
        return;
    }

    const completionKey = getCompletionKey(item, mileage);
    const progress = completionSaveProgress.get(completionKey);
    const alreadyCompleted = completedSubmissionKeys.has(completionKey)
        || maintenanceRecords.some((record) => isMatchingCompletedRecord(record, item, mileage));
    if (!progress?.maintenanceWritten && alreadyCompleted) {
        showToast({ type: 'error', title: 'Already completed', message: `${item.task} is already logged at ${formatMileage(mileage)} km.` });
        return;
    }

    if (confirmButton.disabled) return;
    confirmButton.disabled = true;
    confirmButton.textContent = 'Saving...';

    const recordName = `${motorcycle.brand} ${motorcycle.model}`;
    const saveProgress = progress || {
        repairWritten: false,
        maintenanceWritten: false
    };
    const formData = {
        title: item.task,
        date,
        cost,
        mileage,
        mechanic: '',
        category: item.categoryLabel,
        motorcycleId: motorcycle.id,
        motorcycleName: recordName,
        recordKind: 'scheduled',
        taskKey: item.ruleKey
    };

    try {
        if (!saveProgress.repairWritten) {
            await addFirestoreDoc('repairs', formData);
            saveProgress.repairWritten = true;
            completionSaveProgress.set(completionKey, saveProgress);
        }

        if (!saveProgress.maintenanceWritten) {
            await addFirestoreDoc('maintenance', {
                motorcycleId: motorcycle.id,
                motorcycleName: recordName,
                category: item.categoryLabel,
                taskKey: item.ruleKey,
                task: item.task,
                status: 'completed',
                dueMileage: mileage,
                completedMileage: mileage,
                completedAt: date,
                source: 'add-record'
            });
            saveProgress.maintenanceWritten = true;
            completionSaveProgress.set(completionKey, saveProgress);
            completedSubmissionKeys.add(completionKey);
        }

        const motorcycleMileageUpdate = { mileage };
        if (mileage < Number(motorcycle.trackedFromOdo)) {
            motorcycleMileageUpdate.trackedFromOdo = mileage;
        }
        await updateFirestoreDoc('motorcycles', motorcycle.id, motorcycleMileageUpdate);

        completionSaveProgress.delete(completionKey);
        deferMaintenanceNotificationSync(currentUserId);
        closeMarkDoneSheet();
        const nextDue = mileage + Number(item.threshold);
        showToast({
            type: 'success',
            title: 'Marked as done',
            message: `${item.task} done. Next due at ${formatMileage(nextDue)} km.`
        });
    } catch (error) {
        console.error('Error marking scheduled maintenance as done:', error);
        showToast({
            type: 'error',
            title: 'Save failed',
            message: error?.message || 'Could not save this maintenance completion. Please try again.'
        });
    } finally {
        confirmButton.disabled = false;
        confirmButton.textContent = 'Confirm';
    }
}

// Per-card manual send removed — email sends are handled automatically by createPendingReminders




/**
 * Create pending email reminders for items that are due or overdue.
 * Avoid creating duplicates by checking existing user reminders.
 */
async function createPendingReminders(items = []) {
    try {
        if (!items || !items.length) return;
        // Only proceed when we have the authenticated user's email available
        if (!currentUserEmail) {
            console.warn('createPendingReminders: no authenticated email available');
            showToast({ type: 'error', title: 'Email unavailable', message: 'Reminders cannot be sent without an authenticated email.' });
            return;
        }

        // Fetch existing reminders for this user
        const existing = await getFirestoreDocs('emailReminders').catch(() => []);

        const pending = items.filter((it) => {
            if (!it || !it.status) return false;
            const remaining = Math.max(0, (Number(it.dueMileage || 0) - Number(it.currentOdo || 0)));
            const threshold = getReminderThreshold(it.motorcycleId);
            // send for due/overdue immediately, and for upcoming when within user's threshold
            if (it.status.key === 'due' || it.status.key === 'overdue') return true;
            if (it.status.key === 'upcoming' && Number(remaining) <= Number(threshold || 500)) return true;
            return false;
        });

        // Build a set of existing reminder signatures to avoid creating duplicates
        const existingSignatures = new Set((existing || []).map(r => buildReminderSignature({
            motorcycleId: r.motorcycleId,
            ruleKey: r.taskKey,
            task: r.task || r.title || r.reminderText,
            dueMileage: r.dueMileage || r.due || ''
        })));

        // Use a stable queue ID and transaction so listener updates cannot queue the same reminder twice.
        const createdSignatures = new Set();
        for (const item of pending) {
            const signature = buildReminderSignature({ motorcycleId: item.motorcycleId, ruleKey: item.ruleKey, task: item.task, dueMileage: item.dueMileage });

            if (existingSignatures.has(signature) || createdSignatures.has(signature)) {
                console.log('Skipping duplicate reminder creation for', item.motorcycleName, item.task || item.title, 'signature:', signature);
                continue;
            }

            const payload = {
                motorcycleId: item.motorcycleId,
                motorcycleName: item.motorcycleName,
                task: item.task,
                taskKey: item.ruleKey,
                dueMileage: item.dueMileage,
                currentOdo: item.currentOdo,
                categoryLabel: item.categoryLabel,
                reminderText: item.reminder,
                sendAt: new Date().toISOString(),
                sent: false,
                email: currentUserEmail
            };

            try {
                const reminderRef = doc(db, 'emailReminders', encodeURIComponent(signature));
                const wasCreated = await runTransaction(db, async (transaction) => {
                    const reminderSnapshot = await transaction.get(reminderRef);
                    if (reminderSnapshot.exists()) return false;
                    transaction.set(reminderRef, {
                        ...payload,
                        uid: currentUserId,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp()
                    });
                    return true;
                });
                if (!wasCreated) {
                    existingSignatures.add(signature);
                    continue;
                }
                createdSignatures.add(signature);
                existingSignatures.add(signature);
                console.log('Created reminder for', item.task, item.motorcycleName, 'signature:', signature);
                showToast({ type: 'info', title: 'Reminder created', message: `${item.task} for ${item.motorcycleName}.` });
            } catch (err) {
                console.warn('Could not create reminder doc for', item.id, err?.message || err);
            }
        }

        if (!createdSignatures.size) {
            console.log('createPendingReminders: no new reminder docs created');
            showToast({ type: 'info', title: 'No new reminders', message: 'There are no new reminders to create.' });
        }
    } catch (err) {
        console.error('createPendingReminders error:', err);
    }
}

// Manual trigger for debugging/send tests from Console or UI
window.triggerReminderSend = async function() {
    try {
        if (!window.scheduleItems) {
            showToast({ type: 'error', title: 'Schedule unavailable', message: 'No schedule items are available.' });
            return;
        }
        await createPendingReminders(window.scheduleItems);
    } catch (e) {
        console.error('triggerReminderSend error', e);
        showToast({ type: 'error', title: 'Trigger failed', message: `Could not trigger reminders: ${e?.message || 'Unknown error.'}` });
    }
};