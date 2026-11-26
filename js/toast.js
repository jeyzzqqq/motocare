const TOAST_LIMIT = 3;
const TOAST_STYLES_ID = 'motocare-toast-styles';
const TOAST_CONTAINER_ID = 'motocare-toast-container';

const DEFAULT_TITLES = {
    success: 'Success',
    error: 'Something went wrong',
    info: 'Heads up'
};

const ICONS = {
    success: '<path d="m5 12 4 4L19 6"/>',
    error: '<path d="m18 6-12 12M6 6l12 12"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'
};

function ensureToastStyles() {
    if (document.getElementById(TOAST_STYLES_ID)) return;

    const style = document.createElement('style');
    style.id = TOAST_STYLES_ID;
    style.textContent = `
        #${TOAST_CONTAINER_ID} {
            position: fixed;
            top: calc(16px + env(safe-area-inset-top, 0px));
            right: calc(16px + env(safe-area-inset-right, 0px));
            z-index: 2147483647;
            display: flex;
            width: min(420px, calc(100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
            flex-direction: column;
            gap: 8px;
            pointer-events: none;
            font-family: Geist, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .motocare-toast {
            display: grid;
            grid-template-columns: 24px minmax(0, 1fr) 48px;
            align-items: center;
            gap: 8px;
            min-height: 80px;
            padding: 16px;
            border-radius: 16px;
            box-shadow: 0 4px 14px rgba(17, 24, 39, .1);
            opacity: 0;
            pointer-events: auto;
            transform: translateY(-8px);
            transition: opacity 180ms ease, transform 180ms ease;
        }
        .motocare-toast.is-visible { opacity: 1; transform: translateY(0); }
        .motocare-toast.is-leaving { opacity: 0; transform: translateY(-6px); }
        .motocare-toast--success { color: #2E7D32; background: #EAF3EA; }
        .motocare-toast--error { color: #EF4444; background: #FACFCF; }
        .motocare-toast--info { color: #1F2937; background: #EFF1EE; }
        .motocare-toast__icon { display: block; width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }
        .motocare-toast__copy { min-width: 0; }
        .motocare-toast__title { overflow: hidden; margin: 0; font-size: 13px; font-weight: 700; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
        .motocare-toast__message { overflow: hidden; margin: 3px 0 0; color: #6B7280; font-size: 12px; font-weight: 400; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
        .motocare-toast--error .motocare-toast__message { color: #7F1D1D; }
        .motocare-toast__close { display: grid; width: 48px; height: 48px; place-items: center; padding: 0; border: 0; border-radius: 12px; color: inherit; background: transparent; cursor: pointer; }
        .motocare-toast__close:hover { background: rgba(31, 41, 55, .07); }
        .motocare-toast__close:focus-visible { outline: 2px solid currentColor; outline-offset: -3px; }
        .motocare-toast__close svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }
        @media (max-width: 480px) {
            #${TOAST_CONTAINER_ID} { right: calc(16px + env(safe-area-inset-right, 0px)); left: calc(16px + env(safe-area-inset-left, 0px)); width: auto; }
        }
        @media (prefers-reduced-motion: reduce) {
            .motocare-toast { transition: none; }
        }
    `;
    document.head.appendChild(style);
}

function getToastContainer() {
    ensureToastStyles();
    let container = document.getElementById(TOAST_CONTAINER_ID);
    if (!container) {
        container = document.createElement('div');
        container.id = TOAST_CONTAINER_ID;
        container.setAttribute('aria-live', 'polite');
        container.setAttribute('aria-relevant', 'additions');
        document.body.appendChild(container);
    }
    return container;
}

function removeToast(toast, immediate = false) {
    if (toast.dataset.removing === 'true') return;
    toast.dataset.removing = 'true';
    if (toast.dismissTimer) window.clearTimeout(toast.dismissTimer);
    toast.dismissTimer = null;
    if (immediate) {
        toast.remove();
        return;
    }
    toast.classList.remove('is-visible');
    toast.classList.add('is-leaving');
    window.setTimeout(() => toast.remove(), 180);
}

function showToast(options, legacyType = 'info') {
    const settings = options && typeof options === 'object'
        ? options
        : { type: legacyType, message: options };
    const type = Object.prototype.hasOwnProperty.call(DEFAULT_TITLES, settings.type)
        ? settings.type
        : 'info';
    const message = String(settings.message ?? '');
    const title = String(settings.title || DEFAULT_TITLES[type]);
    const container = getToastContainer();
    const toast = document.createElement('article');
    toast.className = `motocare-toast motocare-toast--${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.setAttribute('aria-atomic', 'true');

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    icon.classList.add('motocare-toast__icon');
    icon.innerHTML = ICONS[type];

    const copy = document.createElement('div');
    copy.className = 'motocare-toast__copy';
    const titleElement = document.createElement('p');
    titleElement.className = 'motocare-toast__title';
    titleElement.textContent = title;
    const messageElement = document.createElement('p');
    messageElement.className = 'motocare-toast__message';
    messageElement.textContent = message;
    messageElement.title = message;
    copy.append(titleElement, messageElement);

    const closeButton = document.createElement('button');
    closeButton.className = 'motocare-toast__close';
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Dismiss notification');
    closeButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12"/></svg>';
    closeButton.addEventListener('click', () => removeToast(toast));

    toast.append(icon, copy, closeButton);
    container.prepend(toast);
    while (container.children.length > TOAST_LIMIT) {
        const oldest = container.lastElementChild;
        if (oldest) removeToast(oldest, true);
    }

    let remaining = type === 'error' ? 6000 : 4000;
    let timerStartedAt = 0;
    const resumeTimer = () => {
        if (toast.dismissTimer) return;
        if (remaining <= 0) {
            removeToast(toast);
            return;
        }
        timerStartedAt = Date.now();
        toast.dismissTimer = window.setTimeout(() => removeToast(toast), remaining);
    };
    const pauseTimer = () => {
        if (!toast.dismissTimer) return;
        window.clearTimeout(toast.dismissTimer);
        toast.dismissTimer = null;
        remaining = Math.max(0, remaining - (Date.now() - timerStartedAt));
    };

    toast.addEventListener('mouseenter', pauseTimer);
    toast.addEventListener('mouseleave', resumeTimer);
    toast.addEventListener('touchstart', pauseTimer, { passive: true });
    toast.addEventListener('touchend', resumeTimer, { passive: true });
    toast.addEventListener('touchcancel', resumeTimer, { passive: true });
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    resumeTimer();
}

export { showToast };
