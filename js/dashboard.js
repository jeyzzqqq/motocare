import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, query, where, getDocs, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

onAuthStateChanged(auth, async (user) => {
    if (user) {
        document.getElementById('userName').textContent = user.email.split('@')[0];
        await loadDashboardData(user.uid);
    } else {
        window.location.href = 'index.html';
    }
});

async function loadDashboardData(userId) {
    try {
        // Load upcoming maintenance
        const maintenanceQuery = query(
            collection(db, 'maintenance'),
            where('userId', '==', userId),
            where('status', '!=', 'completed'),
            orderBy('dueDate'),
            limit(3)
        );
        const maintenanceSnapshot = await getDocs(maintenanceQuery);
        displayUpcomingMaintenance(maintenanceSnapshot.docs);

        // Load recent repairs
        const repairsQuery = query(
            collection(db, 'repairs'),
            where('userId', '==', userId),
            orderBy('date', 'desc'),
            limit(2)
        );
        const repairsSnapshot = await getDocs(repairsQuery);
        displayRecentRepairs(repairsSnapshot.docs);

        // Load expense data
        const expensesQuery = query(
            collection(db, 'expenses'),
            where('userId', '==', userId),
            orderBy('date', 'desc'),
            limit(4)
        );
        const expensesSnapshot = await getDocs(expensesQuery);
        displayExpenseChart(expensesSnapshot.docs);
        displayMaintenancePieChart();
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        // Load mock data if Firebase fails
        loadMockData();
    }
}

function loadMockData() {
    const upcomingMaintenance = [
        { task: 'Oil Change', date: 'Apr 22, 2026', status: 'due', icon: 'wrench' },
        { task: 'Tire Inspection', date: 'Apr 25, 2026', status: 'upcoming', icon: 'alert-circle' },
        { task: 'Brake Check', date: 'May 5, 2026', status: 'upcoming', icon: 'check-circle-2' }
    ];

    const recentRepairs = [
        { task: 'Chain Lubrication', date: 'Apr 15, 2026', cost: '$25' },
        { task: 'Battery Replacement', date: 'Apr 10, 2026', cost: '$150' }
    ];

    displayUpcomingMaintenanceMock(upcomingMaintenance);
    displayRecentRepairsMock(recentRepairs);
    displayExpenseChartMock();
    displayMaintenancePieChart();
}

function displayUpcomingMaintenanceMock(items) {
    const container = document.getElementById('upcomingMaintenanceList');
    container.innerHTML = items.map(item => `
        <div onclick="window.location.href='schedule.html'" class="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all cursor-pointer active:shadow-inner">
            <div class="w-10 h-10 rounded-full flex items-center justify-center ${item.status === 'due' ? 'bg-red-100' : 'bg-green-100'}">
                <i class="lucide lucide-${item.icon} ${item.status === 'due' ? 'text-red-600' : 'text-green-700'} text-xl"></i>
            </div>
            <div class="flex-1">
                <p class="text-gray-800 font-medium">${item.task}</p>
                <p class="text-xs text-gray-500">${item.date}</p>
            </div>
            <div class="flex items-center gap-2">
                <div class="w-2 h-2 rounded-full ${item.status === 'due' ? 'bg-red-500 animate-pulse' : 'bg-gray-400'}"></div>
                <i class="lucide lucide-chevron-right text-gray-400"></i>
            </div>
        </div>
    `).join('');
}

function displayRecentRepairsMock(items) {
    const container = document.getElementById('recentRepairsList');
    container.innerHTML = items.map(item => `
        <div onclick="window.location.href='history.html'" class="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all cursor-pointer">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <i class="lucide lucide-check-circle-2 text-green-700 text-xl"></i>
                </div>
                <div>
                    <p class="text-gray-800 font-medium">${item.task}</p>
                    <p class="text-xs text-gray-500">${item.date}</p>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <span class="text-green-700 font-semibold">${item.cost}</span>
                <i class="lucide lucide-chevron-right text-gray-400"></i>
            </div>
        </div>
    `).join('');
}

function displayExpenseChartMock() {
    const ctx = document.getElementById('expenseChart').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr'],
            datasets: [{
                label: 'Expenses',
                data: [120, 200, 150, 300],
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
                            return '$' + value;
                        }
                    }
                }
            }
        }
    });
}

function displayMaintenancePieChart() {
    const ctx = document.getElementById('maintenancePieChart').getContext('2d');
    const data = [
        { name: 'Completed', value: 8, color: '#15803d' },
        { name: 'Pending', value: 3, color: '#9E9E9E' }
    ];

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

// Load mock data on page load
loadMockData();