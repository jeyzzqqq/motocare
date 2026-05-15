import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, query, where, getDocs, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { cleanupOrphanedMotorcycleRecords, countFirestoreDocs, getFirestoreDocs } from './firebaseUtils.js';
import { normalizeRecord } from './utils-module.js';
import { MAINTENANCE_RULES, classifyMotorcycleCategory } from './maintenanceOptions.js';

// Chart.js instances (kept globally to avoid reusing canvas without destroying)
let expenseChartInstance = null;
let maintenanceChartInstance = null;

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userNameEl = document.getElementById('userName');
        if (userNameEl) userNameEl.textContent = user.email.split('@')[0];
        setDashboardLoadingState();
        await loadDashboardData(user);
    } else {
        window.location.href = 'index.html';
    }
});

// LOGOUT HANDLER
document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    try {
        await signOut(auth);
        showToast('Logged out successfully', 'success');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 500);
    } catch (error) {
        console.error('Logout error:', error);
        showToast('Error logging out', 'error');
    }
});

async function loadDashboardData(user) {
    try {
        console.debug('loadDashboardData: checking DOM elements', {
            totalRepairs: !!document.getElementById('totalRepairs'),
            recentRepairsList: !!document.getElementById('recentRepairsList'),
            upcomingMaintenanceList: !!document.getElementById('upcomingMaintenanceList')
        });

        const currentUser = auth.currentUser || user;
        const uid = currentUser?.uid;

        if (!uid) {
            window.location.href = 'index.html';
            return;
        }

        const motorcyclesSnapshot = await getDocs(query(
            collection(db, 'motorcycles'),
            where('uid', '==', uid)
        ));

        await cleanupOrphanedMotorcycleRecords(motorcyclesSnapshot.docs);

        const maintenanceSnapshot = await getDocs(query(
            collection(db, 'maintenance'),
            where('uid', '==', uid)
        ));

        // initial repairs snapshot used for charts/list; we also subscribe to realtime updates so counts stay in sync
        const repairsQuery = query(collection(db, 'repairs'), where('uid', '==', uid));
        const repairsSnapshot = await getDocs(repairsQuery);

        const motorcycles = motorcyclesSnapshot.docs
            .map((entry) => normalizeRecord(Object.assign({ id: entry.id }, entry.data())))
            .filter((item) => item.uid === uid && item.deleted !== true);

        const maintenanceItems = maintenanceSnapshot.docs
            .map((entry) => normalizeRecord(Object.assign({ id: entry.id }, entry.data())))
            .filter((item) => item.uid === uid && item.deleted !== true);

        const scheduleStatusItems = buildScheduleStatusItems(motorcycles, maintenanceItems);

        // Use the actual repair records count for "Total Services" so it matches history.html
        const repairsItems = repairsSnapshot.docs
            .map((entry) => Object.assign({ id: entry.id }, entry.data()));

        console.debug('Initial repairs snapshot size:', repairsSnapshot.size);
        // Log each raw doc for inspection
        repairsItems.forEach((d) => console.debug('repair-doc:', { id: d.id, uid: d.uid, deleted: d.deleted, data: d }));
        const filteredRepairs = repairsItems.filter((item) => String(item.uid || '') === String(uid) && item.deleted !== true);
        console.debug('Filtered repairs count (uid match, not deleted):', filteredRepairs.length, filteredRepairs.map(d => ({ id: d.id, uid: d.uid, deleted: d.deleted })));

        // Also fetch via firebaseUtils.getFirestoreDocs to compare results
        try {
            const docsViaHelper = await getFirestoreDocs('repairs');
            console.debug('getFirestoreDocs(repairs) returned count:', docsViaHelper.length);
            docsViaHelper.forEach((d) => console.debug('helper-repair-doc:', { id: d.id, uid: d.uid, deleted: d.deleted }));
        } catch (e) {
            console.warn('getFirestoreDocs helper failed:', e?.message || e);
        }

        // Also get authoritative count using firebaseUtils helper (uses auth.currentUser internally)
        try {
            const authoritativeCount = await countFirestoreDocs('repairs');
            console.debug('Authoritative countFirestoreDocs(repairs):', authoritativeCount);
            const totalRepairsElInit = document.getElementById('totalRepairs');
            if (totalRepairsElInit) totalRepairsElInit.textContent = String(authoritativeCount);
            if (authoritativeCount !== filteredRepairs.length) {
                console.warn('Discrepancy between initial filtered repairs and authoritative count:', filteredRepairs.length, authoritativeCount);
            }
        } catch (err) {
            // fallback to filtered count
            console.warn('Authoritative count failed, fallback to filtered length:', err?.message || err);
            const totalRepairsElFallback = document.getElementById('totalRepairs');
            if (totalRepairsElFallback) totalRepairsElFallback.textContent = String(filteredRepairs.length);
        }

        // Subscribe to realtime updates so dashboard stays in sync when repairs are added/edited/deleted
        onSnapshot(repairsQuery, (snap) => {
            try {
                console.debug('Live repairs snapshot size:', snap.size, 'docIds:', snap.docs.map(d => d.id));
                const liveRepairsRaw = snap.docs.map((entry) => Object.assign({ id: entry.id }, entry.data()));
                const liveRepairs = liveRepairsRaw.filter((item) => String(item.uid || '') === String(uid) && item.deleted !== true);
                console.debug('Filtered live repairs count:', liveRepairs.length, liveRepairs.map(d => ({ id: d.id, uid: d.uid, deleted: d.deleted })));

                // update total services count
                const totalEl = document.getElementById('totalRepairs');
                if (totalEl) totalEl.textContent = String(liveRepairs.length);

                // update recent repairs and expense chart using the live snapshot
                const activeMotorcycleTokens = buildActiveMotorcycleTokens(motorcyclesSnapshot.docs);
                displayRecentRepairs(snap.docs, activeMotorcycleTokens);
                displayExpenseChart(snap.docs, activeMotorcycleTokens);
            } catch (err) {
                console.error('Error processing live repairs snapshot:', err);
            }
        });

        // If real-time listen fails due to network/extension blocking, we still want a clear log
        // The console logs above enumerate all raw docs and helper results for inspection.

        const activeMotorcycleTokens = buildActiveMotorcycleTokens(motorcyclesSnapshot.docs);
        displayUpcomingMaintenance(scheduleStatusItems);
        displayRecentRepairs(repairsSnapshot.docs, activeMotorcycleTokens);
        displayExpenseChart(repairsSnapshot.docs, activeMotorcycleTokens);
        displayMaintenancePieChart(scheduleStatusItems);

        // totals are handled by realtime subscription; manual recalc removed
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        renderDashboardEmptyState();
    }
}
// manual recalc feature removed

// debug helper removed; dashboard now logs detailed repair docs during loadDashboardData for inspection

function setDashboardLoadingState() {
    renderEmptyList('upcomingMaintenanceList', 'Loading...');
    renderEmptyList('recentRepairsList', 'Loading...');
    const expenseChart = document.getElementById('expenseChart');
    if (expenseChart) {
        expenseChart.style.opacity = '0.4';
    }
    const maintenancePieChart = document.getElementById('maintenancePieChart');
    if (maintenancePieChart) {
        maintenancePieChart.style.opacity = '0.4';
    }
}

function renderDashboardEmptyState() {
    renderEmptyList('upcomingMaintenanceList');
    renderEmptyList('recentRepairsList');
    renderEmptyChart('expenseChart');
    renderEmptyChart('maintenancePieChart');
    const maintenanceLegend = document.getElementById('maintenanceLegend');
    if (maintenanceLegend) {
        maintenanceLegend.innerHTML = '<div class="text-gray-500 text-sm">No records yet</div>';
    }
    const totalRepairsEl = document.getElementById('totalRepairs');
    if (totalRepairsEl) totalRepairsEl.textContent = '0';
    const totalSpentEl = document.getElementById('totalSpent');
    if (totalSpentEl) totalSpentEl.textContent = '₱0';
}

function renderEmptyList(containerId, message = 'No records yet') {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `<div class="text-gray-500 text-sm py-3">${message}</div>`;
    }
}

function renderEmptyChart(containerId, message = 'No records yet') {
    const canvas = document.getElementById(containerId);
    if (canvas && canvas.parentElement) {
        canvas.style.opacity = '1';
        // Destroy any existing Chart.js instance associated with this canvas before replacing
        try {
            if (containerId === 'expenseChart' && expenseChartInstance) {
                expenseChartInstance.destroy();
                expenseChartInstance = null;
            }
            if (containerId === 'maintenancePieChart' && maintenanceChartInstance) {
                maintenanceChartInstance.destroy();
                maintenanceChartInstance = null;
            }
        } catch (e) {
            console.warn('Error destroying chart instance for', containerId, e?.message || e);
        }

        canvas.parentElement.innerHTML = `<div class="flex h-48 items-center justify-center rounded-xl bg-gray-50 text-gray-500 text-sm">${message}</div>`;
    }
}

function getRecordDate(docData) {
    const raw = docData.date || docData.dueDate || docData.createdAt;
    return raw ? new Date(raw) : null;
}

function normalizeText(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function getMotorcycleMileage(motorcycle) {
    const raw = motorcycle.mileage ?? motorcycle.odo ?? motorcycle.currentOdo ?? motorcycle.odometer ?? 0;
    const numeric = Number(raw);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

function getMotorcycleLabel(motorcycle) {
    return motorcycle.motorcycleName || [motorcycle.brand, motorcycle.model].filter(Boolean).join(' ') || 'Motorcycle';
}

function getNextMileageTarget(anchorMileage, interval) {
    const anchor = Number(anchorMileage || 0);
    const step = Number(interval || 0);

    if (!step || step <= 0) return Number.MAX_SAFE_INTEGER;
    if (!Number.isFinite(anchor) || anchor < 0) return step;

    return Math.ceil(anchor / step) * step || step;
}

function getNextMileageAfterCompletion(completedMileage, interval) {
    const mileage = Number(completedMileage || 0);
    const step = Number(interval || 0);

    if (!step || step <= 0) return Number.MAX_SAFE_INTEGER;
    if (!Number.isFinite(mileage) || mileage < 0) return step;

    return mileage + step;
}

function getTaskStatus(odo, dueMileage, hasCompletion) {
    if (hasCompletion && odo < dueMileage) {
        return 'completed';
    }

    if (odo > dueMileage) {
        return 'overdue';
    }

    if (odo === dueMileage) {
        return 'due';
    }

    if ((dueMileage - odo) <= 500) {
        return 'upcoming';
    }

    return 'scheduled';
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

function buildScheduleStatusItems(motorcycles, maintenanceItems) {
    return motorcycles.flatMap((motorcycle) => {
        const category = classifyMotorcycleCategory(motorcycle);
        const rules = MAINTENANCE_RULES[category.key] || MAINTENANCE_RULES.underbone;
        const odo = getMotorcycleMileage(motorcycle);
        const motorcycleName = getMotorcycleLabel(motorcycle);

        return rules.map((rule) => {
            const completedRecord = findCompletedMaintenanceRecord(maintenanceItems, motorcycle.id, rule);
            const hasCompletion = !!completedRecord;
            const anchorMileage = hasCompletion
                ? getCompletionMileage(completedRecord)
                : odo;
            const dueMileage = hasCompletion
                ? getNextMileageAfterCompletion(anchorMileage, rule.interval)
                : getNextMileageTarget(anchorMileage, rule.interval);
            const status = getTaskStatus(odo, dueMileage, hasCompletion);

            return {
                id: `${motorcycle.id}-${rule.key}`,
                motorcycleName,
                task: rule.task,
                icon: rule.icon || 'wrench',
                currentOdo: odo,
                dueMileage,
                status
            };
        });
    });
}

function buildActiveMotorcycleTokens(docs) {
    return new Set(
        docs.flatMap((entry) => {
            const data = entry.data();
            return [
                entry.id,
                data.brand,
                data.model,
                data.plate,
                data.plateNumber,
                data.motorcycleName,
                data.name
            ]
                .map((value) => String(value || '').trim().toLowerCase())
                .filter(Boolean);
        })
    );
}

function isLinkedToActiveMotorcycle(record, activeMotorcycleTokens) {
    if (!activeMotorcycleTokens || activeMotorcycleTokens.size === 0) {
        return false;
    }

    const values = [
        record.motorcycleId,
        record.motorcycleName,
        record.motorcycle,
        record.plate,
        record.plateNumber,
        record.brand,
        record.model
    ]
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean);

    return values.some((value) =>
        Array.from(activeMotorcycleTokens).some((token) => value === token || value.includes(token) || token.includes(value))
    );
}

function displayUpcomingMaintenance(scheduleItems) {
    const container = document.getElementById('upcomingMaintenanceList');

    const items = (scheduleItems || [])
        .filter((item) => item.status !== 'completed');

    if (!items.length) {
        renderEmptyList('upcomingMaintenanceList');
        return;
    }

    const sortedItems = items.sort((a, b) => {
        const priority = { overdue: 0, due: 1, upcoming: 2, scheduled: 3 };
        const statusDiff = (priority[a.status] ?? 3) - (priority[b.status] ?? 3);
        if (statusDiff !== 0) return statusDiff;
        return a.dueMileage - b.dueMileage;
    });

    container.innerHTML = sortedItems.slice(0, 3).map(item => `
        <div onclick="window.location.href='schedule.html'" class="flex items-start gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer active:scale-[0.99]">
            <div class="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${item.status === 'overdue' || item.status === 'due' ? 'bg-red-50 text-red-600' : item.status === 'upcoming' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'}">
                <i class="lucide lucide-${item.icon || 'wrench'} text-lg"></i>
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-2 mb-1">
                    <p class="text-gray-900 font-medium leading-snug line-clamp-2">${item.task || 'Maintenance item'}</p>
                    <span class="text-[10px] uppercase tracking-wide px-2 py-1 rounded-full font-semibold whitespace-nowrap ${item.status === 'overdue' || item.status === 'due' ? 'bg-red-50 text-red-700' : item.status === 'upcoming' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'}">
                        ${item.status === 'overdue' || item.status === 'due' ? 'Urgent' : item.status === 'upcoming' ? 'Soon' : 'Queued'}
                    </span>
                </div>
                <p class="text-xs text-gray-500 leading-relaxed">${item.motorcycleName} · Target ODO ${Number(item.dueMileage || 0).toLocaleString()} km</p>
            </div>
            <i class="lucide lucide-chevron-right text-gray-300 mt-3"></i>
        </div>
    `).join('');
}

function displayRecentRepairs(docs, activeMotorcycleTokens) {
    const container = document.getElementById('recentRepairsList');
    const items = docs
        .map((entry) => normalizeRecord(Object.assign({ id: entry.id }, entry.data())))
        .filter((item) => item.uid && item.deleted !== true && isLinkedToActiveMotorcycle(item, activeMotorcycleTokens));

    if (!items.length) {
        renderEmptyList('recentRepairsList');
        const totalSpentEl = document.getElementById('totalSpent');
        if (totalSpentEl) totalSpentEl.textContent = '₱0';
        return;
    }

    const sortedItems = items.sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
    const totalSpent = sortedItems.reduce((sum, item) => sum + Number(item.cost || 0), 0);
    const totalSpentEl = document.getElementById('totalSpent');
    if (totalSpentEl) totalSpentEl.textContent = `₱${totalSpent.toFixed(2)}`;

    container.innerHTML = sortedItems.slice(0, 2).map(item => `
        <div onclick="window.location.href='history.html'" class="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all cursor-pointer">
            <div class="flex items-center gap-3 flex-1">
                <div class="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <i class="lucide lucide-check-circle-2 text-green-700 text-xl"></i>
                </div>
                <div class="flex-1">
                    <div class="flex items-center gap-2 flex-wrap">
                        <p class="text-gray-800 font-medium">${item.title || item.task || 'Repair'}</p>
                        ${item.motorcycleName ? `<span class="text-xs bg-green-700 text-white px-2 py-1 rounded-full font-medium">${item.motorcycleName}</span>` : ''}
                    </div>
                    <p class="text-xs text-gray-500">${item.date || item.createdAt || ''}</p>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <span class="text-green-700 font-semibold">₱${Number(item.cost || 0).toFixed(2)}</span>
                <i class="lucide lucide-chevron-right text-gray-400"></i>
            </div>
        </div>
    `).join('');
}

function displayExpenseChart(docs, activeMotorcycleTokens) {
    const chartElement = document.getElementById('expenseChart');
    if (!chartElement) {
        console.error('Chart canvas not found');
        return;
    }

    chartElement.style.opacity = '1';
    const ctx = chartElement.getContext('2d');
    const items = docs
        .map((entry) => normalizeRecord(Object.assign({ id: entry.id }, entry.data())))
        .filter((item) => item.uid && item.deleted !== true && isLinkedToActiveMotorcycle(item, activeMotorcycleTokens));

    if (!items.length) {
        renderEmptyChart('expenseChart');
        return;
    }

    const dailyTotals = new Map();
    items.forEach((item) => {
        const date = getRecordDate(item);
        if (!date) return;
        const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        dailyTotals.set(key, (dailyTotals.get(key) || 0) + Number(item.cost || 0));
    });

    const sortedEntries = Array.from(dailyTotals.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-14);
    
    const labels = sortedEntries.map(([key]) => {
        const [year, month, day] = key.split('-').map(Number);
        return new Date(year, month, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    const data = sortedEntries.map(([, value]) => value);

    if (!labels.length) {
        renderEmptyChart('expenseChart');
        return;
    }

    // Destroy previous expense chart instance if present
    try {
        if (expenseChartInstance) {
            expenseChartInstance.destroy();
            expenseChartInstance = null;
        }
    } catch (e) {
        console.warn('Failed to destroy previous expense chart instance', e?.message || e);
    }

    expenseChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Daily Expenses',
                data,
                backgroundColor: '#15803d',
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '₱' + value;
                        }
                    }
                }
            }
        }
    });
}

function displayMaintenancePieChart(scheduleItems) {
    const items = scheduleItems || [];

    const completed = items.filter((item) => item.status === 'completed').length;
    const overdue = items.filter((item) => item.status === 'overdue').length;
    const dueNow = items.filter((item) => item.status === 'due').length;
    const upcomingDue = items.filter((item) => item.status === 'upcoming' || item.status === 'scheduled').length;

    if (!items.length) {
        renderEmptyChart('maintenancePieChart');
        const legend = document.getElementById('maintenanceLegend');
        if (legend) {
            legend.innerHTML = '<div class="text-gray-500 text-sm">No records yet</div>';
        }
        return;
    }

    const chartElement = document.getElementById('maintenancePieChart');
    if (!chartElement) {
        console.error('Maintenance chart canvas not found');
        return;
    }

    chartElement.style.opacity = '1';
    const ctx = chartElement.getContext('2d');
    const data = [
        { name: 'Logged', value: completed, color: '#15803d' },
        { name: 'Coming up', value: upcomingDue, color: '#F59E0B' },
        { name: 'Due / overdue', value: dueNow + overdue, color: '#DC2626' },
    ].filter((item) => item.value > 0);

    if (!data.length) {
        renderEmptyChart('maintenancePieChart');
        return;
    }

    // Destroy previous maintenance chart instance if present
    try {
        if (maintenanceChartInstance) {
            maintenanceChartInstance.destroy();
            maintenanceChartInstance = null;
        }
    } catch (e) {
        console.warn('Failed to destroy previous maintenance chart instance', e?.message || e);
    }

    maintenanceChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.map(d => d.name),
            datasets: [{
                data: data.map(d => d.value),
                backgroundColor: data.map(d => d.color),
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });

    // Display legend
    const legend = document.getElementById('maintenanceLegend');
    legend.innerHTML = data.map(item => `
        <div class="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50 px-3 py-2">
            <div class="flex items-center gap-2">
                <div class="w-3 h-3 rounded-full" style="background-color: ${item.color}"></div>
                <span class="text-gray-700 text-sm font-medium">${item.name}</span>
            </div>
            <span class="text-gray-900 font-semibold">${item.value}</span>
        </div>
    `).join('');
}
