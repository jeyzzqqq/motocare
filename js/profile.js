import {
  getPrimaryMotorcycle,
  listUserRecords,
  logoutUser,
  onAuthChange,
  saveUserRecord
} from "./firebase.js";
import { formatDate, integer, money, populateUserIdentity, setActiveNav } from "./ui.js";

const detailsTarget = document.getElementById("motorcycleDetails");
const imageTarget = document.getElementById("motorcycleImage");
const titleTarget = document.getElementById("motorcycleTitle");
const subtitleTarget = document.getElementById("motorcycleSubtitle");
const mileageTarget = document.getElementById("motorcycleMileage");
const brandTarget = document.getElementById("motorcycleBrand");
const plateTarget = document.getElementById("motorcyclePlate");
const editorPanel = document.getElementById("profileEditorPanel");
const toggleEditButton = document.getElementById("toggleEditProfile");
const cancelButton = document.getElementById("cancelProfileButton");
const form = document.getElementById("profileForm");
const message = document.getElementById("profileMessage");
const logoutButton = document.getElementById("logoutButton");

const fieldIds = ["brand", "model", "year", "mileage", "plateNumber", "color"];
let currentRecord = null;

function showMessage(text, tone = "neutral") {
  if (!message) {
    return;
  }
  message.textContent = text;
  message.className = `empty-state ${tone === "error" ? "border-red-200 bg-red-50 text-red-700" : tone === "success" ? "border-green-200 bg-green-50 text-green-700" : ""}`.trim();
  message.classList.remove("hidden");
}

function fillForm(record) {
  fieldIds.forEach((field) => {
    const input = document.getElementById(field);
    if (input) {
      input.value = record?.[field] || "";
    }
  });
}

function renderDetails(record, user) {
  const model = record ? `${record.brand || "Motorcycle"} ${record.model || ""}`.trim() : "No motorcycle yet";
  const subtitle = record ? `Year ${record.year || "--"} • ${record.color || "Color not set"}` : "Create your first motorcycle profile.";
  const mileage = record ? integer(record.mileage || 0) : "0";

  titleTarget.textContent = model;
  subtitleTarget.textContent = subtitle;
  mileageTarget.textContent = mileage;
  brandTarget.textContent = record?.brand || "--";
  plateTarget.textContent = record?.plateNumber || "--";
  imageTarget.src = record?.image || "./assets/images/motorcycle-placeholder.svg";
  imageTarget.alt = record ? `${model} motorcycle` : "Motorcycle placeholder";

  detailsTarget.innerHTML = [
    { label: "Make & model", value: model, icon: "fa-motorcycle" },
    { label: "Year", value: record?.year || "--", icon: "fa-calendar-days" },
    { label: "Current mileage", value: record ? `${integer(record.mileage || 0)} miles` : "--", icon: "fa-gauge-high" },
    { label: "Plate number", value: record?.plateNumber || "--", icon: "fa-id-card" },
    { label: "Color", value: record?.color || "--", icon: "fa-palette" },
    { label: "Owner", value: user?.displayName || user?.email || "Rider", icon: "fa-user" }
  ].map((item) => `
    <article class="list-item">
      <div class="list-item-main">
        <span class="dot"></span>
        <div>
          <h3>${item.label}</h3>
          <p>${item.value}</p>
        </div>
      </div>
      <span class="card-icon"><i class="fa-solid ${item.icon}"></i></span>
    </article>
  `).join("");
}

async function boot(user) {
  setActiveNav("profile");
  populateUserIdentity(user);

  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      await logoutUser();
      window.location.replace("./login.html");
    });
  }

  currentRecord = await getPrimaryMotorcycle();
  renderDetails(currentRecord, user);
  fillForm(currentRecord || {});

  toggleEditButton?.addEventListener("click", () => {
    editorPanel.classList.toggle("hidden");
    if (!editorPanel.classList.contains("hidden")) {
      editorPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  cancelButton?.addEventListener("click", () => {
    editorPanel.classList.add("hidden");
    fillForm(currentRecord || {});
    message?.classList.add("hidden");
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const payload = {
        brand: document.getElementById("brand").value.trim(),
        model: document.getElementById("model").value.trim(),
        year: document.getElementById("year").value.trim(),
        mileage: Number(document.getElementById("mileage").value || 0),
        plateNumber: document.getElementById("plateNumber").value.trim(),
        color: document.getElementById("color").value.trim(),
        image: currentRecord?.image || "./assets/images/motorcycle-placeholder.svg",
        updatedAt: new Date().toISOString()
      };
      currentRecord = await saveUserRecord("motorcycles", payload, currentRecord?.id || null);
      renderDetails(currentRecord, user);
      showMessage("Motorcycle profile saved successfully.", "success");
      editorPanel.classList.add("hidden");
    } catch (error) {
      showMessage(error?.message || "Could not save the motorcycle profile.", "error");
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
