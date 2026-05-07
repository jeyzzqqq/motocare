import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

onAuthStateChanged(auth, async (user) => {
    if (user) {
        await loadExpenses(user.uid);
    } else {
        window.location.href = 'index.html';
    }
});

async function loadExpenses(userId) {
    try {
        const q = query(
            collection(db, 'repairs'),
            where('uid', '==', userId),
            orderBy('date', 'desc')
        );
        const querySnapshot = await getDocs(q);
        const records = querySnapshot.docs
            .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
            .filter(record => record.uid === userId);
        
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
    document.getElementById('totalExpenses').textContent = '₱0';
    document.getElementById('thisMonthExpense').textContent = '₱0';
    document.getElementById('avgMonthExpense').textContent = '₱0';
    document.getElementById('trendText').textContent = 'No records yet';
    const indicator = document.getElementById('trendIndicator');
    if (indicator) {
        indicator.innerHTML = '<i class="lucide lucide-minus text-gray-300 text-xl"></i><span class="text-sm">No records yet</span>';
    }
    const monthlyChart = document.getElementById('monthlyTrendChart');
    if (monthlyChart?.parentElement) {
        monthlyChart.parentElement.innerHTML = '<div class="flex h-48 items-center justify-center rounded-xl bg-gray-50 text-gray-500 text-sm">No records yet</div>';
    }
    const pieChart = document.getElementById('categoryPieChart');
    if (pieChart?.parentElement) {
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
    const normalized = records.map((record) => {
        const date = record.date || record.createdAt || '';
        const parsedDate = date ? new Date(date) : null;
        return {
            rawDate: parsedDate,
            amount: Number(record.cost || 0),
            name: record.category || 'Maintenance',
            color: '#15803d',
            item: record.title || record.task || 'Repair',
            category: record.category || 'Maintenance',
            date: parsedDate ? parsedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
        };
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

    const ctx = document.getElementById('monthlyTrendChart').getContext('2d');
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

    const ctx = document.getElementById('categoryPieChart').getContext('2d');
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
    if (!expenses.length) {
        container.innerHTML = '<div class="text-gray-500 text-sm py-3">No records yet</div>';
        return;
    }
    container.innerHTML = expenses.map(expense => `
        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all cursor-pointer hover:scale-105 active:scale-95">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <i class="lucide lucide-dollar-sign text-green-700 text-xl"></i>
                </div>
                <div>
                    <p class="text-gray-800 font-medium">${expense.item}</p>
                    <div class="flex items-center gap-2 mt-0.5">
                        <i class="lucide lucide-calendar text-gray-400 text-xs"></i>
                        <span class="text-xs text-gray-500">${expense.date}</span>
                        <span class="text-xs text-gray-400">•</span>
                        <span class="text-xs text-gray-500">${expense.category}</span>
                    </div>
                </div>
            </div>
            <span class="text-green-700 font-bold">$${expense.amount}</span>
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

    document.getElementById('totalExpenses').textContent = `$${total}`;
    document.getElementById('thisMonthExpense').textContent = `$${thisMonth}`;
    document.getElementById('avgMonthExpense').textContent = `$${avg}`;
    document.getElementById('trendText').textContent = `${Math.abs(percentChange)}% from last month`;

    // Update trend indicator
    const indicator = document.getElementById('trendIndicator');
    if (percentChange >= 0) {
        indicator.innerHTML = `
            <i class="lucide lucide-trending-up text-red-300 text-xl"></i>
            <span class="text-sm">${percentChange}% from last month</span>
        `;
    } else {
        indicator.innerHTML = `
            <i class="lucide lucide-trending-down text-green-300 text-xl"></i>
            <span class="text-sm">${Math.abs(percentChange)}% from last month</span>
        `;
    }

    // Update current month
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                    'July', 'August', 'September', 'October', 'November', 'December'];
    const currentDate = new Date();
    document.getElementById('currentMonth').textContent = 
        `${months[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
}