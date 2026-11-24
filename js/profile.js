import { auth, onAuthStateChanged } from "./firebase-config.js?v=3";
import { updateProfile } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";
import { getFirestoreDocs } from './firebaseUtils.js';

let currentUser = null;
let currentBikeCount = 0;
let isEditingProfile = false;
let isSavingProfile = false;
let draftAppearanceTheme = 'light';
let appearanceSettingsOpener = null;
let termsSettingsOpener = null;

const STREAK_PREFIX = 'motocare-streak-v1:';
const THEME_STORAGE_KEY = 'motocare.theme';
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function dateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getStreakState(uid) {
    let data = {};
    try { data = JSON.parse(localStorage.getItem(`${STREAK_PREFIX}${uid}`)) || {}; } catch { data = {}; }
    const today = new Date();
    const todayKey = dateKey(today);
    const dates = new Set([...(data.dates || []), todayKey]);
    let streak = 1;
    const cursor = new Date(today);
    while (true) {
        cursor.setDate(cursor.getDate() - 1);
        if (!dates.has(dateKey(cursor))) break;
        streak += 1;
    }
    const monday = new Date(today);
    const day = monday.getDay();
    monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));
    const completed = DAY_LABELS.map((_, index) => {
        const current = new Date(monday);
        current.setDate(monday.getDate() + index);
        return dates.has(dateKey(current)) && dateKey(current) <= todayKey;
    });
    return { streak, completed, remaining: Math.max(0, 7 - completed.filter(Boolean).length) };
}

function renderProfile(user, bikeCount) {
    const name = user.displayName?.trim() || user.email?.split('@')[0] || 'Rider';
    document.getElementById('profileName').textContent = name;
    document.getElementById('profileEmail').textContent = user.email || '';
    document.getElementById('bikeCount').textContent = `${bikeCount} motorcycle${bikeCount === 1 ? '' : 's'}`;
    document.getElementById('profileAvatar').textContent = getUserInitial(user);

    const state = getStreakState(user.uid);
    document.getElementById('profileStreak').textContent = `${state.streak}-Day Streak`;
    document.getElementById('profileWeek').innerHTML = state.completed.map((complete, index) => `<span class="streak-day${complete ? ' is-complete' : ''}">${complete ? '&#10003;' : DAY_LABELS[index]}</span>`).join('');
    document.getElementById('profileProgress').textContent = state.remaining ? `${state.remaining} more day${state.remaining === 1 ? '' : 's'} to complete your week.` : 'You completed your week. Keep it going!';
}

function getUserInitial(user) {
    return (user.displayName || '').trim().charAt(0).toUpperCase()
        || (user.email || '').trim().charAt(0).toUpperCase()
        || 'U';
}

function ensureAccountSettingsMarkup() {
    if (document.getElementById('accountSettingsBackdrop')) return;
    const root = document.createElement('div');
    root.innerHTML = `<div id="accountSettingsBackdrop" class="motorcycles-modal-backdrop">
        <section class="motorcycles-modal-sheet account-settings" role="dialog" aria-modal="true" aria-labelledby="accountSettingsTitle">
            <div class="account-settings__content">
                <a class="account-settings__back" href="#" aria-label="Back to Account">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
                    <span>Account</span>
                </a>
                <main class="account-settings__main">
                    <h2 id="accountSettingsTitle">Personal information</h2>
                    <div id="accountPersonalAvatar" class="account-settings__avatar" aria-label="Profile avatar">U</div>
                    <p class="account-settings__section-label">PROFILE DETAILS</p>
                    <div class="account-settings__fields">
                        <div class="account-settings__field">
                            <label for="accountNameInput">Full name</label>
                            <input id="accountNameInput" type="text" maxlength="80" autocomplete="name" readonly tabindex="-1" aria-describedby="accountNameError">
                            <small id="accountNameError" class="account-settings__error" aria-live="polite"></small>
                        </div>
                        <div class="account-settings__field">
                            <label for="accountEmail">Email address</label>
                            <input id="accountEmail" type="email" readonly tabindex="-1" aria-readonly="true" autocomplete="email">
                        </div>
                        <div class="account-settings__field">
                            <label for="accountMemberSince">Member since</label>
                            <input id="accountMemberSince" class="account-settings__readonly" type="text" readonly tabindex="-1" aria-readonly="true">
                        </div>
                    </div>
                    <div class="account-settings__divider" aria-hidden="true"></div>
                </main>
                <footer class="account-settings__footer">
                    <button id="accountNameEdit" class="account-settings__save" type="button">Edit profile</button>
                </footer>
            </div>
        </section>
    </div>`;
    document.body.appendChild(root.firstElementChild);
    const backdrop = document.getElementById('accountSettingsBackdrop');
    backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) closeAccountSettings();
    });
    document.querySelector('.account-settings__back').addEventListener('click', (event) => {
        event.preventDefault();
        closeAccountSettings();
    });
    document.getElementById('accountNameEdit').addEventListener('click', toggleNameEdit);
    document.getElementById('accountNameInput').addEventListener('input', (event) => {
        document.getElementById('accountNameError').textContent = '';
        event.target.removeAttribute('aria-invalid');
    });
    document.getElementById('accountNameInput').addEventListener('focus', (event) => {
        const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
        window.setTimeout(() => event.target.scrollIntoView({ block: 'center', behavior }), 250);
    });
}

function renderAccountSettings() {
    const name = currentUser.displayName?.trim() || currentUser.email?.split('@')[0] || 'Rider';
    const nameInput = document.getElementById('accountNameInput');
    if (document.activeElement !== nameInput) nameInput.value = name;
    document.getElementById('accountEmail').value = currentUser.email || '';
    document.getElementById('accountMemberSince').value = formatMemberSince(currentUser.metadata?.creationTime);
    document.getElementById('accountPersonalAvatar').textContent = getUserInitial(currentUser);
}

function formatMemberSince(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function setEditMode(editing) {
    isEditingProfile = editing;
    const sheet = document.querySelector('#accountSettingsBackdrop .account-settings');
    const nameInput = document.getElementById('accountNameInput');
    const actionButton = document.getElementById('accountNameEdit');

    sheet?.classList.toggle('is-editing', editing);
    nameInput.readOnly = !editing;
    nameInput.tabIndex = editing ? 0 : -1;
    actionButton.textContent = editing ? 'Save changes' : 'Edit profile';
}

function discardProfileChanges() {
    document.getElementById('accountNameError').textContent = '';
    document.getElementById('accountNameInput').removeAttribute('aria-invalid');
    setEditMode(false);
    if (currentUser) renderAccountSettings();
}

async function toggleNameEdit() {
    if (!isEditingProfile) {
        setEditMode(true);
        return;
    }

    const input = document.getElementById('accountNameInput');
    const button = document.getElementById('accountNameEdit');
    const name = input.value.trim();
    if (!name) {
        input.setAttribute('aria-invalid', 'true');
        document.getElementById('accountNameError').textContent = 'Please enter your name.';
        input.focus();
        return;
    }

    button.disabled = true;
    isSavingProfile = true;
    try {
        await updateProfile(currentUser, { displayName: name });
        renderProfile(currentUser, currentBikeCount);
        renderAccountSettings();
        setEditMode(false);
        window.showToast?.('Name updated.', 'success');
    } catch (error) {
        console.error(error);
        window.showToast?.('Could not save your profile.', 'error');
    } finally {
        isSavingProfile = false;
        button.disabled = false;
    }
}

function addAccountSettingsStyles() {
    const style = document.createElement('style');
    style.textContent = `
        body.notification-settings-open { overflow: hidden; }
        .account-settings {
            display: flex;
            flex-direction: column;
            width: min(calc(100% - 36px), 480px);
            height: min(92dvh, 760px);
            max-height: 92dvh;
            padding: 0;
            overflow: hidden;
            border-radius: 12px;
            color: var(--moto-text);
            background: var(--moto-surface);
        }
        .account-settings__content {
            display: flex;
            min-height: 0;
            height: 100%;
            flex-direction: column;
            padding: max(16px, env(safe-area-inset-top)) 16px 0;
        }
        .account-settings__back {
            display: flex;
            min-height: 44px;
            flex: 0 0 auto;
            align-items: center;
            gap: 7px;
            color: var(--moto-streak-primary);
            font-size: 15px;
            font-weight: 400;
            text-decoration: none;
            transition: transform 120ms ease-out;
        }
        .account-settings__back:active { transform: scale(.98); }
        .account-settings__back svg { flex: 0 0 auto; }
        .account-settings__main {
            min-height: 0;
            flex: 1;
            overflow-y: auto;
            padding-top: 8px;
            scrollbar-width: none;
        }
        .account-settings__main::-webkit-scrollbar { display: none; }
        #accountSettingsTitle {
            overflow: hidden;
            margin: 0;
            color: var(--moto-text);
            font-size: 30px;
            font-weight: 700;
            letter-spacing: -.03em;
            line-height: 1.15;
            text-overflow: ellipsis;
            white-space: nowrap;
            animation: personal-info-enter 360ms ease-out both;
        }
        .account-settings__avatar {
            display: grid;
            width: 96px;
            height: 96px;
            flex: 0 0 96px;
            place-items: center;
            margin: 24px auto 0;
            overflow: hidden;
            border-radius: 50%;
            color: var(--moto-surface);
            background: var(--moto-streak-primary);
            font: 700 36px var(--moto-font);
            animation: personal-info-enter 360ms ease-out both;
        }
        .account-settings__section-label {
            margin: 24px 0 18px;
            color: var(--moto-muted);
            font-size: 9px;
            font-weight: 500;
            letter-spacing: .08em;
            line-height: 1.2;
        }
        .account-settings__fields { display: grid; gap: 16px; }
        .account-settings__field {
            display: grid;
            min-width: 0;
            gap: 7px;
            animation: personal-info-enter 360ms ease-out both;
        }
        .account-settings__field:nth-child(2) { animation-delay: 40ms; }
        .account-settings__field:nth-child(3) { animation-delay: 80ms; }
        .account-settings__field label {
            color: var(--moto-text);
            font-size: 15px;
            font-weight: 400;
            line-height: 1.25;
        }
        .account-settings__field input {
            width: 100%;
            height: 52px;
            padding: 0 16px;
            overflow: hidden;
            border: 1px solid var(--moto-upcoming);
            border-radius: 12px;
            outline: 0;
            color: var(--moto-text);
            background: var(--moto-surface);
            font: 400 15px var(--moto-font);
            text-overflow: ellipsis;
            transition: border-color 150ms ease-out, background-color 150ms ease-out, color 150ms ease-out;
        }
        .account-settings__field input:not([readonly]) { color: var(--moto-text); }
        .account-settings__field input:not([readonly]):focus {
            border: 1.5px solid var(--moto-streak-primary);
            color: var(--moto-text);
        }
        .account-settings__field input[readonly] { cursor: default; }
        .account-settings__field input.account-settings__readonly {
            border-color: transparent;
            color: var(--moto-muted);
            background: var(--moto-icon-tile);
        }
        .account-settings__field input.account-settings__readonly:focus { border-color: transparent; }
        .account-settings.is-editing .account-settings__field input:not([readonly]) {
            border-color: var(--moto-upcoming);
            background: var(--moto-surface);
        }
        .account-settings.is-editing .account-settings__field input:not([readonly]):focus {
            border-color: var(--moto-streak-primary);
        }
        .account-settings__field input[aria-invalid="true"] { border-color: var(--moto-overdue); }
        .account-settings__error {
            min-height: 0;
            color: var(--moto-overdue);
            font-size: 12px;
            line-height: 1.3;
        }
        .account-settings__error:empty { display: none; }
        .account-settings__divider {
            height: 1px;
            margin-top: 16px;
            background: var(--moto-border);
        }
        .account-settings__footer {
            flex: 0 0 auto;
            margin: 0 -16px;
            padding: 12px 16px max(16px, env(safe-area-inset-bottom));
            background: var(--moto-surface);
        }
        .account-settings__save {
            width: 100%;
            min-height: 52px;
            border: 0;
            border-radius: 999px;
            color: var(--moto-surface);
            background: var(--moto-streak-primary);
            font: 600 14px var(--moto-font);
            cursor: pointer;
            transition: transform 120ms ease-out;
        }
        .account-settings__save:active { transform: scale(.98); }
        .account-settings__save:disabled { opacity: .65; cursor: wait; }
        .account-settings__save:focus-visible,
        .account-settings__back:focus-visible { outline: 2px solid var(--moto-streak-primary); outline-offset: 3px; }
        @keyframes personal-info-enter {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
            .account-settings__back,
            .account-settings__field input,
            .account-settings__save { transition: none; }
            #accountSettingsTitle,
            .account-settings__avatar,
            .account-settings__field { animation: none; }
        }
        @media (min-width: 481px) {
            .account-settings { width: min(calc(100% - 40px), 480px); }
        }
    `;
    document.head.appendChild(style);
}

async function openAccountSettings() {
    if (!currentUser) return;
    ensureAccountSettingsMarkup();
    renderAccountSettings();
    setEditMode(false);
    document.getElementById('accountSettingsBackdrop').classList.add('is-open');
    document.querySelector('#accountSettingsBackdrop .account-settings').classList.add('is-open');
    document.body.classList.add('notification-settings-open');
}

function closeAccountSettings() {
    if (isSavingProfile) return;
    const backdrop = document.getElementById('accountSettingsBackdrop');
    if (isEditingProfile) discardProfileChanges();
    backdrop?.classList.remove('is-open');
    backdrop?.querySelector('.account-settings')?.classList.remove('is-open');
    document.body.classList.remove('notification-settings-open');
}

function ensureAppearanceSettingsMarkup() {
    if (document.getElementById('appearanceSettingsBackdrop')) return;

    const root = document.createElement('div');
    root.innerHTML = `<div id="appearanceSettingsBackdrop" class="motorcycles-modal-backdrop appearance-settings-backdrop">
        <section class="motorcycles-modal-sheet appearance-settings" role="dialog" aria-modal="true" aria-labelledby="appearanceSettingsTitle">
            <div class="appearance-settings__content">
                <a class="appearance-settings__back" href="#" aria-label="Back to Account">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
                    <span>Account</span>
                </a>
                <main class="appearance-settings__main">
                    <h2 id="appearanceSettingsTitle">Appearance</h2>
                    <p class="appearance-settings__subtitle">Choose how MotoCare looks on your device.</p>
                    <p class="appearance-settings__label">Display theme</p>
                    <div class="appearance-settings__previews" aria-label="Theme previews">
                        <button type="button" class="appearance-preview" data-theme-choice="light" aria-label="Select Light preview" aria-pressed="false">
                            <span class="appearance-preview__brand">MotoCare</span>
                            <span class="appearance-preview__page">My motorcycles</span>
                            <span class="appearance-preview__row"><i></i><i></i></span>
                            <span class="appearance-preview__row"><i></i><i></i></span>
                        </button>
                        <button type="button" class="appearance-preview" data-theme-choice="dark" aria-label="Select Dark preview" aria-pressed="false">
                            <span class="appearance-preview__brand">MotoCare</span>
                            <span class="appearance-preview__page">My motorcycles</span>
                            <span class="appearance-preview__row"><i></i><i></i></span>
                            <span class="appearance-preview__row"><i></i><i></i></span>
                        </button>
                    </div>
                    <div class="appearance-settings__options" role="radiogroup" aria-label="Display theme">
                        <button type="button" class="appearance-settings__option" data-theme-choice="dark" role="radio" aria-checked="false">
                            <span class="appearance-settings__option-copy"><strong>Dark</strong><small>A softer display in low light</small></span>
                            <span class="appearance-settings__radio" aria-hidden="true"></span>
                        </button>
                        <button type="button" class="appearance-settings__option" data-theme-choice="light" role="radio" aria-checked="false">
                            <span class="appearance-settings__option-copy"><strong>Light</strong><small>A bright, clean display</small></span>
                            <span class="appearance-settings__radio" aria-hidden="true"></span>
                        </button>
                    </div>
                </main>
                <footer class="appearance-settings__footer">
                    <button id="appearanceSettingsSave" class="appearance-settings__save" type="button">Save preference</button>
                </footer>
            </div>
        </section>
    </div>`;
    document.body.appendChild(root.firstElementChild);

    const backdrop = document.getElementById('appearanceSettingsBackdrop');
    backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) closeAppearanceSettings();
        const choice = event.target.closest('[data-theme-choice]');
        if (choice) selectAppearanceTheme(choice.dataset.themeChoice);
    });
    backdrop.querySelector('.appearance-settings__back').addEventListener('click', (event) => {
        event.preventDefault();
        closeAppearanceSettings();
    });
    document.getElementById('appearanceSettingsSave').addEventListener('click', saveAppearanceTheme);
}

function selectAppearanceTheme(theme) {
    if (theme !== 'light' && theme !== 'dark') return;
    draftAppearanceTheme = theme;
    document.querySelectorAll('#appearanceSettingsBackdrop [data-theme-choice]').forEach((choice) => {
        const selected = choice.dataset.themeChoice === theme;
        choice.classList.toggle('is-selected', selected);
        choice.setAttribute(choice.getAttribute('role') === 'radio' ? 'aria-checked' : 'aria-pressed', String(selected));
    });
}

function openAppearanceSettings() {
    ensureAppearanceSettingsMarkup();
    appearanceSettingsOpener = document.querySelector('.profile-row[aria-label="Appearance"]');
    try {
        draftAppearanceTheme = localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
    } catch (error) {
        console.error('Could not read the saved appearance preference:', error);
        draftAppearanceTheme = 'light';
    }

    selectAppearanceTheme(draftAppearanceTheme);
    document.getElementById('appearanceSettingsBackdrop').classList.add('is-open');
    document.querySelector('#appearanceSettingsBackdrop .appearance-settings').classList.add('is-open');
    document.body.classList.add('notification-settings-open');
    document.querySelector(`#appearanceSettingsBackdrop [data-theme-choice="${draftAppearanceTheme}"]`)?.focus({ preventScroll: true });
}

function closeAppearanceSettings() {
    const backdrop = document.getElementById('appearanceSettingsBackdrop');
    backdrop?.classList.remove('is-open');
    backdrop?.querySelector('.appearance-settings')?.classList.remove('is-open');
    document.body.classList.remove('notification-settings-open');
    if (appearanceSettingsOpener?.isConnected) appearanceSettingsOpener.focus({ preventScroll: true });
    appearanceSettingsOpener = null;
}

function ensureTermsSettingsMarkup() {
    if (document.getElementById('termsSettingsBackdrop')) return;

    const root = document.createElement('div');
    root.innerHTML = `<div id="termsSettingsBackdrop" class="motorcycles-modal-backdrop terms-settings-backdrop">
        <section class="motorcycles-modal-sheet terms-settings" role="dialog" aria-modal="true" aria-labelledby="termsSettingsTitle" tabindex="-1">
            <div class="terms-settings__content">
                <a class="terms-settings__back" href="#" aria-label="Back to Account">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
                    <span>Account</span>
                </a>
                <div class="terms-settings__main">
                    <h2 id="termsSettingsTitle">Terms and Conditions</h2>
                    <p class="terms-settings__intro">Please read these terms before using MotoCare.</p>
                    <p class="terms-settings__label">TERMS OF USE · DRAFT FOR REVIEW</p>
                    <section class="terms-settings__section">
                        <h3>1. Use of MotoCare</h3>
                        <p>MotoCare helps you track your motorcycle's maintenance, repairs, and expenses. Reminders are estimates based on what you enter, so keep your records and odometer readings accurate.</p>
                    </section>
                    <section class="terms-settings__section">
                        <h3>2. Your account</h3>
                        <p>Use accurate details and keep your log-in credentials private.</p>
                    </section>
                    <section class="terms-settings__section">
                        <h3>3. MotoAI and maintenance guidance</h3>
                        <p>MotoAI is an AI assistant and it can be wrong. Treat its answers and suggested schedules as general guidance. For anything involving safety, ask a qualified mechanic.</p>
                    </section>
                    <section class="terms-settings__section">
                        <h3>4. Your data</h3>
                        <p>We collect your name, email, and motorcycle records only to run MotoCare. MotoAI sends a summary of your records (without your name or email) to generate replies.</p>
                    </section>
                    <section class="terms-settings__section">
                        <h3>5. Availability</h3>
                        <p>We may change features or pause the app at times, and suspend accounts that misuse it.</p>
                    </section>
                </div>
                <footer class="terms-settings__footer">
                    <p>Questions? Visit <a href="#helpAndSupportRow" class="terms-settings__help-link">Help and Support</a>.</p>
                </footer>
            </div>
        </section>
    </div>`;
    document.body.appendChild(root.firstElementChild);

    const backdrop = document.getElementById('termsSettingsBackdrop');
    backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) closeTermsSettings();
    });
    backdrop.querySelector('.terms-settings__back').addEventListener('click', (event) => {
        event.preventDefault();
        closeTermsSettings();
    });
    backdrop.querySelector('.terms-settings__help-link').addEventListener('click', (event) => {
        event.preventDefault();
        closeTermsSettings(false);
        document.getElementById('helpAndSupportRow')?.focus({ preventScroll: true });
    });
}

function openTermsSettings() {
    ensureTermsSettingsMarkup();
    termsSettingsOpener = document.getElementById('termsAndConditionsRow');
    const backdrop = document.getElementById('termsSettingsBackdrop');
    const dialog = backdrop.querySelector('.terms-settings');
    backdrop.classList.add('is-open');
    dialog.classList.add('is-open');
    document.body.classList.add('notification-settings-open');
    dialog.focus({ preventScroll: true });
}

function closeTermsSettings(returnFocus = true) {
    const backdrop = document.getElementById('termsSettingsBackdrop');
    backdrop?.classList.remove('is-open');
    backdrop?.querySelector('.terms-settings')?.classList.remove('is-open');
    document.body.classList.remove('notification-settings-open');
    if (returnFocus && termsSettingsOpener?.isConnected) termsSettingsOpener.focus({ preventScroll: true });
    termsSettingsOpener = null;
}

function addTermsSettingsStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .terms-settings {
            width: min(calc(100% - 14px), 480px);
            height: calc(100dvh - 5px);
            max-height: calc(100dvh - 5px);
            margin-bottom: 2px;
            border-radius: 12px;
            background: var(--moto-surface);
        }
        .terms-settings__content {
            display: flex;
            min-height: 0;
            height: 100%;
            flex-direction: column;
            padding: max(12px, env(safe-area-inset-top)) 16px 0;
        }
        .terms-settings__back {
            display: flex;
            min-height: 38px;
            flex: 0 0 auto;
            align-items: center;
            gap: 7px;
            color: var(--moto-primary);
            font-size: 13px;
            text-decoration: none;
        }
        .terms-settings__back svg {
            width: 18px;
            height: 18px;
            fill: none;
            stroke: currentColor;
            stroke-linecap: round;
            stroke-linejoin: round;
            stroke-width: 1.75;
        }
        .terms-settings__main {
            min-height: 0;
            flex: 1;
            overflow-y: auto;
            padding: 6px 0 12px;
            overscroll-behavior: contain;
            scrollbar-width: none;
        }
        .terms-settings__main::-webkit-scrollbar { display: none; }
        #termsSettingsTitle {
            margin: 0;
            color: var(--moto-text);
            font-size: 20px;
            font-weight: 700;
            line-height: 1.2;
        }
        .terms-settings__intro {
            margin: 12px 0 20px;
            color: var(--moto-muted);
            font-size: 13px;
            line-height: 1.45;
        }
        .terms-settings__label {
            margin: 0 0 14px;
            color: var(--moto-muted);
            font-size: 9px;
            font-weight: 500;
            letter-spacing: .04em;
            line-height: 1.3;
        }
        .terms-settings__section + .terms-settings__section { margin-top: 16px; }
        .terms-settings__section h3 {
            margin: 0;
            color: var(--moto-text);
            font-size: 15px;
            font-weight: 600;
            line-height: 1.3;
        }
        .terms-settings__section p {
            margin: 4px 0 0;
            color: var(--moto-muted);
            font-size: 13px;
            line-height: 1.45;
        }
        .terms-settings__footer {
            flex: 0 0 auto;
            margin: 0;
            padding: 10px 0 max(14px, env(safe-area-inset-bottom));
            border-top: 1px solid var(--moto-border);
            color: var(--moto-muted);
            font-size: 11px;
            line-height: 1.4;
            text-align: center;
        }
        .terms-settings__footer p { margin: 0; }
        .terms-settings__help-link {
            color: var(--moto-muted);
            text-decoration: underline;
            text-underline-offset: 2px;
        }
        .terms-settings__back:focus-visible,
        .terms-settings__help-link:focus-visible {
            outline: 2px solid var(--moto-primary);
            outline-offset: 3px;
        }
        @media (min-width: 481px) {
            .terms-settings {
                width: min(calc(100% - 40px), 480px);
                height: min(85dvh, 720px);
                max-height: 85dvh;
                margin-bottom: 0;
                border-radius: 24px;
            }
        }
    `;
    document.head.appendChild(style);
}

document.getElementById('termsAndConditionsRow')?.addEventListener('click', openTermsSettings);
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.getElementById('termsSettingsBackdrop')?.classList.contains('is-open')) {
        closeTermsSettings();
    }
});

function saveAppearanceTheme() {
    try {
        localStorage.setItem(THEME_STORAGE_KEY, draftAppearanceTheme);
        window.applyMotoCareTheme?.(draftAppearanceTheme);
        closeAppearanceSettings();
        showToast('Preference saved', 'success');
    } catch (error) {
        console.error('Could not save the appearance preference:', error);
        showToast('Could not save your preference.', 'error');
    }
}

document.querySelector('.profile-row[aria-label="Appearance"]')?.addEventListener('click', openAppearanceSettings);
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.getElementById('appearanceSettingsBackdrop')?.classList.contains('is-open')) {
        closeAppearanceSettings();
    }
});

addAccountSettingsStyles();
addTermsSettingsStyles();

// Auth State Listener - redirect ONLY if explicitly checked and no user
onAuthStateChanged(auth, async (user) => {
    console.log('Auth state changed:', user ? user.uid : 'no user');
    if (user) {
        currentUser = user;
        console.log('User authenticated:', user.uid);
        await loadUserStats();
    } else {
        window.resetMotoCareTheme?.();
        console.log('No user, redirecting to login');
        setTimeout(() => {
            window.location.href = "./index.html";
        }, 1000);
    }
});

// Load user statistics
async function loadUserStats() {
    if (!currentUser) return;
    
    try {
        // Get motorcycles count
        const bikes = await getFirestoreDocs('motorcycles');
        const bikeCount = bikes.length;
        currentBikeCount = bikeCount;
        console.log('Motorcycles count:', bikeCount);
        renderProfile(currentUser, bikeCount);

        // Get repairs/services count
        const repairs = await getFirestoreDocs('repairs');
        const serviceCount = repairs.length;
        console.log('Services count:', serviceCount);

        // Calculate total spent from repairs collection (use 'cost' field)
        let totalSpent = 0;
        repairs.forEach(doc => {
            totalSpent += parseFloat(doc.cost || 0);
        });
        
        console.log('Total spent:', totalSpent);
    } catch (error) {
        console.error("Error loading stats:", error);
    }
}

// Edit toggle - simple for now (no email editing)
window.toggleEdit = function() {
    openAccountSettings();
};

// Logout
window.logoutUser = async function() {
    try {
        window.resetMotoCareTheme?.();
        await auth.signOut();
        window.location.href = "./index.html";
    } catch (error) {
        console.error("Logout error:", error);
        showToast('Error logging out', 'error');
    }
};

// Show toast notification
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;
    
    const toast = document.createElement('div');
    const colors = {
        success: 'bg-green-700 text-white',
        error: 'bg-red-500 text-white',
        info: 'bg-blue-500 text-white'
    };
    
    const icons = {
        success: 'check-circle',
        error: 'alert-circle',
        info: 'info'
    };

    toast.className = `${colors[type]} rounded-lg px-4 py-3 shadow-lg flex items-center gap-2`;
    toast.innerHTML = `
        <i class="fa-solid fa-${icons[type]}"></i>
        <span class="text-sm font-medium">${message}</span>
    `;
    
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}