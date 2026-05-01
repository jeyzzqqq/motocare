import { deleteUserRecord, listUserRecords, logoutUser, onAuthChange, saveUserRecord } from "./firebase.js";
import { formatDate, integer, populateUserIdentity, renderSummaryCards, setActiveNav } from "./ui.js";

const statsTarget = document.getElementById("maintenanceStats");
const timelineTarget = document.getElementById("maintenanceTimeline");
const logoutButton = document.getElementById("logoutButton");
const editModal = document.getElementById("editMaintenanceModal");
const editForm = document.getElementById("editMaintenanceForm");
const editTitle = document.getElementById("editTaskTitle");
const editCategory = document.getElementById("editTaskCategory");
const editDate = document.getElementById("editTaskDate");
const editMileage = document.getElementById("editTaskMileage");
const editMessage = document.getElementById("editTaskMessage");

let currentEditingTask = null;

function sortByDueDate(records) {
  return [...records].sort((left, right) => new Date(left.dueDate || left.date || 0) - new Date(right.dueDate || right.date || 0));
}

function openEditModal(task) {
  currentEditingTask = task;
  editTitle.value = task.title || "";
  editCategory.value = task.category || "";
  editDate.value = task.dueDate || task.date || "";
  editMileage.value = task.mileage || "";
  editMessage.classList.add("hidden");
  editModal.showModal();
}

function closeEditModal() {
  editModal.close();
  currentEditingTask = null;
}

function showEditMessage(text, tone = "neutral") {
  editMessage.textContent = text;
  editMessage.className = `empty-state ${tone === "error" ? "border-red-200 bg-red-50 text-red-700" : tone === "success" ? "border-green-200 bg-green-50 text-green-700" : ""}`.trim();
  editMessage.classList.remove("hidden");
}

function renderTask(task) {
  const isDone = task.status === "done" || task.status === "completed";
  const stateClass = isDone ? "done" : task.status === "due" ? "due" : "pending";
  const badge = isDone ? "Completed" : task.status === "due" ? "Due now" : "Pending";

  return `
    <article class="timeline-item ${stateClass}" data-record-id="${task.id}">
      <div>
        <div class="flex flex-wrap items-center gap-3">
          <h3 class="text-lg font-extrabold tracking-tight text-slate-900">${task.title}</h3>
          <span class="status-chip ${isDone ? "" : task.status === "due" ? "warning" : "pending"}">${badge}</span>
        </div>
        <p class="mt-1">${task.category || "Maintenance"}</p>
        <div class="task-meta">
          <span><i class="fa-regular fa-calendar"></i> ${formatDate(task.dueDate || task.date)}</span>
          <span><i class="fa-solid fa-gauge-high"></i> ${task.mileage ? `${integer(task.mileage)} miles` : "Mileage not set"}</span>
        </div>
        <div class="progress-bar"><span style="width:${isDone ? 100 : task.status === "due" ? 78 : 52}%"></span></div>
      </div>
      <div class="flex flex-col items-end gap-2">
        ${isDone ? '<span class="status-chip"><i class="fa-solid fa-circle-check"></i> Done</span>' : `<button class="secondary-button mark-complete" data-record-id="${task.id}">Mark Complete</button>`}
        <button class="secondary-button edit-task" data-record-id="${task.id}">Edit</button>
        <button class="secondary-button delete-task" data-record-id="${task.id}">Delete</button>
      </div>
    </article>
  `;
}

async function refresh() {
  timelineTarget.innerHTML = '<div class="empty-state">Loading maintenance tasks...</div>';
  const tasks = sortByDueDate(await listUserRecords("maintenance"));
  const completed = tasks.filter((task) => task.status === "done" || task.status === "completed");
  const dueNow = tasks.filter((task) => task.status === "due");
  const upcoming = tasks.filter((task) => task.status !== "done" && task.status !== "completed" && task.status !== "due");

  renderSummaryCards(statsTarget, [
    { label: "Due now", value: integer(dueNow.length), detail: "Needs immediate attention", icon: "fa-triangle-exclamation", primary: true },
    { label: "Upcoming", value: integer(upcoming.length), detail: "Scheduled service items", icon: "fa-clock" },
    { label: "Completed", value: integer(completed.length), detail: "Finished service tasks", icon: "fa-circle-check" },
    { label: "Total tasks", value: integer(tasks.length), detail: "All maintenance records", icon: "fa-clipboard-list" }
  ]);

  timelineTarget.innerHTML = tasks.length
    ? tasks.map((task) => renderTask(task)).join("")
    : '<div class="empty-state">No maintenance tasks yet. Add a service plan to get started.</div>';

  document.querySelectorAll(".mark-complete").forEach((button) => {
    button.addEventListener("click", async () => {
      const currentTask = tasks.find((task) => task.id === button.dataset.recordId);
      if (!currentTask) {
        return;
      }
      await saveUserRecord("maintenance", { ...currentTask, status: "done", completedAt: new Date().toISOString() }, currentTask.id);
      await refresh();
    });
  });

  document.querySelectorAll(".edit-task").forEach((button) => {
    button.addEventListener("click", async () => {
      const currentTask = tasks.find((task) => task.id === button.dataset.recordId);
      if (!currentTask) {
        return;
      }
      openEditModal(currentTask);
    });
  });

  document.querySelectorAll(".delete-task").forEach((button) => {
    button.addEventListener("click", async () => {
      const recordId = button.dataset.recordId;
      if (!recordId || !window.confirm("Delete this maintenance task?")) {
        return;
      }
      await deleteUserRecord("maintenance", recordId);
      await refresh();
    });
  });
}

// Modal event listeners
if (editModal) {
  document.querySelectorAll("[data-modal-close]").forEach((button) => {
    button.addEventListener("click", closeEditModal);
  });

  editModal.addEventListener("click", (event) => {
    if (event.target === editModal) {
      closeEditModal();
    }
  });

  editForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    showEditMessage("");

    if (!currentEditingTask) {
      return;
    }

    const title = editTitle.value.trim();
    if (!title) {
      showEditMessage("Title is required.", "error");
      return;
    }

    try {
      await saveUserRecord("maintenance", {
        ...currentEditingTask,
        title,
        category: editCategory.value.trim() || "Maintenance",
        dueDate: editDate.value,
        date: editDate.value,
        mileage: Number(editMileage.value || 0),
        status: currentEditingTask.status || "pending"
      }, currentEditingTask.id);
      
      closeEditModal();
      await refresh();
    } catch (error) {
      showEditMessage(error?.message || "Could not save task.", "error");
    }
  });
}

async function boot(user) {
  setActiveNav("maintenance");
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
    timelineTarget.innerHTML = '<div class="empty-state border-red-200 bg-red-50 text-red-700">Could not load maintenance tasks. Please refresh.</div>';
  });
});
