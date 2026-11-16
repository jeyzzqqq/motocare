let activeLogoutTrigger = null;
let pendingLogout = null;

function ensureLogoutConfirmation() {
    if (document.getElementById('logoutConfirmationDialog')) return;

    const styles = document.createElement('link');
    styles.rel = 'stylesheet';
    styles.href = './css/logout-confirmation.css';
    document.head.appendChild(styles);

    document.body.insertAdjacentHTML('beforeend', `
        <div id="logoutConfirmationBackdrop" class="logout-confirmation-backdrop" hidden></div>
        <section id="logoutConfirmationDialog" class="logout-confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="logoutConfirmationTitle" hidden>
            <span class="logout-confirmation-dialog__icon" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" x2="9" y1="12" y2="12"/>
                </svg>
            </span>
            <h2 id="logoutConfirmationTitle" class="logout-confirmation-dialog__title">Log out of MotoCare?</h2>
            <p class="logout-confirmation-dialog__body">Your records stay safe. You can log back in anytime to pick up where you left off.</p>
            <div class="logout-confirmation-dialog__actions">
                <button id="logoutConfirmationCancel" class="logout-confirmation-dialog__cancel" type="button">Cancel</button>
                <button id="logoutConfirmationConfirm" class="logout-confirmation-dialog__confirm" type="button">Log out</button>
            </div>
        </section>
    `);

    const backdrop = document.getElementById('logoutConfirmationBackdrop');
    document.getElementById('logoutConfirmationCancel')?.addEventListener('click', closeLogoutConfirmation);
    document.getElementById('logoutConfirmationConfirm')?.addEventListener('click', confirmLogout);
    backdrop?.addEventListener('click', closeLogoutConfirmation);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !document.getElementById('logoutConfirmationDialog')?.hidden) {
            closeLogoutConfirmation();
        }
    });
}

function openLogoutConfirmation(logoutHandler) {
    ensureLogoutConfirmation();
    activeLogoutTrigger = document.activeElement;
    pendingLogout = typeof logoutHandler === 'function' ? logoutHandler : window.logoutUser;

    const backdrop = document.getElementById('logoutConfirmationBackdrop');
    const dialog = document.getElementById('logoutConfirmationDialog');
    const confirmButton = document.getElementById('logoutConfirmationConfirm');
    if (!backdrop || !dialog || !confirmButton) return;

    confirmButton.disabled = false;
    backdrop.hidden = false;
    dialog.hidden = false;
    requestAnimationFrame(() => {
        backdrop.classList.add('is-open');
        dialog.classList.add('is-open');
    });
    document.body.classList.add('logout-confirmation-open');
    document.getElementById('logoutConfirmationCancel')?.focus({ preventScroll: true });
}

function closeLogoutConfirmation() {
    const backdrop = document.getElementById('logoutConfirmationBackdrop');
    const dialog = document.getElementById('logoutConfirmationDialog');
    if (!backdrop || !dialog) return;

    backdrop.classList.remove('is-open');
    dialog.classList.remove('is-open');
    document.body.classList.remove('logout-confirmation-open');
    window.setTimeout(() => {
        if (dialog.classList.contains('is-open')) return;
        backdrop.hidden = true;
        dialog.hidden = true;
        activeLogoutTrigger?.focus?.({ preventScroll: true });
        activeLogoutTrigger = null;
    }, 230);
}

async function confirmLogout() {
    if (!pendingLogout) return;
    const confirmButton = document.getElementById('logoutConfirmationConfirm');
    if (!confirmButton || confirmButton.disabled) return;

    confirmButton.disabled = true;
    const logoutHandler = pendingLogout;
    pendingLogout = null;
    try {
        await logoutHandler();
    } catch (error) {
        confirmButton.disabled = false;
        pendingLogout = logoutHandler;
        console.error('Logout confirmation failed:', error);
    }
}

window.openLogoutConfirmation = openLogoutConfirmation;
window.closeLogoutConfirmation = closeLogoutConfirmation;
