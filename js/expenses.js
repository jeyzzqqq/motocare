import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { deleteFirestoreDoc, cleanupOrphanedMotorcycleRecords } from './firebaseUtils.js';
import { normalizeRecord } from './utils-module.js';

let expenses = [];
let pendingUserId = null;
let isDomReady = document.readyState !== 'loading';
let dailyTrendChartInstance = null;

function getExpenseAmount(expense = {}) {
    const value = expense.amount ?? expense.cost ?? expense.total ?? 0;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeDateKey(dateLike) {
    const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getDailyTotals(expenseList = []) {
    const totals = new Map();

    expenseList.forEach((expense) => {
        const key = normalizeDateKey(expense.date || expense.createdAt || expense.updatedAt);
        if (!key) return;
        totals.set(key, (totals.get(key) || 0) + getExpenseAmount(expense));
    });

    return totals;
}

function canRenderExpenses() {
    return Boolean(document.getElementById('totalExpenses'));
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

function startExpensesLoad(userId) {
    pendingUserId = null;
    setLoadingState();
    loadExpenses(userId).catch((error) => {
        console.error('Error loading expenses:', error);
        renderEmptyState();
    });
}

function setLoadingState() {
    if (!canRenderExpenses()) return;

    setText('totalExpenses', 'Loading...');
    setText('thisMonthExpense', 'Loading...');
    setText('currentMonth', 'Loading...');

    const recentList = document.getElementById('recentExpensesList');
    if (recentList) recentList.innerHTML = '<div class="text-gray-500 text-sm py-3">Loading...</div>';

    const legend = document.getElementById('categoryLegend');
    if (legend) legend.innerHTML = '<div class="text-gray-500 text-sm">Loading...</div>';
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        if (!isDomReady || !canRenderExpenses()) {
            pendingUserId = user.uid;
            return;
        }

        startExpensesLoad(user.uid);
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

        const querySnapshot = await getDocs(query(
            collection(db, 'repairs'),
            where('uid', '==', userId)
        ));

        expenses = querySnapshot.docs
            .map(doc => normalizeRecord(Object.assign({ id: doc.id }, doc.data())))
            .filter(exp => exp.uid === userId && exp.deleted !== true)
            .sort((a, b) => getRecordTime(b) - getRecordTime(a));

        if (!expenses.length) {
            renderEmptyState();
        } else {
            displayExpenses();
        }
    } catch (error) {
        console.error('Error loading expenses:', error);
        renderEmptyState();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    isDomReady = true;

    if (pendingUserId) {
        startExpensesLoad(pendingUserId);
        return;
    }

    if (auth.currentUser && canRenderExpenses()) {
        startExpensesLoad(auth.currentUser.uid);
    }
});

function renderEmptyState() {
    expenses = [];
    if (!canRenderExpenses()) return;

    setText('totalExpenses', '₱0.00');
    setText('thisMonthExpense', '₱0.00');
    setText('currentMonth', new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));

    const recentList = document.getElementById('recentExpensesList');
    if (recentList) {
        recentList.innerHTML = '<div class="text-gray-500 text-sm py-3">No records yet</div>';
    }

    const trendChart = document.getElementById('dailyTrendChart');
    if (trendChart?.parentElement) {
        trendChart.parentElement.innerHTML = '<div class="flex h-48 items-center justify-center rounded-xl bg-gray-50 text-gray-500 text-sm">No records yet</div>';
    }

    const pieChart = document.getElementById('categoryPieChart');
    if (pieChart?.parentElement) {
        pieChart.parentElement.innerHTML = '<div class="flex h-48 items-center justify-center rounded-xl bg-gray-50 text-gray-500 text-sm">No records yet</div>';
    }

    const legend = document.getElementById('categoryLegend');
    if (legend) {
        legend.innerHTML = '<div class="text-gray-500 text-sm">No records yet</div>';
    }
}

function displayExpenses() {
    if (!expenses.length) {
        renderEmptyState();
        return;
    }

    if (!canRenderExpenses()) return;

    const total = expenses.reduce((sum, exp) => sum + getExpenseAmount(exp), 0);
    const now = new Date();
    const todayKey = normalizeDateKey(now);
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayKey = normalizeDateKey(yesterdayDate);
    const dailyTotals = getDailyTotals(expenses);
    const todayTotal = dailyTotals.get(todayKey) || 0;
    const yesterdayTotal = dailyTotals.get(yesterdayKey) || 0;

    const weeklyAverage = calculateDailyAverage(expenses, 7);
    updateTrendIndicator(todayTotal, yesterdayTotal);

    // Update header stats
    setText('totalExpenses', `₱${total.toFixed(2)}`);
    setText('thisMonthExpense', `₱${todayTotal.toFixed(2)}`);
    setText('currentMonth', now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }));

    // Display trend (daily)
    displayDailyTrendChart();
    
    // Display category breakdown
    displayCategoryChart();

    // Display recent expenses
    displayRecentExpenses();
}

function calculateDailyAverage(expenses, days = 7) {
    if (!expenses.length) return 0;

    const dailyTotals = getDailyTotals(expenses);
    const now = new Date();
    let total = 0;
    let count = 0;

    for (let offset = 0; offset < days; offset += 1) {
        const date = new Date(now);
        date.setDate(now.getDate() - offset);
        const key = normalizeDateKey(date);
        total += dailyTotals.get(key) || 0;
        count += 1;
    }

    return total / Math.max(1, count);
}

function updateTrendIndicator(todayTotal, yesterdayTotal) {
    const trendText = document.getElementById('trendText');
    const trendIndicator = document.getElementById('trendIndicator');
    if (!trendText) return;

    if (todayTotal === 0 && yesterdayTotal === 0) {
        trendText.textContent = 'No spending today or yesterday';
        trendIndicator?.classList.remove('text-red-300', 'text-green-300');
        return;
    }

    if (yesterdayTotal === 0) {
        trendText.textContent = todayTotal > 0
            ? `+${todayTotal.toFixed(2)} today vs yesterday`
            : 'No spending yesterday';
        trendIndicator?.classList.remove('text-red-300');
        trendIndicator?.classList.add('text-green-300');
        return;
    }

    const diff = todayTotal - yesterdayTotal;
    const percent = Math.abs((diff / yesterdayTotal) * 100);
    const rounded = percent.toFixed(1);

    if (diff > 0) {
        trendText.textContent = `${rounded}% higher than yesterday`;
        trendIndicator?.classList.remove('text-green-300');
        trendIndicator?.classList.add('text-red-300');
    } else if (diff < 0) {
        trendText.textContent = `${rounded}% lower than yesterday`;
        trendIndicator?.classList.remove('text-red-300');
        trendIndicator?.classList.add('text-green-300');
    } else {
        trendText.textContent = 'Same as yesterday';
        trendIndicator?.classList.remove('text-red-300', 'text-green-300');
    }
}

function getRecordTime(record) {
    const raw = record.date || record.createdAt || record.updatedAt || '';
    const parsed = raw instanceof Date ? raw : new Date(raw);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function displayDailyTrendChart() {
    if (!expenses.length) {
        return;
    }

    const dailyTotals = getDailyTotals(expenses);
    const now = new Date();
    const labels = [];
    const data = [];

    for (let offset = 6; offset >= 0; offset -= 1) {
        const date = new Date(now);
        date.setDate(now.getDate() - offset);
        labels.push(date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
        data.push(dailyTotals.get(normalizeDateKey(date)) || 0);
    }

    const ctx = document.getElementById('dailyTrendChart')?.getContext('2d');
    if (ctx) {
        dailyTrendChartInstance?.destroy();
        dailyTrendChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: '#15803d',
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: (value) => '₱' + value }
                    }
                }
            }
        });
    }
}

function displayCategoryChart() {
    if (!expenses.length) {
        return;
    }

    const categoryData = new Map();
    expenses.forEach(exp => {
        const cat = exp.category || 'Other';
        categoryData.set(cat, (categoryData.get(cat) || 0) + getExpenseAmount(exp));
    });

    const colors = ['#15803d', '#16a34a', '#22c55e', '#4ade80', '#86efac'];
    const chartData = Array.from(categoryData.entries()).map(([label, value], idx) => ({
        label,
        value,
        color: colors[idx % colors.length]
    }));

    const ctx = document.getElementById('categoryPieChart')?.getContext('2d');
    if (ctx) {
        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: chartData.map(d => d.label),
                datasets: [{
                    data: chartData.map(d => d.value),
                    backgroundColor: chartData.map(d => d.color)
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
    }

    // Update legend
    const legend = document.getElementById('categoryLegend');
    if (legend) {
        legend.innerHTML = chartData.map(item => `
            <div class="flex items-center justify-between py-2 border-b border-gray-100">
                <div class="flex items-center gap-2">
                    <div class="w-3 h-3 rounded-full" style="background-color: ${item.color}"></div>
                    <span class="text-gray-700 text-sm">${item.label}</span>
                </div>
                <span class="font-medium text-gray-800">₱${item.value.toFixed(2)}</span>
            </div>
        `).join('');
    }
}

function displayRecentExpenses() {
    const recentList = document.getElementById('recentExpensesList');
    if (!recentList) return;

    if (!expenses.length) {
        recentList.innerHTML = '<div class="text-gray-500 text-sm py-3">No records yet</div>';
        return;
    }

    recentList.innerHTML = expenses.slice(0, 6).map(exp => {
        const date = new Date(exp.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        return `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all">
                <div class="flex-1">
                    <div class="flex items-center gap-2 flex-wrap">
                        <p class="text-gray-800 font-medium">${exp.title}</p>
                        ${exp.motorcycleName ? `<span class="text-xs bg-green-700 text-white px-2 py-1 rounded-full font-medium">${exp.motorcycleName}</span>` : ''}
                    </div>
                    <p class="text-xs text-gray-500">${date} • ${exp.category}</p>
                </div>
                <div class="flex items-center gap-3">
                        <p class="font-bold text-green-700">₱${getExpenseAmount(exp).toFixed(2)}</p>
                    <button class="delete-expense-btn" data-expense-id="${exp.id}" title="Delete">
                        <i class="lucide lucide-trash-2 text-red-500 text-lg"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Add delete handlers
    document.querySelectorAll('.delete-expense-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.expenseId;
            if (!confirm('Delete this expense?')) return;
            try {
                await deleteFirestoreDoc('repairs', id);
                const currentUser = auth.currentUser;
                if (currentUser) {
                    await loadExpenses(currentUser.uid);
                }
                showToast('Expense deleted', 'success');
            } catch (err) {
                showToast('Error deleting expense', 'error');
            }
        });
    });
}
