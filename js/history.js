import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { cleanupOrphanedMotorcycleRecords } from './firebaseUtils.js';

onAuthStateChanged(auth, async (user) => {
    if (user) {
        await loadExpenses(user.uid);
    } else {
        window.location.href = 'index.html';
    }
});

async function loadExpenses(userId) {
    try {
        const motorcyclesSnapshot = await getDocs(query(
            collection(db, 'motorcycles'),
            where('uid', '==', userId)
        ));

        await cleanupOrphanedMotorcycleRecords(motorcyclesSnapshot.docs);

        const fallbackQuery = query(
            collection(db, 'repairs'),
            where('uid', '==', userId)
        );
        const querySnapshot = await getDocs(fallbackQuery);

        const records = querySnapshot.docs
            .map(docSnap => normalizeRecord(Object.assign({ id: docSnap.id }, docSnap.data())))
            .filter(record => record.uid === userId && record.deleted !== true);
        
        if (records.length === 0) {
            renderEmptyState();
        } else {
            displayExpenses(records);
        }
    } catch (error) {
        console.error('Error loading expenses:', error);
        renderEmptyState();
    }
}

function renderEmptyState() {
    const totalExpenses = document.getElementById('totalExpenses');
    const thisMonthExpense = document.getElementById('thisMonthExpense');
    const avgMonthExpense = document.getElementById('avgMonthExpense');
    const trendText = document.getElementById('trendText');
    if (totalExpenses) totalExpenses.textContent = '₱0';
    if (thisMonthExpense) thisMonthExpense.textContent = '₱0';
    if (avgMonthExpense) avgMonthExpense.textContent = '₱0';
    if (trendText) trendText.textContent = 'No records yet';
    const indicator = document.getElementById('trendIndicator');
    if (indicator) {
        indicator.innerHTML = '<i class="lucide lucide-minus text-gray-300 text-xl"></i><span class="text-sm">No records yet</span>';
    }
    const monthlyChart = document.getElementById('monthlyTrendChart');
    if (monthlyChart?.parentElement) {
        monthlyChart.style.opacity = '1';
        monthlyChart.parentElement.innerHTML = '<div class="flex h-48 items-center justify-center rounded-xl bg-gray-50 text-gray-500 text-sm">No records yet</div>';
    }
    const pieChart = document.getElementById('categoryPieChart');
    if (pieChart?.parentElement) {
        pieChart.style.opacity = '1';
        pieChart.parentElement.innerHTML = '<div class="flex h-48 items-center justify-center rounded-xl bg-gray-50 text-gray-500 text-sm">No records yet</div>';
    }
    const legend = document.getElementById('categoryLegend');
    if (legend) {
        legend.innerHTML = '<div class="text-gray-500 text-sm">No records yet</div>';
    }
    const container = document.getElementById('recentExpensesList');
    if (container) {
        container.innerHTML = '<div class="text-gray-500 text-sm py-3">No records yet</div>';
    }
}

function displayExpenses(records) {
    const normalized = records
        .map((record) => {
        const date = record.date || record.createdAt || '';
        const parsedDate = date ? new Date(date) : null;
        return {
            rawDate: parsedDate,
            amount: Number(record.cost || 0),
            name: record.category || 'Maintenance',
            color: '#15803d',
            item: record.title || record.task || 'Repair',
            category: record.category || 'Maintenance',
            date: parsedDate ? parsedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
            motorcycleName: record.motorcycleName || ''
        };
    })
        .sort((a, b) => {
            const dateA = a.rawDate?.getTime() || 0;
            const dateB = b.rawDate?.getTime() || 0;
            return dateB - dateA;
        });

    const monthlyTotals = new Map();
    normalized.forEach((item) => {
        const monthKey = item.rawDate ? `${item.rawDate.getFullYear()}-${item.rawDate.getMonth()}` : 'unknown';
        monthlyTotals.set(monthKey, (monthlyTotals.get(monthKey) || 0) + item.amount);
    });

    const monthlyData = Array.from(monthlyTotals.entries())
        .filter(([month]) => month !== 'unknown')
        .map(([month, amount]) => {
            const [year, monthIndex] = month.split('-').map(Number);
            return {
                month: new Date(year, monthIndex, 1).toLocaleDateString('en-US', { month: 'short' }),
                amount
            };
        });
    const categoryTotals = new Map();
    normalized.forEach((item) => {
        categoryTotals.set(item.name, (categoryTotals.get(item.name) || 0) + item.amount);
    });
    const categoryData = Array.from(categoryTotals.entries()).map(([name, value], index) => ({
        name,
        value,
        color: ['#15803d', '#16a34a', '#22c55e', '#4ade80', '#86efac'][index % 5]
    }));

    displayMonthlyChart(monthlyData);
    displayCategoryChart(categoryData);
    displayRecentExpenses(normalized.slice(0, 4));
    updateStats(monthlyData, categoryData);
}

function displayMonthlyChart(data) {
    if (!data.length) {
        renderEmptyState();
        return;
    }

    const chartElement = document.getElementById('monthlyTrendChart');
    if (!chartElement) {
        return;
    }

    chartElement.style.opacity = '1';
    const ctx = chartElement.getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.month),
            datasets: [{
                label: 'Expenses',
                data: data.map(d => d.amount),
                backgroundColor: '#15803d',
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => `₱${context.parsed.y}`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: (value) => '₱' + value
                    }
                }
            }
        }
    });
}

function displayCategoryChart(data) {
    if (!data.length) {
        renderEmptyState();
        return;
    }

    const chartElement = document.getElementById('categoryPieChart');
    if (!chartElement) {
        return;
    }

    chartElement.style.opacity = '1';
    const ctx = chartElement.getContext('2d');
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
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => `₱${context.parsed}`
                    }
                }
            }
        }
    });

    // Display legend
    const legend = document.getElementById('categoryLegend');
    if (!legend) {
        return;
    }

    legend.innerHTML = data.map(item => `
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
                <div class="w-3 h-3 rounded-full" style="background-color: ${item.color}"></div>
                <span class="text-sm text-gray-600">${item.name}</span>
            </div>
            <span class="text-sm font-semibold text-gray-800">₱${item.value}</span>
        </div>
    `).join('');
}

function displayRecentExpenses(expenses) {
    const container = document.getElementById('recentExpensesList');
    if (!container) {
        return;
    }

    if (!expenses.length) {
        container.innerHTML = '<div class="text-gray-500 text-sm py-3">No records yet</div>';
        return;
    }
    container.innerHTML = expenses.map(expense => `
        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all cursor-pointer hover:scale-105 active:scale-95">
            <div class="flex items-center gap-3 flex-1">
                <div class="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <i class="lucide lucide-dollar-sign text-green-700 text-xl"></i>
                </div>
                <div class="flex-1">
                    <div class="flex items-center gap-2 flex-wrap">
                        <p class="text-gray-800 font-medium">${expense.item}</p>
                        ${expense.motorcycleName ? `<span class="text-xs bg-green-700 text-white px-2 py-1 rounded-full font-medium">${expense.motorcycleName}</span>` : ''}
                    </div>
                    <div class="flex items-center gap-2 mt-0.5">
                        <i class="lucide lucide-calendar text-gray-400 text-xs"></i>
                        <span class="text-xs text-gray-500">${expense.date}</span>
                        <span class="text-xs text-gray-400">•</span>
                        <span class="text-xs text-gray-500">${expense.category}</span>
                    </div>
                </div>
            </div>
            <span class="text-green-700 font-bold">₱${expense.amount}</span>
        </div>
    `).join('');
}

function updateStats(monthlyData, categoryData) {
    if (!monthlyData.length || !categoryData.length) {
        renderEmptyState();
        return;
    }

    const total = categoryData.reduce((sum, c) => sum + c.value, 0);
    const thisMonth = monthlyData[monthlyData.length - 1]?.amount || 0;
    const lastMonth = monthlyData[monthlyData.length - 2]?.amount || thisMonth || 1;
    const avg = Math.round(total / monthlyData.length);
    const percentChange = lastMonth === 0 ? '0.0' : ((thisMonth - lastMonth) / lastMonth * 100).toFixed(1);

    const totalExpenses = document.getElementById('totalExpenses');
    const thisMonthExpense = document.getElementById('thisMonthExpense');
    const avgMonthExpense = document.getElementById('avgMonthExpense');
    const trendText = document.getElementById('trendText');
    if (totalExpenses) totalExpenses.textContent = `₱${total}`;
    if (thisMonthExpense) thisMonthExpense.textContent = `₱${thisMonth}`;
    if (avgMonthExpense) avgMonthExpense.textContent = `₱${avg}`;
    if (trendText) trendText.textContent = `${Math.abs(percentChange)}% from last month`;

    // Update trend indicator
    const indicator = document.getElementById('trendIndicator');
    if (indicator && percentChange >= 0) {
        indicator.innerHTML = `
            <i class="lucide lucide-trending-up text-red-300 text-xl"></i>
            <span class="text-sm">${percentChange}% from last month</span>
        `;
    } else if (indicator) {
        indicator.innerHTML = `
            <i class="lucide lucide-trending-down text-green-300 text-xl"></i>
            <span class="text-sm">${Math.abs(percentChange)}% from last month</span>
        `;
    }

    // Update current month
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                    'July', 'August', 'September', 'October', 'November', 'December'];
    const currentDate = new Date();
    const currentMonth = document.getElementById('currentMonth');
    if (currentMonth) {
        currentMonth.textContent = `${months[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }
}