import {
  getCurrentUser,
  listUserRecords,
  logoutUser,
  onAuthChange
} from "./firebase.js";
import {
  drawBarChart,
  drawDonutChart,
  formatDate,
  integer,
  money,
  populateUserIdentity,
  renderSummaryCards,
  setActiveNav
} from "./ui.js";

const statsTarget = document.getElementById("dashboardStats");
const actionsTarget = document.getElementById("dashboardActions");
const maintenanceTarget = document.getElementById("upcomingMaintenance");
const repairTarget = document.getElementById("recentRepairs");
const maintenanceBadge = document.getElementById("maintenanceCountBadge");
const repairBadge = document.getElementById("repairCountBadge");
const barCanvas = document.getElementById("monthlyTrendChart");
const donutCanvas = document.getElementById("categoryBreakdownChart");
const legendTarget = document.getElementById("categoryLegend");
const logoutButton = document.getElementById("logoutButton");

function monthKey(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function getMonthlyBuckets(records, field = "amount") {
  const buckets = new Map();
  records.forEach((record) => {
    const date = monthKey(record.date || record.createdAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, (buckets.get(key) || 0) + Number(record[field] || 0));
  });
  return [...buckets.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .slice(-4)
    .map(([key, value]) => {
      const [year, month] = key.split("-").map(Number);
      return {
        label: new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "short" }),
        value
      };
    });
}

function getCategoryBuckets(expenses) {
  const buckets = new Map();
  expenses.forEach((expense) => {
    const category = expense.category || expense.title || "Other";
    buckets.set(category, (buckets.get(category) || 0) + Number(expense.amount || 0));
  });
  return [...buckets.entries()].map(([label, value], index) => ({
    label,
    value,
    color: ["#2E7D32", "#4CAF50", "#7BC47F", "#A5D6A7", "#C8E6C9"][index % 5]
  }));
}

function renderListItem({ title, subtitle, meta, amount, statusClass = "", icon = "fa-circle" }) {
  return `
    <article class="list-item">
      <div class="list-item-main">
        <span class="dot ${statusClass}"></span>
        <div>
          <h3>${title}</h3>
          <p>${subtitle}</p>
          <div class="task-meta"><span><i class="fa-regular fa-calendar"></i> ${meta}</span></div>
        </div>
      </div>
      <div class="text-right">
        <div class="money ${amount ? "" : "text-slate-400"}">${amount || ""}</div>
      </div>
    </article>
  `;
}

function renderQuickActions() {
  actionsTarget.innerHTML = [
    {
      href: "./add-record.html?type=maintenance",
      icon: "fa-screwdriver-wrench",
      title: "Add Maintenance",
      copy: "Log service work"
    },
    {
      href: "./add-record.html?type=repairs",
      icon: "fa-toolbox",
      title: "Add Repair",
      copy: "Save repair notes"
    },
    {
      href: "./add-record.html?type=expenses",
      icon: "fa-dollar-sign",
      title: "Add Expense",
      copy: "Track spending"
    },
    {
      href: "./profile.html",
      icon: "fa-motorcycle",
      title: "View Profile",
      copy: "Review bike details"
    }
  ].map((action) => `
    <a class="quick-action" href="${action.href}">
      <span class="icon"><i class="fa-solid ${action.icon}"></i></span>
      <span class="meta"><strong>${action.title}</strong><span>${action.copy}</span></span>
    </a>
  `).join("");
}

function renderCharts(expenses) {
  const monthly = getMonthlyBuckets(expenses);
  const categories = getCategoryBuckets(expenses);

  const labels = monthly.length ? monthly.map((item) => item.label) : ["Jan", "Feb", "Mar", "Apr"];
  const values = monthly.length ? monthly.map((item) => item.value) : [120, 270, 150, 190];
  drawBarChart(barCanvas, labels, values, { colorTop: "#2E7D32", colorBottom: "#5CB85C" });

  drawDonutChart(donutCanvas, categories.length ? categories : [
    { label: "Tires", value: 320, color: "#2E7D32" },
    { label: "Oil", value: 90, color: "#4CAF50" },
    { label: "Brakes", value: 85, color: "#7BC47F" },
    { label: "Battery", value: 150, color: "#A5D6A7" }
  ], {
    centerLabel: money(expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0)),
    centerSubLabel: "Total spend"
  });

  legendTarget.innerHTML = (categories.length ? categories : [
    { label: "Tires", value: 320, color: "#2E7D32" },
    { label: "Oil", value: 90, color: "#4CAF50" },
    { label: "Brakes", value: 85, color: "#7BC47F" },
    { label: "Battery", value: 150, color: "#A5D6A7" }
  ]).map((segment) => `
    <div class="legend-row">
      <span><i class="legend-swatch" style="background:${segment.color}"></i>${segment.label}</span>
      <strong>${money(segment.value)}</strong>
    </div>
  `).join("");
}

async function boot(user) {
  setActiveNav("dashboard");
  populateUserIdentity(user);
  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      await logoutUser();
      window.location.replace("./login.html");
    });
  }

  const [motorcycles, maintenance, repairs, expenses] = await Promise.all([
    listUserRecords("motorcycles"),
    listUserRecords("maintenance"),
    listUserRecords("repairs"),
    listUserRecords("expenses")
  ]);

  const upcoming = maintenance
    .filter((task) => task.status !== "done")
    .sort((left, right) => new Date(left.dueDate || left.date || 0) - new Date(right.dueDate || right.date || 0));

  const recentRepairs = repairs.slice(0, 3);
  const totalSpent = expenses.reduce((sum, expense) => sum + Number(expense.amount || expense.cost || 0), 0);

  renderSummaryCards(statsTarget, [
    {
      label: "Upcoming reminders",
      value: integer(upcoming.length),
      detail: "Service items still pending",
      icon: "fa-bell",
      primary: true
    },
    {
      label: "Recent repairs",
      value: integer(recentRepairs.length),
      detail: "Latest repair entries",
      icon: "fa-toolbox"
    },
    {
      label: "Registered motorcycles",
      value: integer(motorcycles.length || 1),
      detail: "Active garage records",
      icon: "fa-motorcycle"
    },
    {
      label: "Total spent",
      value: money(totalSpent),
      detail: "All logged expenses",
      icon: "fa-dollar-sign"
    }
  ]);

  maintenanceBadge.textContent = `${upcoming.length} tasks`;
  repairBadge.textContent = `${recentRepairs.length} records`;

  maintenanceTarget.innerHTML = upcoming.length
    ? upcoming.slice(0, 4).map((task) => renderListItem({
      title: task.title,
      subtitle: task.category || "Maintenance",
      meta: `${formatDate(task.dueDate || task.date)} • ${task.mileage ? `${task.mileage} miles` : "Mileage not set"}`,
      amount: task.status === "due" ? "Due now" : "Pending",
      statusClass: task.status === "due" ? "due" : task.status === "done" ? "" : "pending"
    })).join("")
    : `<div class="empty-state">No maintenance reminders yet. Add tasks to stay ahead of service.</div>`;

  repairTarget.innerHTML = recentRepairs.length
    ? recentRepairs.map((repair) => `
      <article class="list-item">
        <div class="list-item-main">
          <span class="dot"></span>
          <div>
            <h3>${repair.title}</h3>
            <p>${repair.type || "Repair"}</p>
            <div class="task-meta">
              <span><i class="fa-regular fa-calendar"></i> ${formatDate(repair.date)}</span>
              <span><i class="fa-solid fa-note-sticky"></i> ${repair.notes || "No notes"}</span>
            </div>
          </div>
        </div>
        <div class="text-right">
          <div class="money">${money(repair.cost)}</div>
        </div>
      </article>
    `).join("")
    : `<div class="empty-state">No repair history found. Your recent jobs will appear here.</div>`;

  renderQuickActions();
  renderCharts(expenses);
}

onAuthChange((user) => {
  if (!user) {
    window.location.replace("./login.html");
    return;
  }
  boot(user).catch((error) => {
    console.error(error);
  });
});
