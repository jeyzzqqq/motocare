import { deleteUserRecord, listUserRecords, logoutUser, onAuthChange, saveUserRecord } from "./firebase.js";
import { formatDate, integer, money, populateUserIdentity, renderSummaryCards, setActiveNav } from "./ui.js";

const statsTarget = document.getElementById("repairStats");
const listTarget = document.getElementById("repairList");
const searchInput = document.getElementById("repairSearch");
const logoutButton = document.getElementById("logoutButton");
const editModal = document.getElementById("editRepairModal");
const editForm = document.getElementById("editRepairForm");
const editTitle = document.getElementById("editRepairTitle");
const editType = document.getElementById("editRepairType");
const editDate = document.getElementById("editRepairDate");
const editCost = document.getElementById("editRepairCost");
const editNotes = document.getElementById("editRepairNotes");
const editMessage = document.getElementById("editRepairMessage");

let cachedRepairs = [];
let currentEditingRepair = null;

function renderRepair(repair) {
  return `
    <article class="record-card">
      <div class="flex items-start justify-between gap-4">
        <div class="record-main">
          <span class="card-icon"><i class="fa-solid fa-wrench"></i></span>
          <div>
            <div class="flex flex-wrap items-center gap-3">
              <h3 class="text-lg font-extrabold tracking-tight text-slate-900">${repair.title}</h3>
              <span class="badge-soft">${repair.type || "Repair"}</span>
            </div>
            <div class="record-meta">
              <span><i class="fa-regular fa-calendar"></i> ${formatDate(repair.date)}</span>
              <span><i class="fa-solid fa-dollar-sign"></i> ${money(repair.cost)}</span>
            </div>
            <p class="mt-3">${repair.notes || "No notes available."}</p>
            <div class="mt-3 flex flex-wrap gap-2">
              <button class="secondary-button edit-repair" data-record-id="${repair.id}">Edit</button>
              <button class="secondary-button delete-repair" data-record-id="${repair.id}">Delete</button>
            </div>
          </div>
        </div>
        <div class="text-right min-w-[90px]">
          <div class="status-chip pending justify-center"><i class="fa-regular fa-file-lines"></i> Receipt</div>
          <div class="mt-4">
            ${repair.receiptUrl
              ? `<a class="secondary-button inline-flex items-center justify-center" href="${repair.receiptUrl}" target="_blank" rel="noreferrer">Open receipt</a>`
              : `<div class="empty-state text-center">No receipt uploaded</div>`}
          </div>
        </div>
      </div>
    </article>
  `;
}

function updateStats() {
  const totalSpent = cachedRepairs.reduce((sum, repair) => sum + Number(repair.cost || 0), 0);
  const receipts = cachedRepairs.filter((repair) => repair.receiptUrl).length;
  const average = cachedRepairs.length ? totalSpent / cachedRepairs.length : 0;

  renderSummaryCards(statsTarget, [
    { label: "Total repairs", value: integer(cachedRepairs.length), detail: "Logged repair entries", icon: "fa-toolbox", primary: true },
    { label: "Total spent", value: money(totalSpent), detail: "All repair costs", icon: "fa-dollar-sign" },
    { label: "Average repair", value: money(average), detail: "Per repair average", icon: "fa-chart-simple" },
    { label: "Receipts", value: integer(receipts), detail: "Attachment previews", icon: "fa-file-image" }
  ]);
}

function openEditModal(repair) {
  currentEditingRepair = repair;
  editTitle.value = repair.title || "";
  editType.value = repair.type || "";
  editDate.value = repair.date || "";
  editCost.value = repair.cost || "";
  editNotes.value = repair.notes || "";
  editMessage.classList.add("hidden");
  editModal.showModal();
}

function closeEditModal() {
  editModal.close();
  currentEditingRepair = null;
}

function showEditMessage(text, tone = "neutral") {
  editMessage.textContent = text;
  editMessage.className = `empty-state ${tone === "error" ? "border-red-200 bg-red-50 text-red-700" : tone === "success" ? "border-green-200 bg-green-50 text-green-700" : ""}`.trim();
  editMessage.classList.remove("hidden");
}

function wireActions() {
  document.querySelectorAll(".edit-repair").forEach((button) => {
    button.addEventListener("click", async () => {
      const current = cachedRepairs.find((repair) => repair.id === button.dataset.recordId);
      if (!current) {
        return;
      }
      openEditModal(current);
    });
  });

  document.querySelectorAll(".delete-repair").forEach((button) => {
    button.addEventListener("click", async () => {
      const recordId = button.dataset.recordId;
      if (!recordId || !window.confirm("Delete this repair record?")) {
        return;
      }
      await deleteUserRecord("repairs", recordId);
      await refreshData();
      applyFilter();
    });
  });
}

function applyFilter() {
  const query = searchInput?.value.trim().toLowerCase() || "";
  const filtered = cachedRepairs.filter((repair) => {
    const haystack = `${repair.title} ${repair.type} ${repair.notes}`.toLowerCase();
    return haystack.includes(query);
  });

  listTarget.innerHTML = filtered.length
    ? filtered.map((repair) => renderRepair(repair)).join("")
    : '<div class="empty-state">No repairs matched your search.</div>';

  wireActions();
}

async function refreshData() {
  listTarget.innerHTML = '<div class="empty-state">Loading repairs...</div>';
  cachedRepairs = await listUserRecords("repairs");
  updateStats();
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

    if (!currentEditingRepair) {
      return;
    }

    const title = editTitle.value.trim();
    if (!title) {
      showEditMessage("Title is required.", "error");
      return;
    }

    try {
      await saveUserRecord("repairs", {
        ...currentEditingRepair,
        title,
        type: editType.value.trim() || "Repair",
        date: editDate.value,
        cost: Number(editCost.value || 0),
        notes: editNotes.value.trim()
      }, currentEditingRepair.id);
      
      closeEditModal();
      await refreshData();
      applyFilter();
    } catch (error) {
      showEditMessage(error?.message || "Could not save repair.", "error");
    }
  });
}

async function boot(user) {
  setActiveNav("repairs");
  populateUserIdentity(user);
  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      await logoutUser();
      window.location.replace("./login.html");
    });
  }

  await refreshData();
  searchInput?.addEventListener("input", applyFilter);
  applyFilter();
}

onAuthChange((user) => {
  if (!user) {
    window.location.replace("./login.html");
    return;
  }
  boot(user).catch((error) => {
    console.error(error);
    listTarget.innerHTML = '<div class="empty-state border-red-200 bg-red-50 text-red-700">Could not load repairs. Please refresh.</div>';
  });
});
