export function money(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(number);
}

export function integer(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

export function formatDate(value) {
  if (!value) {
    return "--";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export function formatShortDate(value) {
  if (!value) {
    return "--";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}

export function initials(name) {
  return String(name || "R").trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

export function setActiveNav(activeKey) {
  document.querySelectorAll("[data-nav]").forEach((link) => {
    const isActive = link.dataset.nav === activeKey;
    link.classList.toggle("active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

export function populateUserIdentity(user, scope = document) {
  const avatarLabel = initials(user?.displayName || user?.email || "R");
  scope.querySelectorAll("[data-user-name]").forEach((node) => {
    node.textContent = user?.displayName || user?.email?.split("@")[0] || "Rider";
  });
  scope.querySelectorAll("[data-user-email]").forEach((node) => {
    node.textContent = user?.email || "guest@motocare.app";
  });
  scope.querySelectorAll("[data-user-avatar]").forEach((node) => {
    node.textContent = avatarLabel;
  });
}

export function renderSummaryCards(target, cards) {
  target.innerHTML = cards.map((card) => `
    <article class="stat-card ${card.primary ? "primary" : ""}">
      <div class="flex items-start justify-between gap-4">
        <div>
          <div class="label">${card.label}</div>
          <div class="value">${card.value}</div>
          <div class="detail">${card.detail}</div>
        </div>
        <div class="stat-icon ${card.primary ? "bg-white/12 text-white" : ""}">
          <i class="fa-solid ${card.icon}"></i>
        </div>
      </div>
    </article>
  `).join("");
}

function pixelRatio(canvas) {
  return Math.max(1, window.devicePixelRatio || 1);
}

export function drawBarChart(canvas, labels, values, options = {}) {
  if (!canvas) {
    return;
  }
  const context = canvas.getContext("2d");
  const ratio = pixelRatio(canvas);
  const width = canvas.clientWidth || 420;
  const height = canvas.clientHeight || 220;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  context.scale(ratio, ratio);
  context.clearRect(0, 0, width, height);

  const padding = { top: 18, right: 18, bottom: 34, left: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const max = Math.max(...values, 1);
  const gap = 16;
  const barWidth = Math.max(24, (chartWidth - gap * (values.length - 1)) / values.length);

  context.fillStyle = "rgba(148, 163, 184, 0.22)";
  context.font = "12px Inter, sans-serif";
  context.textAlign = "right";
  context.textBaseline = "middle";

  const tickCount = 4;
  for (let index = 0; index <= tickCount; index += 1) {
    const value = (max / tickCount) * index;
    const y = padding.top + chartHeight - (chartHeight / tickCount) * index;
    context.fillText(options.formatTick ? options.formatTick(value) : `$${Math.round(value)}`, padding.left - 10, y);
    context.strokeStyle = "rgba(148, 163, 184, 0.14)";
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
  }

  values.forEach((value, index) => {
    const barHeight = Math.max(12, (value / max) * chartHeight);
    const x = padding.left + index * (barWidth + gap);
    const y = padding.top + chartHeight - barHeight;
    const gradient = context.createLinearGradient(0, y, 0, y + barHeight);
    gradient.addColorStop(0, options.colorTop || "#2e7d32");
    gradient.addColorStop(1, options.colorBottom || "#5cb85c");
    context.fillStyle = gradient;
    roundRect(context, x, y, barWidth, barHeight, 12);
    context.fill();

    context.fillStyle = "#64748b";
    context.textAlign = "center";
    context.textBaseline = "top";
    context.fillText(labels[index], x + barWidth / 2, height - 22);
  });
}

export function drawDonutChart(canvas, segments, options = {}) {
  if (!canvas) {
    return;
  }
  const context = canvas.getContext("2d");
  const ratio = pixelRatio(canvas);
  const width = canvas.clientWidth || 320;
  const height = canvas.clientHeight || 220;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  context.scale(ratio, ratio);
  context.clearRect(0, 0, width, height);

  const total = segments.reduce((sum, segment) => sum + Number(segment.value || 0), 0) || 1;
  const size = Math.min(width, height) * 0.65;
  const centerX = width / 2;
  const centerY = height / 2 - 10;
  const radius = size / 2;
  const strokeWidth = options.strokeWidth || 24;
  let startAngle = -Math.PI / 2;

  segments.forEach((segment) => {
    const slice = (Number(segment.value || 0) / total) * Math.PI * 2;
    context.beginPath();
    context.strokeStyle = segment.color;
    context.lineWidth = strokeWidth;
    context.lineCap = "round";
    context.arc(centerX, centerY, radius, startAngle, startAngle + slice);
    context.stroke();
    startAngle += slice;
  });

  context.beginPath();
  context.fillStyle = "#fff";
  context.arc(centerX, centerY, radius - strokeWidth / 2 - 1, 0, Math.PI * 2);
  context.fill();

  if (options.centerLabel) {
    context.fillStyle = "#1f2937";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "700 18px Inter, sans-serif";
    context.fillText(options.centerLabel, centerX, centerY - 6);
    context.fillStyle = "#64748b";
    context.font = "12px Inter, sans-serif";
    context.fillText(options.centerSubLabel || "", centerX, centerY + 18);
  }
}

function roundRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

export function setStatusBadge(element, status) {
  if (!element) {
    return;
  }
  const map = {
    done: "status-chip",
    completed: "status-chip",
    pending: "status-chip pending",
    due: "status-chip warning"
  };
  element.className = map[status] || "status-chip";
  element.textContent = status.charAt(0).toUpperCase() + status.slice(1);
}
