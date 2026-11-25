import { auth, db } from './firebase-config.js?v=3';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";
import { deleteFirestoreDoc, cleanupOrphanedMotorcycleRecords } from './firebaseUtils.js';
import { normalizeRecord } from './utils-module.js';

let expenses = [];
let registeredMotorcycles = [];
let pendingUserId = null;
let isDomReady = document.readyState !== 'loading';
let hasRenderedExpenseAnimations = false;

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

        registeredMotorcycles = motorcyclesSnapshot.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .filter((motorcycle) => motorcycle.deleted !== true);
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

window.addEventListener('addrecord:saved', () => {
    if (auth.currentUser) startExpensesLoad(auth.currentUser.uid);
});

function renderEmptyState() {
    expenses = [];
    if (!canRenderExpenses()) return;

    setText('expenseDateRange', `No expenses logged · Total ${formatCurrency(0)}`);
    setText('totalExpenses', formatCurrency(0));
    setText('totalDateRange', 'No expenses logged');
    setText('thisMonthExpense', formatCurrency(0));
    setText('currentMonth', new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));

    displayMonthlySpending();
    displayBikeSpending();
    displayRecentExpenses();
    hasRenderedExpenseAnimations = true;
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
    setText('expenseDateRange', rangeText);
    setText('expenseDateRangeHeader', rangeText);
    setText('totalExpenses', formatPeso(total));
    setText('totalDateRange', rangeText);
    setText('thisMonthExpense', formatPeso(thisMonthTotal));
    setText('currentMonth', now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));

    const shouldAnimate = !hasRenderedExpenseAnimations;
    animateCurrencyValue(document.getElementById('totalExpenses'), total, shouldAnimate);
    const thisMonthElement = document.getElementById('thisMonthExpense');
    if (thisMonthElement) {
        thisMonthElement.classList.toggle('is-animated-value', shouldAnimate);
        if (shouldAnimate) {
            thisMonthElement.style.opacity = '0';
            setTimeout(() => { thisMonthElement.style.opacity = '1'; }, 900);
        }
    }

    displayMonthlySpending(shouldAnimate);
    displayBikeSpending(shouldAnimate);
    displayRecentExpenses(shouldAnimate);
    hasRenderedExpenseAnimations = true;
}

function getExpenseDate(expense = {}) {
    const raw = expense.date || expense.createdAt || expense.updatedAt;
    if (raw?.toDate) return raw.toDate();
    const date = raw instanceof Date ? raw : new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatPeso(amount) {
    return formatCurrency(amount);
}

function formatDateRange(start, end) {
    const startLabel = start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const endLabel = end.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}

function monthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function observeOnce(element, callback) {
    if (!('IntersectionObserver' in window)) {
        callback();
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        callback();
    }, { threshold: 0.15 });
    observer.observe(element);
}

function animateCurrencyValue(element, value, shouldAnimate) {
    if (!element || !shouldAnimate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        if (element) element.textContent = formatPeso(value);
        return;
    }

    const startedAt = performance.now();
    const duration = 900;
    const tick = (now) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = 1 - ((1 - progress) ** 3);
        element.textContent = formatPeso(value * eased);
        if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

function displayMonthlySpending(shouldAnimate = false) {
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
    container.innerHTML = `
        <div class="expense-chart-bars">
            ${months.map((month, index) => {
                const height = maxValue ? Math.max(8, (month.value / maxValue) * 100) : 8;
                return `<div class="expense-chart-column"><span class="month-bar ${index === months.length - 1 ? 'is-latest' : ''}" style="--bar-height:${height}%;--bar-index:${index}" title="${month.label}: ${formatPeso(month.value)}"></span></div>`;
            }).join('')}
        </div>
        <div class="expense-month-labels">${months.map((month) => `<span>${month.label}</span>`).join('')}</div>`;
    container.classList.toggle('is-animated', shouldAnimate);
    container.classList.remove('is-visible');
    if (shouldAnimate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        observeOnce(container, () => container.classList.add('is-visible'));
    } else {
        container.classList.add('is-visible');
    }
}

function formatCompactPeso(value) {
    if (value >= 1000) return `P${(value / 1000).toFixed(value % 1000 ? 2 : 0)}k`;
    return `P${Math.round(value).toLocaleString('en-US')}`;
}

function displayBikeSpending(shouldAnimate = false) {
    const container = document.getElementById('bikeSpendingList');
    if (!container) return;

    if (!registeredMotorcycles.length) {
        const emptyState = document.createElement('p');
        emptyState.className = 'expense-empty';
        emptyState.append(document.createTextNode("You don't have any motorcycles yet. "));

        const motorcyclesLink = document.createElement('a');
        motorcyclesLink.href = 'motorcycles.html';
        motorcyclesLink.textContent = 'Go to the Motorcycles page';
        emptyState.append(motorcyclesLink);
        container.replaceChildren(emptyState);
        return;
    }

    const bikeTotals = new Map(registeredMotorcycles.map((motorcycle) => [
        String(motorcycle.id),
        { motorcycle, amount: 0 }
    ]));
    expenses.forEach((expense) => {
        const bikeTotal = bikeTotals.get(String(expense.motorcycleId || ''));
        if (bikeTotal) bikeTotal.amount += getExpenseAmount(expense);
    });

    const bikeSpending = Array.from(bikeTotals.values()).sort((left, right) => right.amount - left.amount);
    const grandTotal = bikeSpending.reduce((sum, bike) => sum + bike.amount, 0);
    container.replaceChildren();

    bikeSpending.forEach(({ motorcycle, amount }, index) => {
        const name = motorcycle.motorcycleName
            || `${motorcycle.brand || ''} ${motorcycle.model || ''}`.trim()
            || 'Unnamed bike';
        const percentage = grandTotal ? (amount / grandTotal) * 100 : 0;
        const row = document.createElement('div');
        row.className = 'bike-spending-row';
        row.style.setProperty('--bike-index', index);

        const head = document.createElement('div');
        head.className = 'bike-spending-head';
        const bikeName = document.createElement('span');
        bikeName.className = 'bike-spending-name';
        bikeName.textContent = name;
        const spendingAmount = document.createElement('span');
        spendingAmount.className = 'bike-spending-amount';
        spendingAmount.textContent = `${formatPeso(amount)} · ${Math.round(percentage)}%`;
        head.append(bikeName, spendingAmount);

        const progressTrack = document.createElement('div');
        progressTrack.className = 'progress-track';
        const progressFill = document.createElement('div');
        progressFill.className = 'progress-fill';
        progressFill.dataset.progress = String(percentage);
        progressTrack.append(progressFill);
        row.append(head, progressTrack);
        container.append(row);
    });

    if (shouldAnimate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        observeOnce(container, () => {
            container.querySelectorAll('.progress-fill').forEach((fill, index) => {
                const progress = Math.max(0, Math.min(100, Number(fill.dataset.progress) || 0));
                setTimeout(() => { fill.style.width = `${progress}%`; }, index * 100);
            });
        });
    } else {
        container.querySelectorAll('.progress-fill').forEach((fill) => {
            const progress = Math.max(0, Math.min(100, Number(fill.dataset.progress) || 0));
            fill.style.width = `${progress}%`;
        });
    }
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
        const theme = getExpenseChartTheme();
        dailyTrendChartInstance?.destroy();
        dailyTrendChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: theme.dark ? theme.primary : '#15803d',
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    ...(theme.dark ? { tooltip: theme.tooltip } : {})
                },
                scales: {
                    x: {
                        ...(theme.dark ? {
                            grid: { color: theme.border },
                            ticks: { color: theme.text }
                        } : {})
                    },
                    y: {
                        beginAtZero: true,
                        ...(theme.dark ? { grid: { color: theme.border } } : {}),
                        ticks: {
                            ...(theme.dark ? { color: theme.text } : {}),
                            callback: (value) => '₱' + value
                        }
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

    const theme = getExpenseChartTheme();
    const colors = theme.dark
        ? [theme.primary, theme.onTrack, theme.upcoming, theme.text, theme.dueSoon]
        : ['#15803d', '#16a34a', '#22c55e', '#4ade80', '#86efac'];
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
                plugins: {
                    legend: { display: false },
                    ...(theme.dark ? { tooltip: theme.tooltip } : {})
                }
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

function getExpenseChartTheme() {
    const dark = document.documentElement.dataset.theme === 'dark';
    const rootStyles = getComputedStyle(document.documentElement);
    const readColor = (name, fallback) => rootStyles.getPropertyValue(name).trim() || fallback;

    return {
        dark,
        primary: readColor('--moto-primary', '#4CAF50'),
        text: readColor('--moto-muted', '#A6B2A7'),
        border: readColor('--moto-border', '#2A352D'),
        onTrack: readColor('--moto-on-track-text', '#81C784'),
        upcoming: readColor('--moto-upcoming-text', '#A3ADA4'),
        dueSoon: readColor('--moto-due-soon-text', '#FCD34D'),
        tooltip: {
            backgroundColor: readColor('--moto-elevated', '#202B23'),
            titleColor: readColor('--moto-text', '#E8EEE8'),
            bodyColor: readColor('--moto-text', '#E8EEE8'),
            borderColor: readColor('--moto-border', '#2A352D'),
            borderWidth: 1
        }
    };
}

function displayRecentExpenses(shouldAnimate = false) {
    const recentList = document.getElementById('recentExpensesList');
    if (!recentList) return;

    if (!expenses.length) {
        recentList.innerHTML = '<div class="px-4 py-5 text-center text-xs text-gray-500">No expenses logged</div>';
        return;
    }

    recentList.classList.toggle('is-animated', shouldAnimate);
    recentList.classList.remove('is-visible');
    recentList.innerHTML = expenses.slice(0, 6).map((exp, index) => {
        const dateValue = getExpenseDate(exp);
        const date = dateValue ? dateValue.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unavailable';
        return `
            <div class="expense-log-row" style="--row-index:${index}">
                <span class="expense-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h16v18l-3-2-3 2-2-2-3 2-2-2-3 2V3Z"/><path d="M8 8h8M8 12h8M8 16h4"/></svg></span>
                <div class="expense-log-copy">
                    <p class="expense-log-title">${exp.title || 'Untitled expense'}</p>
                    <p class="expense-log-subtitle">${exp.motorcycleName || 'Unassigned bike'} · ${date}</p>
                </div>
                <p class="expense-log-amount">${formatPeso(getExpenseAmount(exp))}</p>
                <button class="delete-expense-btn expense-delete-hidden" data-expense-id="${exp.id}" title="Delete expense" aria-label="Delete expense"></button>
            </div>
        `;
    }).join('');

    if (shouldAnimate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        observeOnce(recentList, () => recentList.classList.add('is-visible'));
    } else {
        recentList.classList.add('is-visible');
    }

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
