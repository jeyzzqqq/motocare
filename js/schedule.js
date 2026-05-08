import { auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { addFirestoreDoc, getFirestoreDocs, updateFirestoreDoc } from './firebaseUtils.js';
import { normalizeRecord } from './utils-module.js';
import { MAINTENANCE_RULES, classifyMotorcycleCategory } from './maintenanceOptions.js';

let currentUserId = null;
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

function getTaskStatus(odo, dueMileage, hasCompletion) {
    if (hasCompletion && odo < dueMileage) {
        return { key: 'completed', label: 'Logged', className: 'bg-emerald-100 text-emerald-700', dotClass: 'bg-emerald-600' };
    }

    if (odo > dueMileage) {
        return { key: 'overdue', label: 'Due / overdue', className: 'bg-red-100 text-red-700', dotClass: 'bg-red-500' };
    }

    if (odo === dueMileage) {
        return { key: 'due', label: 'Due / overdue', className: 'bg-red-100 text-red-700', dotClass: 'bg-red-500' };
    }

    if ((dueMileage - odo) <= 500) {
        return { key: 'upcoming', label: 'Coming up', className: 'bg-amber-100 text-amber-700', dotClass: 'bg-amber-500' };
    }

    return { key: 'scheduled', label: 'Coming up', className: 'bg-gray-100 text-gray-600', dotClass: 'bg-gray-400' };
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
        const status = getTaskStatus(odo, dueMileage, hasCompletion);
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

    container.innerHTML = `
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

                            <button onclick="markComplete('${item.id}'); return false;" class="w-full py-2.5 bg-green-700 text-white rounded-xl text-sm font-medium hover:bg-green-800 transition-colors active:scale-95">
                                Mark as Complete
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </section>
    `;
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

        await addFirestoreDoc('maintenance', payload);

        // Keep motorcycle ODO in sync with completion logs for accurate next-due calculations.
        await updateFirestoreDoc('motorcycles', item.motorcycleId, {
            mileage: completedMileage
        });

        alert(`"${item.task}" marked as complete!`);
        await loadSchedule(currentUserId);
    } catch (error) {
        console.error('Error marking maintenance complete:', error);
        alert('Could not update the reminder. Please try again.');
    }
};