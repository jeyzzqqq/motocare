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
            collection(db, 'expenses'),
            where('userId', '==', userId),
            orderBy('date', 'desc')
        );
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            loadMockExpenses();
        } else {
            displayExpenses(querySnapshot.docs);
        }
    } catch (error) {
        console.error('Error loading expenses:', error);
        loadMockExpenses();
    }
}

function loadMockExpenses() {
    const monthlyExpenses = [
        { month: 'Jan', amount: 120 },
        { month: 'Feb', amount: 335 },
        { month: 'Mar', amount: 130 },
        { month: 'Apr', amount: 175 }
    ];

    const categoryExpenses = [
        { name: 'Tires', value: 320, color: '#15803d' },
        { name: 'Oil Changes', value: 90, color: '#16a34a' },
        { name: 'Brake Service', value: 85, color: '#22c55e' },
        { name: 'Battery', value: 150, color: '#4ade80' },
        { name: 'Misc', value: 115, color: '#86efac' }
    ];

    const recentExpenses = [
        { id: 1, item: 'Chain Lubrication', amount: 25, date: 'Apr 15', category: 'Maintenance' },
        { id: 2, item: 'Battery Replacement', amount: 150, date: 'Apr 10', category: 'Parts' },
        { id: 3, item: 'Brake Pads', amount: 85, date: 'Mar 28', category: 'Parts' },
        { id: 4, item: 'Oil Change', amount: 45, date: 'Mar 15', category: 'Maintenance' }
    ];

    displayMonthlyChart(monthlyExpenses);
    displayCategoryChart(categoryExpenses);
    displayRecentExpenses(recentExpenses);
    updateStats(monthlyExpenses, categoryExpenses);
}

function displayMonthlyChart(data) {
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
                        label: (context) => `$${context.parsed.y}`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: (value) => '$' + value
                    }
                }
            }
        }
    });
}

function displayCategoryChart(data) {
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
                        label: (context) => `$${context.parsed}`
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
            <span class="text-sm font-semibold text-gray-800">$${item.value}</span>
        </div>
    `).join('');
}

function displayRecentExpenses(expenses) {
    const container = document.getElementById('recentExpensesList');
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
    const total = categoryData.reduce((sum, c) => sum + c.value, 0);
    const thisMonth = monthlyData[monthlyData.length - 1].amount;
    const lastMonth = monthlyData[monthlyData.length - 2].amount;
    const avg = Math.round(total / monthlyData.length);
    const percentChange = ((thisMonth - lastMonth) / lastMonth * 100).toFixed(1);

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