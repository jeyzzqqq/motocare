import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { addFirestoreDoc, getFirestoreDocs, updateFirestoreDoc, getFirestoreDocById } from './firebaseUtils.js';
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { normalizeRecord } from './utils-module.js';
import { MAINTENANCE_RULES, classifyMotorcycleCategory } from './maintenanceOptions.js';
import { initEmailJS, sendMaintenanceReminder } from './emailjs.js';

let currentUserId = null;
let currentUserEmail = '';
let scheduleItems = [];
let motorcycles = [];
let selectedMotorcycleId = '';
let motorcyclesUnsub = null;
let maintenanceUnsub = null;

const SELECTED_MOTORCYCLE_STORAGE_KEY = 'motocare.selectedMotorcycleId';

function bindScheduleControls() {
    const drawerButton = document.getElementById('motorcycleDrawerButton');
    const drawerBackdrop = document.getElementById('motorcycleDrawerBackdrop');
    const closeButton = document.getElementById('motorcycleDrawerCloseButton');

    drawerButton?.addEventListener('click', openMotorcycleDrawer);
    drawerBackdrop?.addEventListener('click', closeMotorcycleDrawer);
    closeButton?.addEventListener('click', closeMotorcycleDrawer);
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
    initEmailJS();
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

function getCategoryIndicator(categoryKey, odo) {
    const rules = {
        scooter: [
            { min: 20000, label: 'Full Inspection', icon: 'clipboard-check', className: 'bg-red-100 text-red-700' },
            { min: 15000, label: 'Injector + Throttle Body Cleaning', icon: 'sparkles', className: 'bg-red-100 text-red-700' },
            { min: 10000, label: 'Major Service Due', icon: 'alert-triangle', className: 'bg-red-100 text-red-700' },
            { min: 5000, label: 'CVT Service Required', icon: 'settings-2', className: 'bg-orange-100 text-orange-700' },
            { min: 1000, label: 'Oil Change Due', icon: 'droplets', className: 'bg-red-100 text-red-700' },
            { min: 800, label: 'Due Soon', icon: 'clock', className: 'bg-yellow-100 text-yellow-700' }
        ],
        underbone: [
            { min: 15000, label: 'Full Tune-up', icon: 'wrench', className: 'bg-red-100 text-red-700' },
            { min: 10000, label: 'Valve Check Required', icon: 'settings-2', className: 'bg-red-100 text-red-700' },
            { min: 3000, label: 'Chain Service Required', icon: 'link', className: 'bg-orange-100 text-orange-700' },
            { min: 1000, label: 'Oil Change Due', icon: 'droplets', className: 'bg-red-100 text-red-700' },
            { min: 800, label: 'Chain / Oil Due Soon', icon: 'clock', className: 'bg-yellow-100 text-yellow-700' }
        ],
        sport: [
            { min: 15000, label: 'High Maintenance Alert', icon: 'alert-circle', className: 'bg-red-100 text-red-700' },
            { min: 10000, label: 'Valve + Coolant Service', icon: 'thermometer', className: 'bg-red-100 text-red-700' },
            { min: 5000, label: 'Engine Tune Check', icon: 'wrench', className: 'bg-orange-100 text-orange-700' },
            { min: 1000, label: 'Oil Change Required', icon: 'droplets', className: 'bg-red-100 text-red-700' },
            { min: 800, label: 'Break-in Service Soon', icon: 'clock', className: 'bg-yellow-100 text-yellow-700' }
        ]
    };

    const list = rules[categoryKey] || rules.underbone;
    return list.find((entry) => odo >= entry.min) || { label: 'OK', icon: 'check-circle-2', className: 'bg-green-100 text-green-700' };
}

function getTaskStatus(odo, dueMileage, hasCompletion, threshold = 500) {
    // Determine status purely from current ODO vs due mileage so the schedule shows the next due
    // after a completion is logged. The completion is stored in `maintenance` (and History),
    // but the schedule should represent the next target rather than remaining 'Logged'.
    if (odo > dueMileage) {
        return { key: 'overdue', label: 'Due / overdue', className: 'bg-red-100 text-red-700', dotClass: 'bg-red-500' };
    }

    if (odo === dueMileage) {
        return { key: 'due', label: 'Due / overdue', className: 'bg-red-100 text-red-700', dotClass: 'bg-red-500' };
    }

    // Use configurable threshold (in km) to decide when a task moves to "upcoming"
    if ((dueMileage - odo) <= Number(threshold || 500)) {
        return { key: 'upcoming', label: 'Coming up', className: 'bg-amber-100 text-amber-700', dotClass: 'bg-amber-500' };
    }

    return { key: 'scheduled', label: 'Scheduled', className: 'bg-gray-100 text-gray-600', dotClass: 'bg-gray-400' };
}

// Read reminder threshold for a motorcycle. Priority: per-motorcycle localStorage -> global localStorage -> default 500km
// Read reminder threshold for a motorcycle. Priority: per-motorcycle localStorage -> global localStorage -> default 500km
function getReminderThreshold(motorcycleId) {
    try {
        if (motorcycleId) {
            const perKey = `motocare.reminderThreshold.${motorcycleId}`;
            const perVal = localStorage.getItem(perKey);
            if (perVal !== null && perVal !== undefined && perVal !== '') return Number(perVal);
        }

        const globalVal = localStorage.getItem('motocare.reminderThreshold.default');
        if (globalVal !== null && globalVal !== undefined && globalVal !== '') return Number(globalVal);
    } catch (e) {
        // ignore storage errors
    }
    return 500;
}

function getNextMileageTarget(currentMileage, interval) {
    const mileage = Number(currentMileage || 0);
    const step = Number(interval || 0);

    if (!step || step <= 0) return Number.MAX_SAFE_INTEGER;
    if (!Number.isFinite(mileage) || mileage < 0) return step;

    // If mileage is exactly on an interval boundary, the next due should be the next interval
    // e.g., mileage=10000 and step=1000 => next due = 11000 (not 10000)
    try {
        const remainder = mileage % step;
        if (remainder === 0) return mileage + step;
    } catch (e) {}

    return Math.ceil(mileage / step) * step || step;
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

function getNextMileageAfterCompletion(completedMileage, interval) {
    const mileage = Number(completedMileage || 0);
    const step = Number(interval || 0);

    if (!step || step <= 0) return Number.MAX_SAFE_INTEGER;
    if (!Number.isFinite(mileage) || mileage < 0) return step;

    return mileage + step;
}

function getCompletionMileage(item = {}) {
    const value = item.completedMileage ?? item.mileage ?? item.dueMileage ?? 0;
    const normalized = typeof value === 'string' ? value.replace(/[^0-9.-]/g, '') : value;
    const numeric = Number(normalized);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

function getCompletionTimestamp(item = {}) {
    const raw = item.completedAt ?? item.date ?? item.createdAt ?? item.updatedAt ?? null;
    if (raw && typeof raw.toDate === 'function') {
        const dateValue = raw.toDate();
        return dateValue instanceof Date && !Number.isNaN(dateValue.getTime()) ? dateValue.getTime() : 0;
    }
    const parsed = raw instanceof Date ? raw : new Date(raw);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function isCompletionRecord(item = {}) {
    const status = String(item.status || '').toLowerCase().trim();
    const hasCompletionStatus = status === 'completed' || status === 'complete' || status === 'done' || status === 'logged';
    const hasCompletionMileage = getCompletionMileage(item) > 0;
    const hasCompletionTimestamp = getCompletionTimestamp(item) > 0;
    return item.deleted !== true && (hasCompletionStatus || hasCompletionMileage || hasCompletionTimestamp);
}

function findCompletedMaintenanceRecord(maintenanceItems, motorcycleId, rule) {
    const ruleName = normalizeText(rule.task);

    const matches = maintenanceItems.filter((item) => {
        if (String(item.motorcycleId || '') !== String(motorcycleId)) {
            return false;
        }

        const itemTaskKey = String(item.taskKey || '').trim();
        const matchesTaskKey = itemTaskKey === rule.key;

        if (matchesTaskKey) {
            return isCompletionRecord(item);
        }

        if (itemTaskKey) {
            return false;
        }

        const itemName = normalizeText(item.task || item.title || item.name || '');
        const matchesTaskName = itemName && (itemName === ruleName || itemName.includes(ruleName) || ruleName.includes(itemName));
        return matchesTaskName && isCompletionRecord(item);
    });

    if (!matches.length) {
        return null;
    }

    return matches.sort((a, b) => {
        const timeDiff = getCompletionTimestamp(b) - getCompletionTimestamp(a);
        if (timeDiff !== 0) return timeDiff;

        const mileageDiff = getCompletionMileage(b) - getCompletionMileage(a);
        if (mileageDiff !== 0) return mileageDiff;

        return String(b.id || '').localeCompare(String(a.id || ''));
    })[0] || null;
}

function buildScheduleForMotorcycle(motorcycle, maintenanceItems) {
    const category = classifyMotorcycleCategory(motorcycle);
    const odo = getMileageValue(motorcycle);
    const motorcycleLabel = getMotorcycleLabel(motorcycle);
    const overall = getCategoryIndicator(category.key, odo);

    return MAINTENANCE_RULES[category.key].map((rule) => {
        const completedRecord = findCompletedMaintenanceRecord(maintenanceItems, motorcycle.id, rule);
        const hasCompletion = !!completedRecord;
        const anchorMileage = completedRecord
            ? getCompletionMileage(completedRecord)
            : odo;
        const anchorSource = completedRecord ? 'last completed service' : 'current odometer';
        const dueMileage = hasCompletion
            ? getNextMileageAfterCompletion(anchorMileage, rule.interval)
            : getNextMileageTarget(anchorMileage, rule.interval);
        const threshold = getReminderThreshold(motorcycle.id);
        const status = getTaskStatus(odo, dueMileage, hasCompletion, threshold);
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
    const selectedLabel = document.getElementById('selectedMotorcycleLabel');
    if (!list) return;

    const selectedMotorcycle = getSelectedMotorcycle();
    if (selectedLabel) {
        selectedLabel.textContent = selectedMotorcycle ? selectedMotorcycle.motorcycleName : 'Select a motorcycle';
    }

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

function isAutoSendEnabled() {
    try {
        const el = document.getElementById('autoSendToggle');
        if (el) return Boolean(el.checked);
        const stored = localStorage.getItem('motocare.autoSendEnabled');
        if (stored !== null) return stored === 'true';
    } catch (e) {
        // ignore
    }
    return true; // default to enabled for demo convenience
}

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

    let maintenanceItems = [];

    motorcyclesUnsub = onSnapshot(motorcyclesQuery, (snap) => {
        motorcycles = [];
        snap.forEach((doc) => {
            const data = normalizeRecord({ id: doc.id, ...doc.data() });
            if (data.deleted !== true) motorcycles.push(data);
        });

        if (!motorcycles.length) {
            scheduleItems = [];
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
            .flatMap((motorcycle) => buildScheduleForMotorcycle(motorcycle, maintenanceItems))
            .sort((a, b) => {
                const priority = { overdue: 0, due: 1, upcoming: 2, scheduled: 3, completed: 4 };
                const statusDiff = priority[a.status.key] - priority[b.status.key];
                if (statusDiff !== 0) return statusDiff;
                if (a.dueMileage !== b.dueMileage) return a.dueMileage - b.dueMileage;
                return a.currentOdo - b.currentOdo;
            });

        renderMotorcycleDrawer();
        displaySchedule(getSelectedScheduleItems());
        updateCounts(getSelectedScheduleItems());
        // create pending reminders from current schedule
        (async () => {
            try { await createPendingReminders(scheduleItems); } catch (err) { console.error('Error creating pending reminders:', err); }
        })();
    }, (err) => {
        console.error('Motorcycles listener error:', err);
    });

    maintenanceUnsub = onSnapshot(maintenanceQuery, (snap) => {
        maintenanceItems = [];
        snap.forEach((doc) => {
            const data = normalizeRecord({ id: doc.id, ...doc.data() });
            if (data.deleted !== true) maintenanceItems.push(data);
        });

        // Recompute schedule when maintenance changes
        if (motorcycles && motorcycles.length) {
            scheduleItems = motorcycles
                .flatMap((motorcycle) => buildScheduleForMotorcycle(motorcycle, maintenanceItems))
                .sort((a, b) => {
                    const priority = { overdue: 0, due: 1, upcoming: 2, scheduled: 3, completed: 4 };
                    const statusDiff = priority[a.status.key] - priority[b.status.key];
                    if (statusDiff !== 0) return statusDiff;
                    if (a.dueMileage !== b.dueMileage) return a.dueMileage - b.dueMileage;
                    return a.currentOdo - b.currentOdo;
                });

            renderMotorcycleDrawer();
            displaySchedule(getSelectedScheduleItems());
            updateCounts(getSelectedScheduleItems());
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

function displaySchedule(items) {
    const container = document.getElementById('scheduleList');
    if (!container) return;

    if (!items.length) {
        const selectedMotorcycle = getSelectedMotorcycle();
        if (selectedMotorcycle) {
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
        <div class="mb-4 flex items-center justify-between gap-3">
            <div class="text-sm text-gray-700">Reminder threshold</div>
            <div class="flex items-center gap-2">
                <label for="reminderThresholdInput" class="sr-only">Threshold in kilometers</label>
                <div class="flex items-center gap-2 bg-gray-50 border rounded-lg px-2 py-1">
                    <input id="reminderThresholdInput" type="number" min="0" step="50" class="w-24 bg-transparent outline-none text-sm" value="${Number(currentThreshold)}" aria-label="Reminder threshold in kilometers">
                    <span class="text-sm text-gray-600">km</span>
                </div>
                <button id="reminderThresholdSave" class="ml-2 px-3 py-1 rounded-lg bg-green-700 text-white text-sm">Apply</button>
                <button id="reminderThresholdReset" class="ml-2 px-3 py-1 rounded-lg bg-white border text-sm">Reset</button>
            </div>
        </div>

        <section class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div class="flex items-start justify-between gap-3 mb-4">
                <div>
                    <div class="flex items-center gap-2 flex-wrap mb-1">
                        <h3 class="text-gray-900 font-semibold text-lg leading-tight">${escapeHtml(motorcycleName)}</h3>
                        ${motorcycleCategory ? `<span class="text-xs px-2 py-1 rounded-full font-medium ${motorcycleCategory.badge}">${escapeHtml(motorcycleCategory.label)}</span>` : ''}
                    </div>
                </div>
                <div class="text-xs text-gray-500 text-right">
                    <p class="font-medium text-gray-700">${items.length} reminder${items.length === 1 ? '' : 's'}</p>
                </div>
            </div>

            <div class="grid grid-cols-3 gap-3 mb-4 text-xs">
                <div class="bg-gray-50 rounded-2xl p-3 border border-gray-100">
                    <p class="text-gray-500 mb-1">Urgent</p>
                    <p class="font-semibold text-gray-900 text-sm">${items.filter((item) => item.status.key === 'due' || item.status.key === 'overdue').length}</p>
                </div>
                <div class="bg-gray-50 rounded-2xl p-3 border border-gray-100">
                    <p class="text-gray-500 mb-1">Coming up</p>
                    <p class="font-semibold text-gray-900 text-sm">${items.filter((item) => item.status.key === 'upcoming' || item.status.key === 'scheduled').length}</p>
                </div>
                <div class="bg-gray-50 rounded-2xl p-3 border border-gray-100">
                    <p class="text-gray-500 mb-1">Logged</p>
                    <p class="font-semibold text-gray-900 text-sm">${items.filter((item) => item.status.key === 'completed' || item.lastCompletedMileage !== null).length}</p>
                </div>
            </div>

            <div class="relative pl-8 pr-1 space-y-4">
                <div class="absolute left-6 top-2 bottom-2 w-0.5 bg-gray-200"></div>
                ${items.map((item) => `
                    <div class="relative pl-12">
                        <div class="absolute left-[11px] top-5 w-3 h-3 rounded-full ${item.status.dotClass} border-4 border-white z-10 shadow-sm"></div>

                        <div class="bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow border border-gray-100">
                            <div class="flex items-start justify-between gap-3 mb-3">
                                <div class="flex-1 min-w-0">
                                    <p class="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-1">${escapeHtml(item.status.label)}</p>
                                    <h4 class="text-gray-900 font-semibold leading-snug ${item.completed ? 'line-through text-gray-400' : ''}">${escapeHtml(item.task)}</h4>
                                </div>
                                <div class="w-10 h-10 rounded-xl ${item.overall.className} flex items-center justify-center shrink-0">
                                    <i class="lucide lucide-${item.overall.icon} text-base"></i>
                                </div>
                            </div>

                            <div class="flex flex-wrap gap-2 mb-3">
                                <span class="text-xs px-2.5 py-1 rounded-full ${item.status.className}">${escapeHtml(item.status.label)}</span>
                                <span class="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">Target ${item.dueMileage.toLocaleString()} km</span>
                            </div>

                            <div class="flex items-start gap-2 text-sm text-gray-600 mb-3">
                                <i class="lucide lucide-${item.icon} text-gray-400 mt-0.5"></i>
                                <span class="leading-relaxed">${escapeHtml(item.reminder)}</span>
                            </div>

                            <div class="grid grid-cols-2 gap-2 mb-3 text-xs">
                                <div class="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2">
                                    <p class="text-gray-400 mb-1">Current ODO</p>
                                    <p class="font-semibold text-gray-900">${item.currentOdo.toLocaleString()} km</p>
                                </div>
                                <div class="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2">
                                    <p class="text-gray-400 mb-1">Last service</p>
                                    <p class="font-semibold text-gray-900">${item.lastCompletedMileage !== null ? `${item.lastCompletedMileage.toLocaleString()} km` : 'None yet'}</p>
                                </div>
                            </div>

                            <div class="mb-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                                ${escapeHtml(buildComputationNote(item))}
                            </div>

                            <div>
                                <button onclick="markComplete('${item.id}'); return false;" class="w-full py-2.5 bg-green-700 text-white rounded-xl text-sm font-medium hover:bg-green-800 transition-colors active:scale-95">
                                    Mark as Complete
                                </button>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </section>
    `;

    // Hook auto-send toggle persistence
    try {
        const autoToggle = document.getElementById('autoSendToggle');
        if (autoToggle) {
            const stored = localStorage.getItem('motocare.autoSendEnabled');
            if (stored !== null) {
                autoToggle.checked = stored === 'true';
            }
            autoToggle.addEventListener('change', () => {
                try { localStorage.setItem('motocare.autoSendEnabled', String(autoToggle.checked)); } catch (e) { /* ignore */ }
            });
        }
    } catch (e) {
        // ignore
    }

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
                alert('Please enter a valid threshold (0 or greater).');
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
                showToast('Reminder threshold saved.', 'success');
                // reload schedule so statuses recompute
                setTimeout(() => loadSchedule(currentUserId), 250);
            } catch (e) {
                console.warn('Could not save threshold', e);
                showToast('Could not save threshold.', 'error');
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
                showToast('Threshold reset to ' + String(newVal) + ' km', 'info');
                loadSchedule(currentUserId);
            } catch (e) {
                console.warn('Could not reset threshold', e);
                showToast('Could not reset threshold.', 'error');
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

    if (dueEl) dueEl.textContent = String(due);
    if (upcomingEl) upcomingEl.textContent = String(upcoming);
    if (completedEl) completedEl.textContent = String(completed);
}

window.markComplete = async function(id) {
    if (!currentUserId) {
        console.error('No user ID available');
        return;
    }

    const item = scheduleItems.find((entry) => entry.id === id);
    if (!item) {
        alert('Could not find the selected maintenance reminder.');
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

        window.location.href = `add-record.html?${params.toString()}`;
    } catch (error) {
        console.error('Error redirecting to add-record:', error);
        alert('Could not open Add Record form. Please try again.');
    }
};

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
            try { showToast('No authenticated email found — reminders will not be sent.', 'error'); } catch (e) {}
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

        // Group pending items by recipient email so we can create one email per recipient
        const createdDocs = [];
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
                const newDoc = await addFirestoreDoc('emailReminders', payload);
                createdDocs.push({ docId: newDoc.id, item, signature });
                createdSignatures.add(signature);
                existingSignatures.add(signature);
                console.log('Created reminder doc', newDoc.id, 'for', item.task, item.motorcycleName, 'signature:', signature);
                try { showToast(`Created reminder: ${item.task} (${item.motorcycleName})`, 'info'); } catch (e) {}
            } catch (err) {
                console.warn('Could not create reminder doc for', item.id, err?.message || err);
            }
        }

        if (!createdDocs.length) {
            console.log('createPendingReminders: no new reminder docs created');
            try { showToast('No new reminders to create.', 'info'); } catch (e) {}
        }

        // If auto-send enabled, send one email per created reminder (simple, allows duplicates)
        if (isAutoSendEnabled() && createdDocs.length) {
            try {
                const mod = await import('./emailjs.js');
                const sendReminder = mod.sendMaintenanceReminder || mod.default?.sendMaintenanceReminder;
                if (!sendReminder) throw new Error('sendMaintenanceReminder not available');

                for (const d of createdDocs) {
                    const item = d.item;
                    try {
                        // Re-fetch the reminder doc to ensure it wasn't already sent by another process
                        let latest = null;
                        try {
                            latest = await getFirestoreDocById('emailReminders', d.docId);
                        } catch (e) {
                            console.warn('Could not re-fetch reminder doc', d.docId, e?.message || e);
                        }

                        if (latest && latest.sent === true) {
                            console.log('Reminder already sent, skipping', d.docId);
                            try { showToast('Reminder already sent, skipping.', 'info'); } catch (e) {}
                            continue;
                        }

                        try { showToast(`Sending reminder for ${item.task}...`, 'info'); } catch (e) {}
                        await sendReminder({
                            toEmail: currentUserEmail,
                            motorcycleName: item.motorcycleName,
                            task: item.task,
                            reminder: item.reminder,
                            dueMileage: item.dueMileage,
                            currentOdo: item.currentOdo,
                            categoryLabel: item.categoryLabel
                        });
                        try { showToast('Reminder sent.', 'success'); } catch (e) {}
                        await updateFirestoreDoc('emailReminders', d.docId, {
                            sent: true,
                            sentAt: new Date().toISOString(),
                            lastError: null,
                            source: 'emailjs-client-per-item'
                        });
                    } catch (sendErr) {
                        console.warn('Per-item reminder send failed for', d.docId, sendErr?.message || sendErr);
                        try { showToast('Reminder send failed: ' + (sendErr?.message || ''), 'error'); } catch (e) {}
                        try {
                            await updateFirestoreDoc('emailReminders', d.docId, {
                                lastError: String(sendErr?.message || sendErr),
                                lastAttempt: new Date().toISOString()
                            });
                        } catch (uErr) {
                            console.warn('Could not update reminder with send error for', d.docId, uErr?.message || uErr);
                        }
                    }
                }
            } catch (err) {
                console.warn('Auto-send per-item flow failed', err?.message || err);
                try { showToast('Auto-send configuration error: ' + (err?.message || ''), 'error'); } catch (e) {}
            }
        }
    } catch (err) {
        console.error('createPendingReminders error:', err);
    }
}

// Manual trigger for debugging/send tests from Console or UI
window.triggerReminderSend = async function() {
    try {
        if (!window.scheduleItems) { try { showToast('No schedule items available', 'error'); } catch (e) {} ; return; }
        await createPendingReminders(window.scheduleItems);
    } catch (e) {
        console.error('triggerReminderSend error', e);
        try { showToast('Trigger failed: ' + (e?.message || ''), 'error'); } catch (e) {}
    }
};