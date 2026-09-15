import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { deleteFirestoreDoc, cleanupOrphanedMotorcycleRecords } from './firebaseUtils.js';
import { normalizeRecord } from './utils-module.js';

let expenses = [];
let registeredMotorcycles = [];
let pendingUserId = null;
let isDomReady = document.readyState !== 'loading';

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

        registeredMotorcycles = motorcyclesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
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

    setText('expenseDateRange', 'No expenses logged · Total ₱0');
    setText('totalExpenses', '₱0');
    setText('totalDateRange', 'No expenses logged');
    setText('thisMonthExpense', '₱0');
    setText('currentMonth', new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));

    const recentList = document.getElementById('recentExpensesList');
    if (recentList) {
        recentList.innerHTML = '<div class="px-4 py-5 text-center text-xs text-gray-500">No expenses logged</div>';
    }

    const monthlyChart = document.getElementById('monthlySpendingChart');
    if (monthlyChart) {
        monthlyChart.innerHTML = '<div class="flex h-36 items-center justify-center rounded-lg bg-gray-50 text-xs text-gray-500">No expenses logged</div>';
    }

    const bikeList = document.getElementById('bikeSpendingList');
    if (bikeList) {
        displayBikeSpending(0);
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
    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const thisMonthTotal = expenses.reduce((sum, expense) => {
        const date = getExpenseDate(expense);
        return date && `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` === thisMonthKey
            ? sum + getExpenseAmount(expense)
            : sum;
    }, 0);

    const dates = expenses.map(getExpenseDate).filter(Boolean).sort((a, b) => a - b);
    const rangeText = dates.length ? formatDateRange(dates[0], dates[dates.length - 1]) : 'No expenses logged';
    setText('expenseDateRange', `${rangeText} · Total ${formatPeso(total)}`);
    setText('totalExpenses', formatPeso(total));
    setText('totalDateRange', rangeText);
    setText('thisMonthExpense', formatPeso(thisMonthTotal));
    setText('currentMonth', now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));

    displayMonthlySpending();
    displayBikeSpending(total);
    displayRecentExpenses();
}

function getExpenseDate(expense = {}) {
    const raw = expense.date || expense.createdAt || expense.updatedAt;
    if (raw?.toDate) return raw.toDate();
    const date = raw instanceof Date ? raw : new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatPeso(amount) {
    return `₱${Number(amount || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function formatDateRange(start, end) {
    const startLabel = start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const endLabel = end.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}

function monthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function displayMonthlySpending() {
    const container = document.getElementById('monthlySpendingChart');
    if (!container) return;

    const totals = new Map();
    expenses.forEach((expense) => {
        const date = getExpenseDate(expense);
        if (date) totals.set(monthKey(date), (totals.get(monthKey(date)) || 0) + getExpenseAmount(expense));
    });

    const availableDates = expenses.map(getExpenseDate).filter(Boolean).sort((a, b) => a - b);
    const latest = availableDates[availableDates.length - 1] || new Date();
    const first = new Date(latest.getFullYear(), latest.getMonth() - 5, 1);
    const months = [];
    for (let index = 0; index < 6; index += 1) {
        const date = new Date(first.getFullYear(), first.getMonth() + index, 1);
        months.push({ key: monthKey(date), label: date.toLocaleDateString('en-US', { month: 'short' }), value: totals.get(monthKey(date)) || 0 });
    }

    const maxValue = Math.max(...months.map((month) => month.value), 0);
    const axisMax = maxValue ? Math.ceil(maxValue / 4) * 4 : 4;
    const axisLabels = [axisMax, axisMax * .75, axisMax * .5, axisMax * .25, 0];
    container.innerHTML = `
        <div class="flex gap-2">
            <div class="flex h-36 flex-col justify-between py-0.5 text-[8px] text-gray-400">
                ${axisLabels.map((value) => `<span>${formatCompactPeso(value)}</span>`).join('')}
            </div>
            <div class="relative flex min-w-0 flex-1 flex-col">
                <div class="pointer-events-none absolute inset-x-0 top-0 flex h-28 flex-col justify-between">
                    ${axisLabels.slice(0, -1).map(() => '<span class="border-t border-dashed border-gray-100"></span>').join('')}
                </div>
                <div class="relative z-10 flex h-28 items-end justify-around gap-2">
                    ${months.map((month, index) => `<div class="flex h-full flex-1 items-end justify-center"><span class="month-bar ${index === months.length - 1 ? 'is-latest' : ''}" style="height: ${month.value ? Math.max(3, (month.value / axisMax) * 100) : 3}%" title="${month.label}: ${formatPeso(month.value)}"></span></div>`).join('')}
                </div>
                <div class="mt-2 flex justify-around gap-2 text-[9px] text-gray-400">${months.map((month) => `<span class="flex-1 text-center">${month.label}</span>`).join('')}</div>
            </div>
        </div>`;
}

function formatCompactPeso(value) {
    if (value >= 1000) return `P${(value / 1000).toFixed(value % 1000 ? 2 : 0)}k`;
    return `P${Math.round(value).toLocaleString('en-US')}`;
}

function displayBikeSpending(total) {
    const container = document.getElementById('bikeSpendingList');
    if (!container) return;

    const bikeTotals = new Map();
    registeredMotorcycles.forEach((motorcycle) => {
        const name = motorcycle.motorcycleName || `${motorcycle.brand || ''} ${motorcycle.model || ''}`.trim() || 'Unnamed bike';
        bikeTotals.set(name, 0);
    });
    expenses.forEach((expense) => {
        const name = expense.motorcycleName || 'Unassigned bike';
        bikeTotals.set(name, (bikeTotals.get(name) || 0) + getExpenseAmount(expense));
    });

    const colors = ['#e33434', '#1976d2', '#e68a1e', '#7c4dca', '#2e9e4f'];
    container.innerHTML = Array.from(bikeTotals.entries()).map(([name, amount], index) => {
        const percentage = total ? (amount / total) * 100 : 0;
        const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'BK';
        const color = colors[index % colors.length];
        const emptyLabel = amount === 0 ? '<span class="ml-8 mt-1 block text-[9px] text-gray-400">No expenses logged</span>' : `<div class="progress-track ml-8 mt-1"><div class="progress-fill" style="width:${percentage}%;background:${color}"></div></div>`;
        return `<div class="mb-3 last:mb-0"><div class="flex items-center gap-2"><span class="grid h-6 w-6 place-items-center rounded-full text-[8px] font-bold text-white" style="background:${color}">${initials}</span><span class="min-w-0 flex-1 truncate text-[10px]">${name}</span><span class="text-[10px] font-bold">${formatPeso(amount)}</span><span class="w-7 text-right text-[9px] text-gray-400">${Math.round(percentage)}%</span></div>${emptyLabel}</div>`;
    }).join('') || '<p class="py-3 text-xs text-gray-500">No expenses logged</p>';
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
    if (raw?.toDate) return raw.toDate().getTime();
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
        recentList.innerHTML = '<div class="px-4 py-5 text-center text-xs text-gray-500">No expenses logged</div>';
        return;
    }

    recentList.innerHTML = expenses.slice(0, 6).map(exp => {
        const dateValue = getExpenseDate(exp);
        const date = dateValue ? dateValue.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unavailable';
        const category = String(exp.category || '').toLowerCase();
        const icon = category.includes('tire') ? 'circle-dot' : category.includes('oil') ? 'droplets' : category.includes('brake') ? 'disc-3' : 'wrench';
        return `
            <div class="expense-log-row flex items-center gap-3 border-b border-gray-100 px-3 last:border-b-0">
                <span class="expense-icon bg-green-50 text-green-700"><i class="lucide lucide-${icon} text-sm"></i></span>
                <div class="min-w-0 flex-1 py-3">
                    <p class="truncate text-[10px] font-bold text-gray-800">${exp.title || 'Untitled expense'}</p>
                    <p class="mt-0.5 truncate text-[9px] text-gray-400">${exp.motorcycleName || 'Unassigned bike'} · ${date}</p>
                </div>
                <div class="flex items-center gap-2">
                    <p class="whitespace-nowrap text-[10px] font-bold text-gray-900">${formatPeso(getExpenseAmount(exp))}</p>
                    <button class="delete-expense-btn p-1" data-expense-id="${exp.id}" title="Delete expense" aria-label="Delete expense">
                        <i class="lucide lucide-trash-2 text-sm text-gray-300"></i>
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
