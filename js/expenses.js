import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, query, where, getDocs, orderBy, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let expenses = [];

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
            orderBy('createdAt', 'desc')
        );
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            renderEmptyState();
        } else {
            expenses = querySnapshot.docs
                .map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    date: doc.data().date || doc.data().createdAt,
                    amount: doc.data().cost || 0
                }))
                .filter(exp => exp.uid === userId);
            displayExpenses();
        }
    } catch (error) {
        console.error('Error loading expenses:', error);
        renderEmptyState();
    }
}

function renderEmptyState() {
    expenses = [];
    document.getElementById('totalExpenses').textContent = '₱0.00';
    document.getElementById('thisMonthExpense').textContent = '₱0.00';
    document.getElementById('avgMonthExpense').textContent = '₱0.00';
    document.getElementById('currentMonth').textContent = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const recentList = document.getElementById('recentExpensesList');
    if (recentList) {
        recentList.innerHTML = '<div class="text-gray-500 text-sm py-3">No records yet</div>';
    }

    const trendChart = document.getElementById('monthlyTrendChart');
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

    const total = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
    const now = new Date();
    const thisMonth = expenses
        .filter(exp => {
            const date = new Date(exp.date);
            return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        })
        .reduce((sum, exp) => sum + (exp.amount || 0), 0);

    const monthlyAverage = calculateMonthlyAverage(expenses);

    // Update header stats
    document.getElementById('totalExpenses').textContent = `₱${total.toFixed(2)}`;
    document.getElementById('thisMonthExpense').textContent = `₱${thisMonth.toFixed(2)}`;
    document.getElementById('avgMonthExpense').textContent = `₱${monthlyAverage.toFixed(2)}`;
    document.getElementById('currentMonth').textContent = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Display trend (monthly)
    displayMonthlyTrendChart();
    
    // Display category breakdown
    displayCategoryChart();

    // Display recent expenses
    displayRecentExpenses();
}

function calculateMonthlyAverage(expenses) {
    if (expenses.length === 0) return 0;
    const monthSet = new Set();
    expenses.forEach(exp => {
        const date = new Date(exp.date);
        monthSet.add(`${date.getFullYear()}-${date.getMonth()}`);
    });
    const total = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
    return total / Math.max(1, monthSet.size);
}

function displayMonthlyTrendChart() {
    if (!expenses.length) {
        return;
    }

    const monthlyData = new Map();
    expenses.forEach(exp => {
        const date = new Date(exp.date);
        const key = `${date.getFullYear()}-${date.getMonth()}`;
        monthlyData.set(key, (monthlyData.get(key) || 0) + (exp.amount || 0));
    });

    const sortedEntries = Array.from(monthlyData.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-4);

    const labels = sortedEntries.map(([key, _]) => {
        const [year, month] = key.split('-').map(Number);
        return new Date(year, month, 1).toLocaleDateString('en-US', { month: 'short' });
    });
    const data = sortedEntries.map(([_, value]) => value);

    const ctx = document.getElementById('monthlyTrendChart')?.getContext('2d');
    if (ctx) {
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Monthly Expenses',
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
        categoryData.set(cat, (categoryData.get(cat) || 0) + (exp.amount || 0));
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
                    <p class="text-gray-800 font-medium">${exp.title}</p>
                    <p class="text-xs text-gray-500">${date} • ${exp.category}</p>
                </div>
                <div class="flex items-center gap-3">
                    <p class="font-bold text-green-700">₱${exp.amount?.toFixed(2)}</p>
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
                await deleteDoc(doc(db, 'repairs', id));
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
