import { listUserRecords, logoutUser, onAuthChange, saveUserRecord } from "./firebase.js";
import { formatDate, money, populateUserIdentity } from "./ui.js";

const form = document.getElementById("recordForm");
const recordType = document.getElementById("recordType");
const titleInput = document.getElementById("title");
const dateInput = document.getElementById("date");
const amountInput = document.getElementById("amount");
const mileageInput = document.getElementById("mileage");
const categoryInput = document.getElementById("category");
const providerInput = document.getElementById("serviceProvider");
const notesInput = document.getElementById("notes");
const receiptInput = document.getElementById("receiptUrl");
const previewTitle = document.getElementById("previewTitle");
const previewMeta = document.getElementById("previewMeta");
const previewReceipt = document.getElementById("receiptPreview");
const message = document.getElementById("recordMessage");
const saveButton = document.getElementById("saveRecordButton");
const amountGroup = document.getElementById("amountGroup");
const logoutButton = document.getElementById("logoutButton");

const params = new URLSearchParams(window.location.search);
const typeFromQuery = params.get("type");

function showMessage(text, tone = "neutral") {
  if (!message) {
    return;
  }
  message.textContent = text;
  message.className = `empty-state ${tone === "error" ? "border-red-200 bg-red-50 text-red-700" : tone === "success" ? "border-green-200 bg-green-50 text-green-700" : ""}`.trim();
  message.classList.remove("hidden");
}

function clearMessage() {
  message?.classList.add("hidden");
}

function currentCollection() {
  return recordType.value;
}

function updatePreview() {
  const type = currentCollection();
  const title = titleInput.value.trim() || "Untitled record";
  const date = dateInput.value || new Date().toISOString().slice(0, 10);
  previewTitle.textContent = title;
  previewMeta.textContent = `${type.charAt(0).toUpperCase() + type.slice(1)} • ${formatDate(date)}`;

  if (receiptInput.value.trim()) {
    previewReceipt.innerHTML = `
      <img src="${receiptInput.value.trim()}" alt="Receipt preview" class="w-full rounded-[20px] object-cover shadow-lg" />
    `;
  } else {
    previewReceipt.textContent = "Receipt preview will appear here if you paste a URL.";
  }
}

function updateFieldLabels() {
  const type = currentCollection();
  const isExpense = type === "expenses";
  amountGroup.querySelector("label").textContent = isExpense ? "Amount" : "Cost / Amount";
  amountInput.placeholder = isExpense ? "115" : "150";
  providerInput.placeholder = type === "maintenance" ? "Self Service" : type === "repairs" ? "City Moto Shop" : "Vendor";
  categoryInput.placeholder = type === "maintenance" ? "Engine / Brakes / Tires" : type === "repairs" ? "Repair type" : "Fuel / Parts / Accessories";
}

function setDefaults() {
  dateInput.value = new Date().toISOString().slice(0, 10);
  recordType.value = typeFromQuery && ["maintenance", "repairs", "expenses"].includes(typeFromQuery) ? typeFromQuery : "maintenance";
  updateFieldLabels();
  updatePreview();
}

async function boot(user) {
  populateUserIdentity(user);
  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      await logoutUser();
      window.location.replace("./login.html");
    });
  }

  const motorcycle = await listUserRecords("motorcycles");
  if (motorcycle?.length) {
    mileageInput.value = motorcycle[0].mileage || "";
  }

  setDefaults();
  titleInput.value = typeFromQuery === "expenses" ? "Motorcycle Expense" : typeFromQuery === "repairs" ? "Service Repair" : "Maintenance Task";
  updatePreview();

  [recordType, titleInput, dateInput, amountInput, mileageInput, categoryInput, providerInput, notesInput, receiptInput].forEach((input) => {
    input?.addEventListener("input", () => {
      updateFieldLabels();
      updatePreview();
    });
    input?.addEventListener("change", () => {
      updateFieldLabels();
      updatePreview();
    });
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage();

    const type = currentCollection();
    const title = titleInput.value.trim();
    const date = dateInput.value;
    const notes = notesInput.value.trim();
    const mileage = Number(mileageInput.value || 0);
    const basePayload = {
      title,
      date,
      notes,
      mileage,
      serviceProvider: providerInput.value.trim(),
      receiptUrl: receiptInput.value.trim(),
      createdAt: new Date().toISOString()
    };

    if (!title || !date) {
      showMessage("Title and date are required.", "error");
      return;
    }

    try {
      saveButton.disabled = true;
      saveButton.textContent = "Saving...";

      if (type === "maintenance") {
        await saveUserRecord("maintenance", {
          ...basePayload,
          category: categoryInput.value.trim() || "Maintenance",
          status: "pending"
        });
      } else if (type === "repairs") {
        await saveUserRecord("repairs", {
          ...basePayload,
          type: categoryInput.value.trim() || "Repair",
          cost: Number(amountInput.value || 0)
        });
      } else {
        await saveUserRecord("expenses", {
          ...basePayload,
          category: categoryInput.value.trim() || "Expense",
          amount: Number(amountInput.value || 0)
        });
      }

      showMessage("Record saved successfully. Redirecting...", "success");
      window.setTimeout(() => {
        window.location.href = type === "maintenance"
          ? "./maintenance.html"
          : type === "repairs"
            ? "./repairs.html"
            : "./expenses.html";
      }, 450);
    } catch (error) {
      showMessage(error?.message || "Could not save record.", "error");
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "Save record";
    }
  });
}

onAuthChange((user) => {
  if (!user) {
    window.location.replace("./login.html");
    return;
  }
  boot(user).catch((error) => console.error(error));
});
