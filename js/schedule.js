import { auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { addFirestoreDoc, getFirestoreDocs } from './firebaseUtils.js';
import { normalizeRecord } from './utils-module.js';

const SCOOTER_PATTERNS = ['nmax', 'aerox', 'mio', 'fazzio', 'sight', 'click', 'beat', 'pcx', 'adv', 'airblade', 'giorno', 'burgman', 'skydrive'];
const UNDERBONE_PATTERNS = ['winner x', 'rs125', 'tmx', 'sniper', 'raider', 'smash', 'gixxer', 'gsx', 'fury', 'barako', 'shooter', 'ct100', 'rouser'];
const SPORT_PATTERNS = ['r15', 'mt ', 'mt-', 'cbr150r', 'cb150x', 'ninja 400', 'ninja 650', 'zx-25r', 'zx-4rr', 'dominar', 'xsr 155'];

const MAINTENANCE_RULES = {
    scooter: [
        { key: 'oil-1000', interval: 1000, task: 'Oil Change', icon: 'droplets' },
        { key: 'basic-3000', interval: 3000, task: 'Basic Service', icon: 'wrench' },
        { key: 'cvt-5000', interval: 5000, task: 'CVT + Air Filter + Spark Plug', icon: 'settings-2' },
        { key: 'brake-8000', interval: 8000, task: 'Brake + Belt Inspection', icon: 'shield-check' },
        { key: 'major-10000', interval: 10000, task: 'Major Service', icon: 'alert-triangle' },
        { key: 'injector-15000', interval: 15000, task: 'Injector + Throttle Body Cleaning', icon: 'sparkles' },
        { key: 'inspection-20000', interval: 20000, task: 'Full Inspection', icon: 'clipboard-check' }
    ],
    underbone: [
        { key: 'oil-chain-1000', interval: 1000, task: 'Oil Change + Chain Check', icon: 'droplets' },
        { key: 'chain-lube-3000', interval: 3000, task: 'Chain Cleaning + Lube', icon: 'link' },
        { key: 'air-spark-5000', interval: 5000, task: 'Air Filter + Spark Plug', icon: 'sparkles' },
        { key: 'brake-sprocket-8000', interval: 8000, task: 'Brake + Sprocket Check', icon: 'shield-check' },
        { key: 'valve-10000', interval: 10000, task: 'Valve Clearance Check', icon: 'settings-2' },
        { key: 'tuneup-15000', interval: 15000, task: 'Full Tune-up', icon: 'wrench' }
    ],
    sport: [
        { key: 'oil-1000', interval: 1000, task: 'Oil Change (Break-in Critical)', icon: 'droplets' },
        { key: 'oil-chain-brake-3000', interval: 3000, task: 'Oil + Chain + Brake Check', icon: 'shield-check' },
        { key: 'air-spark-5000', interval: 5000, task: 'Air Filter + Spark Plug', icon: 'sparkles' },
        { key: 'brakefluid-chain-8000', interval: 8000, task: 'Brake Fluid + Chain Service', icon: 'droplets' },
        { key: 'coolant-valve-10000', interval: 10000, task: 'Coolant + Valve Clearance', icon: 'thermometer' },
        { key: 'injector-15000', interval: 15000, task: 'Injector + Throttle Body Cleaning', icon: 'sparkles' },
        { key: 'overhaul-20000', interval: 20000, task: 'Full System Overhaul Check', icon: 'alert-circle' }
    ]
};

const CATEGORY_META = {
    scooter: {
        label: 'SCOOTER (CVT)',
        badge: 'bg-green-100 text-green-700',
        chip: 'bg-green-700 text-white',
        accent: 'green'
    },
    underbone: {
        label: 'UNDERBONE / MANUAL (CHAIN TYPE)',
        badge: 'bg-blue-100 text-blue-700',
        chip: 'bg-blue-700 text-white',
        accent: 'blue'
    },
    sport: {
        label: 'BIG CC / SPORT',
        badge: 'bg-red-100 text-red-700',
        chip: 'bg-red-700 text-white',
        accent: 'red'
    }
};

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

function includesAny(text, patterns) {
    return patterns.some((pattern) => text.includes(normalizeText(pattern)));
}

function getMotorcycleLabel(motorcycle) {
    return motorcycle.motorcycleName || [motorcycle.brand, motorcycle.model].filter(Boolean).join(' ') || 'Motorcycle';
}

function getMileageValue(motorcycle) {
    const raw = motorcycle.mileage ?? motorcycle.odo ?? motorcycle.currentOdo ?? motorcycle.odometer ?? 0;
    const numeric = Number(raw);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function classifyMotorcycle(motorcycle) {
    const text = normalizeText([motorcycle.brand, motorcycle.model, motorcycle.motorcycleName].filter(Boolean).join(' '));

    if (includesAny(text, SPORT_PATTERNS)) {
        return { key: 'sport', ...CATEGORY_META.sport };
    }

    if (includesAny(text, SCOOTER_PATTERNS)) {
        return { key: 'scooter', ...CATEGORY_META.scooter };
    }

    return { key: 'underbone', ...CATEGORY_META.underbone };
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
        return { key: 'completed', label: 'Completed', className: 'bg-green-100 text-green-700', dotClass: 'bg-green-700' };
    }

    if (odo >= dueMileage) {
        return { key: 'due', label: 'Due Now', className: 'bg-red-100 text-red-700', dotClass: 'bg-red-500' };
    }

    if ((dueMileage - odo) <= 500) {
        return { key: 'upcoming', label: 'Due Soon', className: 'bg-yellow-100 text-yellow-700', dotClass: 'bg-yellow-500' };
    }

    return { key: 'scheduled', label: 'Scheduled', className: 'bg-gray-100 text-gray-600', dotClass: 'bg-gray-400' };
}

function getNextMileageTarget(currentMileage, interval) {
    const mileage = Number(currentMileage || 0);
    const step = Number(interval || 0);

    if (!step || step <= 0) return Number.MAX_SAFE_INTEGER;
    if (!Number.isFinite(mileage) || mileage < 0) return step;

    return mileage + step;
}

function findCompletedMaintenanceRecord(maintenanceItems, motorcycleId, rule) {
    const ruleName = normalizeText(rule.task);

    const matches = maintenanceItems.filter((item) => {
        if (String(item.motorcycleId || '') !== String(motorcycleId)) {
            return false;
        }

        const itemName = normalizeText(item.task || item.title || item.name || '');
        const matchesTaskKey = String(item.taskKey || '') === rule.key;
        const matchesTaskName = itemName && (itemName === ruleName || itemName.includes(ruleName) || ruleName.includes(itemName));

        return item.deleted !== true && item.status === 'completed' && (matchesTaskKey || matchesTaskName);
    });

    if (!matches.length) {
        return null;
    }

    return matches.sort((a, b) => {
        const aMileage = Number(a.completedMileage ?? a.dueMileage ?? a.mileage ?? 0);
        const bMileage = Number(b.completedMileage ?? b.dueMileage ?? b.mileage ?? 0);
        return bMileage - aMileage;
    })[0] || null;
}

function buildScheduleForMotorcycle(motorcycle, maintenanceItems) {
    const category = classifyMotorcycle(motorcycle);
    const odo = getMileageValue(motorcycle);
    const motorcycleLabel = getMotorcycleLabel(motorcycle);
    const overall = getCategoryIndicator(category.key, odo);

    return MAINTENANCE_RULES[category.key].map((rule) => {
        const completedRecord = findCompletedMaintenanceRecord(maintenanceItems, motorcycle.id, rule);
        const hasCompletion = !!completedRecord;
        const anchorMileage = completedRecord
            ? Number(completedRecord.completedMileage ?? completedRecord.dueMileage ?? completedRecord.mileage ?? 0)
            : 0;
        const dueMileage = getNextMileageTarget(anchorMileage, rule.interval);
        const status = getTaskStatus(odo, dueMileage, hasCompletion);
        const remaining = Math.max(0, dueMileage - odo);
        const reminder = status.key === 'completed'
            ? 'Completed and logged'
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
            lastCompletedMileage: completedRecord ? Number(completedRecord.completedMileage ?? completedRecord.dueMileage ?? completedRecord.mileage ?? 0) : 0
        };
    });
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
                const priority = { due: 0, upcoming: 1, scheduled: 2, completed: 3 };
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
        container.innerHTML = `<div class="text-gray-500 text-sm py-3">${escapeHtml(message)}</div>`;
    }

    const dueEl = document.getElementById('dueCount');
    const upcomingEl = document.getElementById('upcomingCount');
    const completedEl = document.getElementById('completedCount');
    if (dueEl) dueEl.textContent = '0';
    if (upcomingEl) upcomingEl.textContent = '0';
    if (completedEl) completedEl.textContent = '0';
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
    const motorcycleCategory = selectedMotorcycle ? classifyMotorcycle(selectedMotorcycle) : null;

    container.innerHTML = `
        <section class="bg-white rounded-2xl border border-gray-100 shadow-md p-4">
            <div class="flex items-start justify-between gap-3 mb-4">
                <div>
                    <div class="flex items-center gap-2 flex-wrap mb-1">
                        <h3 class="text-gray-800 font-semibold text-lg">${escapeHtml(motorcycleName)}</h3>
                        ${motorcycleCategory ? `<span class="text-xs px-2 py-1 rounded-full font-medium ${motorcycleCategory.badge}">${escapeHtml(motorcycleCategory.label)}</span>` : ''}
                    </div>
                    <p class="text-xs text-gray-500">Current ODO ${selectedMotorcycle ? getMileageValue(selectedMotorcycle).toLocaleString() : '0'} km</p>
                </div>
                <div class="text-xs text-gray-500 text-right">
                    <p>${items.length} reminder${items.length === 1 ? '' : 's'}</p>
                </div>
            </div>

            <div class="relative pl-1 space-y-4">
                <div class="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>
                ${items.map((item) => `
                    <div class="relative pl-10">
                        <div class="absolute left-2.5 top-5 w-3 h-3 rounded-full ${item.status.dotClass} border-4 border-gray-50 z-10"></div>

                        <div class="bg-gray-50 rounded-xl p-4 border border-gray-100 hover:shadow-sm transition-shadow">
                            <div class="flex items-start justify-between gap-3 mb-3">
                                <div class="flex-1">
                                    <div class="flex items-center gap-2 flex-wrap mb-1">
                                        <h4 class="text-gray-800 font-medium ${item.completed ? 'line-through text-gray-400' : ''}">${escapeHtml(item.task)}</h4>
                                    </div>
                                </div>
                                <div class="p-2 rounded-lg ${item.overall.className}">
                                    <i class="lucide lucide-${item.overall.icon} text-lg"></i>
                                </div>
                            </div>

                            <div class="flex items-center gap-2 mb-3 flex-wrap">
                                <span class="text-xs px-2 py-1 rounded-full ${item.status.className}">${escapeHtml(item.status.label)}</span>
                                <span class="text-xs text-gray-500">Next at ${item.dueMileage.toLocaleString()} km</span>
                            </div>

                            <div class="flex items-center gap-2 text-xs text-gray-600 mb-3">
                                <i class="lucide lucide-${item.icon} text-gray-400"></i>
                                <span>${escapeHtml(item.reminder)}</span>
                            </div>

                            ${item.lastCompletedMileage ? `
                                <div class="mb-3 text-xs text-gray-500">
                                    Last completed at ${item.lastCompletedMileage.toLocaleString()} km
                                </div>
                            ` : ''}

                            <button onclick="markComplete('${item.id}'); return false;" class="w-full py-2 bg-green-700 text-white rounded-lg text-sm hover:bg-green-800 transition-colors active:scale-95">
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
    const due = items.filter((item) => item.status.key === 'due').length;
    const upcoming = items.filter((item) => item.status.key === 'upcoming').length;
    const completed = items.filter((item) => item.lastCompletedMileage > 0).length;

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

    try {
        const payload = {
            motorcycleId: item.motorcycleId,
            motorcycleName: item.motorcycleName,
            category: item.categoryLabel,
            taskKey: item.ruleKey,
            task: item.task,
            dueMileage: item.dueMileage,
            completedMileage: item.currentOdo,
            status: 'completed',
            completedAt: new Date().toISOString(),
            source: 'schedule-mark-complete'
        };

        await addFirestoreDoc('maintenance', payload);

        alert(`"${item.task}" marked as complete!`);
        await loadSchedule(currentUserId);
    } catch (error) {
        console.error('Error marking maintenance complete:', error);
        alert('Could not update the reminder. Please try again.');
    }
};