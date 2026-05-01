import { deleteUserRecord, listUserRecords, logoutUser, onAuthChange } from "./firebase.js";
import { drawBarChart, drawDonutChart, formatDate, money, populateUserIdentity, setActiveNav } from "./ui.js";

const heroTarget = document.getElementById("expenseHero");
const trendCanvas = document.getElementById("expenseTrendChart");
const categoryCanvas = document.getElementById("expenseCategoryChart");
const legendTarget = document.getElementById("expenseCategoryLegend");
const recentTarget = document.getElementById("recentExpenses");
const logoutButton = document.getElementById("logoutButton");

let cachedExpenses = [];

function monthLabel(dateValue) {
  return new Date(dateValue).toLocaleDateString("en-US", { month: "short" });
}

function buildTrend(expenses) {
  const buckets = new Map();
  expenses.forEach((expense) => {
    const date = new Date(expense.date || expense.createdAt || Date.now());
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    buckets.set(key, (buckets.get(key) || 0) + Number(expense.amount || 0));
  });
  return [...buckets.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .slice(-4)
    .map(([key, value]) => {
      const [year, month] = key.split("-").map(Number);
      return { label: monthLabel(new Date(year, month, 1)), value };
    });
}

function buildCategories(expenses) {
  const buckets = new Map();
  expenses.forEach((expense) => {
    const key = expense.category || expense.title || "Other";
    buckets.set(key, (buckets.get(key) || 0) + Number(expense.amount || 0));
  });
  return [...buckets.entries()].map(([label, value], index) => ({
    label,
    value,
    color: ["#2E7D32", "#4CAF50", "#7BC47F", "#A5D6A7", "#C8E6C9"][index % 5]
  }));
}

function renderExpense(expense) {
  return `
    <article class="expense-item">
      <div class="list-item-main">
        <span class="dot"></span>
        <div>
          <h3>${expense.title}</h3>
          <p>${formatDate(expense.date)} • ${expense.category || "Expense"}</p>
          <div class="task-meta"><span><i class="fa-solid fa-circle-info"></i> ${expense.notes || "No additional notes"}</span></div>
        </div>
      </div>
      <div class="flex flex-col items-end gap-2">
        <div class="money">${money(expense.amount)}</div>
        <button class="secondary-button delete-expense" data-record-id="${expense.id}">Delete</button>
      </div>
    </article>
  `;
}

function renderDashboard() {
  const total = cachedExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const now = new Date();
  const thisMonth = cachedExpenses
    .filter((expense) => {
      const date = new Date(expense.date || Date.now());
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    })
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

  const monthKeys = new Set(cachedExpenses.map((expense) => {
    const date = new Date(expense.date || Date.now());
    return `${date.getFullYear()}-${date.getMonth()}`;
  }));
  const monthlyAverage = cachedExpenses.length ? total / Math.max(1, monthKeys.size) : 0;

  heroTarget.innerHTML = `
    <div class="section-header">
      <div>
        <h2 class="text-2xl font-extrabold tracking-tight text-slate-900">Total Expenses</h2>
        <div class="section-detail">A concise summary of your motorcycle spend.</div>
      </div>
      <span class="section-badge"><i class="fa-solid fa-wallet"></i> Budget view</span>
    </div>
    <div class="stat-card primary">
      <div class="label text-white/75">Total expenses</div>
      <div class="value">${money(total)}</div>
      <div class="detail text-white/80">${money(thisMonth)} spent this month</div>
    </div>
    <div class="grid mt-4 grid-cols-2 gap-4">
      <div class="summary-card">
        <div class="metric-label">This month</div>
        <div class="metric-value">${money(thisMonth)}</div>
        <div class="metric-detail">Current month total</div>
      </div>
      <div class="summary-card">
        <div class="metric-label">Avg / month</div>
        <div class="metric-value">${money(monthlyAverage)}</div>
        <div class="metric-detail">Recent monthly average</div>
      </div>
    </div>
  `;

  const trend = buildTrend(cachedExpenses);
  const trendSource = trend.length ? trend : [
    { label: "Jan", value: 120 },
    { label: "Feb", value: 270 },
    { label: "Mar", value: 150 },
    { label: "Apr", value: 190 }
  ];

  drawBarChart(
    trendCanvas,
    trendSource.map((item) => item.label),
    trendSource.map((item) => item.value)
  );

  const categories = buildCategories(cachedExpenses);
  const categorySource = categories.length ? categories : [
    { label: "Tires", value: 320, color: "#2E7D32" },
    { label: "Oil", value: 90, color: "#4CAF50" },
    { label: "Brakes", value: 85, color: "#7BC47F" },
    { label: "Battery", value: 150, color: "#A5D6A7" }
  ];

  drawDonutChart(categoryCanvas, categorySource, {
    centerLabel: money(total),
    centerSubLabel: "Lifetime spend"
  });

  legendTarget.innerHTML = categorySource.map((segment) => `
    <div class="legend-row">
      <span><i class="legend-swatch" style="background:${segment.color}"></i>${segment.label}</span>
      <strong>${money(segment.value)}</strong>
    </div>
  `).join("");

  recentTarget.innerHTML = cachedExpenses.length
    ? cachedExpenses.slice(0, 8).map((expense) => renderExpense(expense)).join("")
    : '<div class="empty-state">No expenses recorded yet. Your spending list will appear here.</div>';

  document.querySelectorAll(".delete-expense").forEach((button) => {
    button.addEventListener("click", async () => {
      const recordId = button.dataset.recordId;
      if (!recordId || !window.confirm("Delete this expense record?")) {
        return;
      }
      await deleteUserRecord("expenses", recordId);
      await refresh();
    });
  });
}

async function refresh() {
  recentTarget.innerHTML = '<div class="empty-state">Loading expenses...</div>';
  cachedExpenses = await listUserRecords("expenses");
  renderDashboard();
}

async function boot(user) {
  setActiveNav("expenses");
  populateUserIdentity(user);
  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      await logoutUser();
      window.location.replace("./login.html");
    });
  }

  await refresh();
}

onAuthChange((user) => {
  if (!user) {
    window.location.replace("./login.html");
    return;
  }
  boot(user).catch((error) => {
    console.error(error);
    recentTarget.innerHTML = '<div class="empty-state border-red-200 bg-red-50 text-red-700">Could not load expenses. Please refresh.</div>';
  });
});
