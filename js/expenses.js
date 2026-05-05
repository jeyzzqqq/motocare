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
            where('userId', '==', userId),
            orderBy('createdAt', 'desc')
        );
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            loadMockExpenses();
        } else {
            expenses = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                date: doc.data().date || doc.data().createdAt
            }));
            displayExpenses();
        }
    } catch (error) {
        console.error('Error loading expenses:', error);
        loadMockExpenses();
    }
}

function loadMockExpenses() {
    expenses = [
        { id: '1', title: 'Chain Lubrication', amount: 25, date: new Date('2026-04-15'), category: 'Maintenance', notes: 'Regular maintenance' },
        { id: '2', title: 'Battery Replacement', amount: 150, date: new Date('2026-04-10'), category: 'Parts', notes: 'New battery installed' },
        { id: '3', title: 'Brake Pads', amount: 85, date: new Date('2026-03-28'), category: 'Parts', notes: 'Front brake pads' },
        { id: '4', title: 'Oil Change', amount: 45, date: new Date('2026-03-15'), category: 'Maintenance', notes: 'Synthetic oil' },
        { id: '5', title: 'Tire Replacement', amount: 120, date: new Date('2026-02-20'), category: 'Parts', notes: 'Front tire' },
        { id: '6', title: 'Air Filter', amount: 30, date: new Date('2026-02-10'), category: 'Maintenance', notes: 'Engine air filter' }
    ];
    displayExpenses();
}

function displayExpenses() {
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
    document.getElementById('totalExpenses').textContent = `$${total.toFixed(2)}`;
    document.getElementById('thisMonthExpense').textContent = `$${thisMonth.toFixed(2)}`;
    document.getElementById('avgMonthExpense').textContent = `$${monthlyAverage.toFixed(2)}`;
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
                labels: labels.length ? labels : ['Jan', 'Feb', 'Mar', 'Apr'],
                datasets: [{
                    label: 'Monthly Expenses',
                    data: data.length ? data : [120, 335, 130, 175],
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
                        ticks: { callback: (value) => '$' + value }
                    }
                }
            }
        });
    }
}

function displayCategoryChart() {
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
                labels: chartData.length ? chartData.map(d => d.label) : ['Tires', 'Oil', 'Brakes', 'Battery', 'Misc'],
                datasets: [{
                    data: chartData.length ? chartData.map(d => d.value) : [320, 90, 85, 150, 115],
                    backgroundColor: chartData.length ? chartData.map(d => d.color) : ['#15803d', '#16a34a', '#22c55e', '#4ade80', '#86efac']
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
                <span class="font-medium text-gray-800">$${item.value.toFixed(2)}</span>
            </div>
        `).join('');
    }
}

function displayRecentExpenses() {
    const recentList = document.getElementById('recentExpensesList');
    if (!recentList) return;

    recentList.innerHTML = expenses.slice(0, 6).map(exp => {
        const date = new Date(exp.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        return `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all">
                <div class="flex-1">
                    <p class="text-gray-800 font-medium">${exp.title}</p>
                    <p class="text-xs text-gray-500">${date} • ${exp.category}</p>
                </div>
                <div class="flex items-center gap-3">
                    <p class="font-bold text-green-700">$${exp.amount?.toFixed(2)}</p>
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
                await loadExpenses(auth.currentUser.uid);
                showToast('Expense deleted', 'success');
            } catch (err) {
                showToast('Error deleting expense', 'error');
            }
        });
    });
}
