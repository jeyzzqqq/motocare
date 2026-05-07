import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, query, where, getDocs, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { cleanupOrphanedMotorcycleRecords } from './firebaseUtils.js';

onAuthStateChanged(auth, async (user) => {
    if (user) {
        document.getElementById('userName').textContent = user.email.split('@')[0];
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

        const [maintenanceSnapshot, repairsSnapshot] = await Promise.all([
            getDocs(query(
                collection(db, 'maintenance'),
                where('uid', '==', uid)
            )),
            getDocs(query(
                collection(db, 'repairs'),
                where('uid', '==', uid)
            ))
        ]);

        const activeMotorcycleTokens = buildActiveMotorcycleTokens(motorcyclesSnapshot.docs);
        displayUpcomingMaintenance(maintenanceSnapshot.docs, activeMotorcycleTokens);
        displayRecentRepairs(repairsSnapshot.docs, activeMotorcycleTokens);
        displayExpenseChart(repairsSnapshot.docs, activeMotorcycleTokens);
        displayMaintenancePieChart(maintenanceSnapshot.docs, activeMotorcycleTokens);
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        renderDashboardEmptyState();
    }
}

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
    document.getElementById('totalServices').textContent = '0';
    document.getElementById('totalSpent').textContent = '₱0';
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
        canvas.parentElement.innerHTML = `<div class="flex h-48 items-center justify-center rounded-xl bg-gray-50 text-gray-500 text-sm">${message}</div>`;
    }
}

function getRecordDate(docData) {
    const raw = docData.date || docData.dueDate || docData.createdAt;
    return raw ? new Date(raw) : null;
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

function displayUpcomingMaintenance(docs, activeMotorcycleTokens) {
    const container = document.getElementById('upcomingMaintenanceList');
    const items = docs
        .map((entry) => normalizeRecord(Object.assign({ id: entry.id }, entry.data())))
        .filter((item) => item.uid && item.status !== 'completed' && isLinkedToActiveMotorcycle(item, activeMotorcycleTokens));

    if (!items.length) {
        renderEmptyList('upcomingMaintenanceList');
        document.getElementById('totalServices').textContent = '0';
        return;
    }

    const sortedItems = items.sort((a, b) => {
        const dateA = new Date(a.dueDate || a.date || 0).getTime();
        const dateB = new Date(b.dueDate || b.date || 0).getTime();
        return dateA - dateB;
    });

    document.getElementById('totalServices').textContent = String(sortedItems.length);
    container.innerHTML = items.slice(0, 3).map(item => `
        <div onclick="window.location.href='schedule.html'" class="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all cursor-pointer active:shadow-inner">
            <div class="w-10 h-10 rounded-full flex items-center justify-center ${item.status === 'due' ? 'bg-red-100' : 'bg-green-100'}">
                <i class="lucide lucide-${item.icon || 'wrench'} ${item.status === 'due' ? 'text-red-600' : 'text-green-700'} text-xl"></i>
            </div>
            <div class="flex-1">
                <p class="text-gray-800 font-medium">${item.task || item.title || 'Maintenance item'}</p>
                <p class="text-xs text-gray-500">${item.dueDate || item.date || ''}</p>
            </div>
            <div class="flex items-center gap-2">
                <div class="w-2 h-2 rounded-full ${item.status === 'due' ? 'bg-red-500 animate-pulse' : 'bg-gray-400'}"></div>
                <i class="lucide lucide-chevron-right text-gray-400"></i>
            </div>
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
        document.getElementById('totalSpent').textContent = '₱0';
        return;
    }

    const sortedItems = items.sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
    const totalSpent = sortedItems.reduce((sum, item) => sum + Number(item.cost || 0), 0);
    document.getElementById('totalSpent').textContent = `₱${totalSpent.toFixed(2)}`;

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

    const monthlyTotals = new Map();
    items.forEach((item) => {
        const date = getRecordDate(item);
        if (!date) return;
        const key = `${date.getFullYear()}-${date.getMonth()}`;
        monthlyTotals.set(key, (monthlyTotals.get(key) || 0) + Number(item.cost || 0));
    });

    const sortedEntries = Array.from(monthlyTotals.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const labels = sortedEntries.map(([key]) => {
        const [year, month] = key.split('-').map(Number);
        return new Date(year, month, 1).toLocaleDateString('en-US', { month: 'short' });
    });
    const data = sortedEntries.map(([, value]) => value);

    if (!labels.length) {
        renderEmptyChart('expenseChart');
        return;
    }

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Expenses',
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

function displayMaintenancePieChart(docs, activeMotorcycleTokens) {
    const items = docs
        .map((entry) => ({ id: entry.id, ...entry.data() }))
        .filter((item) => item.uid && item.deleted !== true && isLinkedToActiveMotorcycle(item, activeMotorcycleTokens));

    const completed = items.filter((item) => item.status === 'completed').length;
    const pending = items.filter((item) => item.status !== 'completed').length;

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
        { name: 'Completed', value: completed, color: '#15803d' },
        { name: 'Pending', value: pending, color: '#9E9E9E' }
    ].filter((item) => item.value > 0);

    if (!data.length) {
        renderEmptyChart('maintenancePieChart');
        return;
    }

    new Chart(ctx, {
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
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
                <div class="w-3 h-3 rounded-full" style="background-color: ${item.color}"></div>
                <span class="text-gray-600 text-sm">${item.name}</span>
            </div>
            <span class="text-gray-800 font-semibold">${item.value}</span>
        </div>
    `).join('');
}
