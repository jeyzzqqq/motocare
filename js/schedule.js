import { auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { addFirestoreDoc, getFirestoreDocs, updateFirestoreDoc } from './firebaseUtils.js';
import { normalizeRecord } from './utils-module.js';
import { MAINTENANCE_RULES, classifyMotorcycleCategory } from './maintenanceOptions.js';
import { initEmailJS, sendMaintenanceReminder } from './emailjs.js';

let currentUserId = null;
let currentUserEmail = '';
let scheduleItems = [];
let motorcycles = [];
let selectedMotorcycleId = '';

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
    await loadSchedule(user.uid);
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
    if (hasCompletion && odo < dueMileage) {
        return { key: 'completed', label: 'Logged', className: 'bg-emerald-100 text-emerald-700', dotClass: 'bg-emerald-600' };
    }

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

    return { key: 'scheduled', label: 'Coming up', className: 'bg-gray-100 text-gray-600', dotClass: 'bg-gray-400' };
}

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

    return Math.ceil(mileage / step) * step || step;
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
    try {
        const [motorcyclesRaw, maintenanceRaw] = await Promise.all([
            getFirestoreDocs('motorcycles', 'createdAt'),
            getFirestoreDocs('maintenance', 'createdAt')
        ]);

        motorcycles = motorcyclesRaw
            .map((item) => normalizeRecord(item))
            .filter((item) => item.uid === userId && item.deleted !== true);

        const maintenanceItems = maintenanceRaw
            .map((item) => normalizeRecord(item))
            .filter((item) => item.uid === userId && item.deleted !== true);

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
        // Create email reminder documents for due/overdue items if missing
        (async () => {
            try {
                await createPendingReminders(scheduleItems);
            } catch (err) {
                console.error('Error creating pending reminders:', err);
            }
        })();
    } catch (error) {
        console.error('Error loading schedule:', error);
        scheduleItems = [];
        renderEmptySchedule('Unable to load maintenance reminders. Please try again.');
    }
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

                            <div class="grid grid-cols-2 gap-2">
                                <button onclick="sendReminderEmail(event, '${item.id}'); return false;" class="w-full py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors active:scale-95">
                                    Send Email
                                </button>
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

    const mileageInput = prompt('Enter current ODO reading for this completed service:', String(item.currentOdo || 0));
    if (mileageInput === null) {
        return;
    }

    const completedMileage = Number(mileageInput);
    if (!Number.isFinite(completedMileage) || completedMileage < 0) {
        alert('Please enter a valid ODO value.');
        return;
    }

    if (completedMileage < Number(item.currentOdo || 0)) {
        alert(`Completed ODO cannot be lower than the current recorded ODO (${Number(item.currentOdo || 0).toLocaleString()} km).`);
        return;
    }

    try {
        const payload = {
            motorcycleId: item.motorcycleId,
            motorcycleName: item.motorcycleName,
            category: item.categoryLabel,
            taskKey: item.ruleKey,
            task: item.task,
            dueMileage: item.dueMileage,
            completedMileage,
            status: 'completed',
            completedAt: new Date().toISOString(),
            source: 'schedule-mark-complete'
        };

        // Write completion record so next-due calculations use this anchor
        await addFirestoreDoc('maintenance', payload);

        // Keep motorcycle ODO in sync with completion logs for accurate next-due calculations.
        await updateFirestoreDoc('motorcycles', item.motorcycleId, {
            mileage: completedMileage
        });

        // Reload schedule to recompute reminders and next due
        await loadSchedule(currentUserId);

        // Show small confirmation card in-page
        showScheduleConfirmation(item, completedMileage);
    } catch (error) {
        console.error('Error marking maintenance complete:', error);
        alert('Could not update the reminder. Please try again.');
    }
};

window.sendReminderEmail = async function(clickEvent, id) {
    if (!currentUserEmail) {
        alert('No authenticated email found. Please sign in again.');
        return;
    }

    const item = scheduleItems.find((entry) => entry.id === id);
    if (!item) {
        alert('Could not find the selected reminder.');
        return;
    }

    const button = clickEvent?.target?.closest('button');
    const originalText = button ? button.textContent : '';

    try {
        if (button) {
            button.disabled = true;
            button.textContent = 'Sending...';
        }

        await sendMaintenanceReminder({
            toEmail: currentUserEmail,
            motorcycleName: item.motorcycleName,
            task: item.task,
            reminder: item.reminder,
            dueMileage: item.dueMileage,
            currentOdo: item.currentOdo,
            categoryLabel: item.categoryLabel,
        });

        showToast('Reminder email sent to your sign-in email.', 'success');
    } catch (error) {
        console.error('Error sending reminder email:', error);
        alert(error?.message || 'Could not send the reminder email.');
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = originalText || 'Send Email';
        }
    }
};

function showScheduleConfirmation(item, completedMileage) {
    const existing = document.getElementById('scheduleConfirmationCard');
    if (existing) existing.remove();

    const card = document.createElement('div');
    card.id = 'scheduleConfirmationCard';
    card.className = 'fixed right-6 bottom-6 max-w-sm w-full bg-white rounded-xl border shadow-lg z-50 overflow-hidden';
    card.innerHTML = `
        <div class="p-4">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <p class="text-sm text-gray-500">Reminder logged</p>
                    <p class="font-semibold text-gray-900">${escapeHtml(item.task || 'Service')}</p>
                    <p class="text-xs text-gray-500 mt-1">${escapeHtml(item.motorcycleName || '')} • ${Number(completedMileage || 0).toLocaleString()} km</p>
                </div>
                <div class="text-sm text-gray-500 text-right">
                    <p class="font-medium text-gray-700">${new Date().toLocaleDateString()}</p>
                </div>
            </div>
            <div class="mt-3 text-xs text-gray-600">
                <p>Next due will be recalculated and will appear in Coming Up when within 500 km.</p>
            </div>
        </div>
        <div class="p-3 bg-gray-50 flex items-center gap-2 justify-end">
            <button id="scheduleConfirmationClose" class="px-3 py-1 rounded-lg text-sm bg-white border">Close</button>
        </div>
    `;

    document.body.appendChild(card);
    document.getElementById('scheduleConfirmationClose')?.addEventListener('click', () => card.remove());

    setTimeout(() => { const el = document.getElementById('scheduleConfirmationCard'); if (el) el.remove(); }, 6000);
}

/**
 * Create pending email reminders for items that are due or overdue.
 * Avoid creating duplicates by checking existing user reminders.
 */
async function createPendingReminders(items = []) {
    try {
        if (!items || !items.length) return;
        // Only proceed when we have the authenticated user's email available
        if (!currentUserEmail) return;

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

        for (const item of pending) {
            const already = existing.find((r) => {
                return String(r.motorcycleId || '') === String(item.motorcycleId || '')
                    && String(r.taskKey || '') === String(item.ruleKey || '')
                    && r.sent !== true;
            });

            if (already) continue;

            const payload = {
                motorcycleId: item.motorcycleId,
                motorcycleName: item.motorcycleName,
                task: item.task,
                taskKey: item.ruleKey,
                reminderText: item.reminder,
                sendAt: new Date().toISOString(),
                sent: false,
                email: currentUserEmail
            };

            try {
                const newDoc = await addFirestoreDoc('emailReminders', payload);
                console.log('Created reminder for', item.task, item.motorcycleName);

                // Demo convenience: attempt to send immediately from client using EmailJS
                // Only run when the user has enabled auto-send in the UI (demo mode only).
                if (isAutoSendEnabled()) {
                    // This is intended for demo mode only (no Blaze). For production use server-side sending.
                    (async () => {
                    try {
                        await sendMaintenanceReminder({
                            toEmail: currentUserEmail,
                            motorcycleName: item.motorcycleName,
                            task: item.task,
                            reminder: item.reminder,
                            dueMileage: item.dueMileage,
                            currentOdo: item.currentOdo,
                            categoryLabel: item.categoryLabel,
                        });

                        // mark as sent in Firestore for demo convenience
                        try {
                            await updateFirestoreDoc('emailReminders', newDoc.id, {
                                sent: true,
                                sentAt: new Date().toISOString(),
                                lastError: null,
                                source: 'emailjs-client'
                            });
                        } catch (uErr) {
                            console.warn('Could not update reminder sent status:', uErr?.message || uErr);
                        }
                    } catch (sendErr) {
                        console.warn('Demo email send failed for', newDoc.id, sendErr?.message || sendErr);
                        try {
                            await updateFirestoreDoc('emailReminders', newDoc.id, {
                                lastError: String(sendErr?.message || sendErr),
                                lastAttempt: new Date().toISOString()
                            });
                        } catch (uErr) {
                            console.warn('Could not update reminder with send error:', uErr?.message || uErr);
                        }
                    }
                    })();
                }

            } catch (err) {
                console.warn('Could not create reminder doc for', item.id, err?.message || err);
            }
        }
    } catch (err) {
        console.error('createPendingReminders error:', err);
    }
}