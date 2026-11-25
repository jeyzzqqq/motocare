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
let helpSupportOpener = null;
let aboutMotoCareOpener = null;

const STREAK_PREFIX = 'motocare-streak-v1:';
const THEME_STORAGE_KEY = 'motocare.theme';
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const HELP_FAQS = [
    {
        question: 'How do I add a motorcycle?',
        answer: 'Go to My motorcycles and choose Add motorcycle. Enter the model, year, plate number and current odometer, then save your details.'
    },
    {
        question: 'How do service reminders work?',
        answer: 'MotoCare compares your current odometer with the recommended service interval for each task. When a service is close or overdue, it shows up in your Schedule and Dashboard. Reminders are estimates, so keep your odometer up to date.'
    },
    {
        question: 'How do I update my odometer?',
        answer: "Go to My motorcycles, tap your motorcycle's odometer, enter the new reading, then save. Updating it regularly keeps your reminders accurate."
    },
    {
        question: 'Can I edit a maintenance record?',
        answer: 'Yes. Open the record, change the details, then save. If you added a record by mistake, you can delete it instead.'
    },
    {
        question: 'What can MotoAI help me with?',
        answer: 'MotoAI can tell you what maintenance is due, explain what a service involves, and answer general questions about your motorcycle using your records. It gives general guidance only and can be wrong, so ask a qualified mechanic for anything involving safety.'
    },
    {
        question: 'How do I delete a motorcycle?',
        answer: 'Go to My motorcycles, open the motorcycle you want to remove, and choose Delete. It disappears from your list and your records.'
    },
    {
        question: 'How do I log a repair or expense?',
        answer: 'Go to Expenses and choose Add. Enter what was done, the cost, and the date, pick the motorcycle, then save. It will show up in your monthly total.'
    },
    {
        question: 'Is my data safe?',
        answer: "Your records are stored with Google Firebase and tied to your account, so you need to log in to see them. We never sell your data. Use a password you don't use anywhere else, and log out on shared devices."
    }
];
const ABOUT_INFORMATION = [
    { label: 'Version', value: '1.0.0 · Preview' },
    { label: 'Developed by', value: 'Team Unplanned' },
    { label: 'Platform', value: 'Web app (mobile-first)' }
];

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

function ensureHelpSupportMarkup() {
    if (document.getElementById('helpSupportBackdrop')) return;

    const root = document.createElement('div');
    root.innerHTML = `<div id="helpSupportBackdrop" class="motorcycles-modal-backdrop help-support-backdrop">
        <section class="motorcycles-modal-sheet help-support-sheet" role="dialog" aria-modal="true" aria-labelledby="helpSupportTitle" tabindex="-1">
            <div class="help-support__content">
                <a class="help-support__back" href="#" aria-label="Back to Account">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
                    <span>Account</span>
                </a>
                <main class="help-support__main">
                    <h2 id="helpSupportTitle" class="help-support__title">Help and Support</h2>
                    <p class="help-support__label">Frequently asked questions</p>
                    <div id="helpSupportFaqs" class="help-faq"></div>
                </main>
            </div>
        </section>
    </div>`;
    const backdrop = root.firstElementChild;
    const faqList = backdrop.querySelector('#helpSupportFaqs');

    HELP_FAQS.forEach((faq, index) => {
        const isInitiallyOpen = index === 0;
        const item = document.createElement('div');
        item.className = `help-faq__item${isInitiallyOpen ? ' is-open' : ''}`;

        const question = document.createElement('button');
        question.className = 'help-faq__question';
        question.type = 'button';
        question.id = `helpFaqQuestion${index + 1}`;
        question.setAttribute('aria-expanded', String(isInitiallyOpen));
        question.setAttribute('aria-controls', `helpFaqAnswer${index + 1}`);

        const questionText = document.createElement('span');
        questionText.textContent = faq.question;
        question.appendChild(questionText);
        question.insertAdjacentHTML('beforeend', '<svg class="help-faq__chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>');

        const answer = document.createElement('div');
        answer.className = 'help-faq__answer';
        answer.id = `helpFaqAnswer${index + 1}`;
        answer.setAttribute('role', 'region');
        answer.setAttribute('aria-labelledby', question.id);
        answer.setAttribute('aria-hidden', String(!isInitiallyOpen));
        answer.hidden = !isInitiallyOpen;

        const answerText = document.createElement('p');
        answerText.textContent = faq.answer;
        const answerInner = document.createElement('div');
        answerInner.className = 'help-faq__answer-inner';
        answerInner.appendChild(answerText);
        answer.appendChild(answerInner);

        item.append(question, answer);
        faqList.appendChild(item);
    });

    document.body.appendChild(backdrop);

    backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) closeHelpSupport();
    });
    backdrop.querySelector('.help-support__back').addEventListener('click', (event) => {
        event.preventDefault();
        closeHelpSupport();
    });
    faqList.addEventListener('click', (event) => {
        const question = event.target.closest('.help-faq__question');
        if (!question) return;

        const item = question.closest('.help-faq__item');
        const willExpand = question.getAttribute('aria-expanded') !== 'true';
        faqList.querySelectorAll('.help-faq__item').forEach((faqItem) => {
            if (faqItem !== item) setHelpFaqExpanded(faqItem, false);
        });
        setHelpFaqExpanded(item, willExpand);
    });
}

function finishHelpFaqCollapse(event) {
    if (event.target !== event.currentTarget || event.propertyName !== 'grid-template-rows') return;
    const answer = event.currentTarget;
    answer.removeEventListener('transitionend', finishHelpFaqCollapse);
    if (answer.getAttribute('aria-hidden') === 'true') answer.hidden = true;
}

function setHelpFaqExpanded(item, expanded) {
    const question = item.querySelector('.help-faq__question');
    const answer = item.querySelector('.help-faq__answer');
    if (question.getAttribute('aria-expanded') === String(expanded)) return;

    question.setAttribute('aria-expanded', String(expanded));
    if (expanded) {
        answer.removeEventListener('transitionend', finishHelpFaqCollapse);
        answer.hidden = false;
        answer.setAttribute('aria-hidden', 'false');
        requestAnimationFrame(() => {
            if (question.getAttribute('aria-expanded') === 'true') item.classList.add('is-open');
        });
        return;
    }

    answer.setAttribute('aria-hidden', 'true');
    item.classList.remove('is-open');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        answer.hidden = true;
    } else {
        answer.addEventListener('transitionend', finishHelpFaqCollapse);
    }
}

function openHelpSupport() {
    ensureHelpSupportMarkup();
    helpSupportOpener = document.getElementById('helpAndSupportRow');
    const backdrop = document.getElementById('helpSupportBackdrop');
    const dialog = backdrop.querySelector('.help-support-sheet');
    backdrop.classList.add('is-open');
    dialog.classList.add('is-open');
    document.body.classList.add('notification-settings-open');
    dialog.focus({ preventScroll: true });
}

function closeHelpSupport() {
    const backdrop = document.getElementById('helpSupportBackdrop');
    backdrop?.classList.remove('is-open');
    backdrop?.querySelector('.help-support-sheet')?.classList.remove('is-open');
    document.body.classList.remove('notification-settings-open');
    if (helpSupportOpener?.isConnected) helpSupportOpener.focus({ preventScroll: true });
    helpSupportOpener = null;
}

function ensureAboutMotoCareMarkup() {
    if (document.getElementById('aboutMotoCareBackdrop')) return;

    const root = document.createElement('div');
    root.innerHTML = `<div id="aboutMotoCareBackdrop" class="motorcycles-modal-backdrop about-motocare-backdrop">
        <section class="motorcycles-modal-sheet help-support-sheet about-motocare-sheet" role="dialog" aria-modal="true" aria-labelledby="aboutMotoCareTitle" tabindex="-1">
            <div class="help-support__content">
                <a class="help-support__back" href="#" aria-label="Back to Account">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
                    <span>Account</span>
                </a>
                <main class="help-support__main">
                    <h2 id="aboutMotoCareTitle" class="help-support__title">About MotoCare</h2>
                    <p class="about-motocare__intro">Your companion for better motorcycle care.</p>
                    <div class="about-motocare__brand">
                        <svg class="about-motocare__icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>
                        <span class="about-motocare__wordmark">MotoCare</span>
                    </div>
                    <p class="about-motocare__tagline">A little care goes a long way.</p>
                    <p class="about-motocare__description">Keep your motorcycle details, maintenance history, and expenses in one place, so you always know what's due and what you've spent. MotoAI is there when you need quick answers.</p>
                    <section class="about-motocare__information" aria-labelledby="aboutMotoCareInformationTitle">
                        <h3 id="aboutMotoCareInformationTitle" class="about-motocare__section-label">Application information</h3>
                        <div id="aboutMotoCareInfo"></div>
                    </section>
                </main>
            </div>
        </section>
    </div>`;
    const backdrop = root.firstElementChild;
    const infoList = backdrop.querySelector('#aboutMotoCareInfo');

    ABOUT_INFORMATION.forEach(({ label, value }) => {
        const row = document.createElement('div');
        row.className = 'about-motocare__info-row';

        const rowLabel = document.createElement('span');
        rowLabel.className = 'about-motocare__info-label';
        rowLabel.textContent = label;

        const rowValue = document.createElement('span');
        rowValue.className = 'about-motocare__info-value';
        rowValue.textContent = value;

        row.append(rowLabel, rowValue);
        infoList.appendChild(row);
    });

    document.body.appendChild(backdrop);

    backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) closeAboutMotoCare();
    });
    backdrop.querySelector('.help-support__back').addEventListener('click', (event) => {
        event.preventDefault();
        closeAboutMotoCare();
    });
}

function openAboutMotoCare() {
    ensureAboutMotoCareMarkup();
    aboutMotoCareOpener = document.querySelector('.profile-row[aria-label="About MotoCare"]');
    const backdrop = document.getElementById('aboutMotoCareBackdrop');
    const dialog = backdrop.querySelector('.about-motocare-sheet');
    backdrop.classList.add('is-open');
    dialog.classList.add('is-open');
    document.body.classList.add('notification-settings-open');
    dialog.focus({ preventScroll: true });
}

function closeAboutMotoCare() {
    const backdrop = document.getElementById('aboutMotoCareBackdrop');
    backdrop?.classList.remove('is-open');
    backdrop?.querySelector('.about-motocare-sheet')?.classList.remove('is-open');
    document.body.classList.remove('notification-settings-open');
    if (aboutMotoCareOpener?.isConnected) aboutMotoCareOpener.focus({ preventScroll: true });
    aboutMotoCareOpener = null;
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

function addHelpSupportStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .help-support-sheet {
            width: min(calc(100% - 14px), 480px);
            height: calc(100dvh - 5px);
            max-height: calc(100dvh - 5px);
            margin-bottom: 2px;
            border-radius: 12px;
            background: var(--moto-surface);
        }
        .help-support__content {
            display: flex;
            min-height: 0;
            height: 100%;
            flex-direction: column;
            padding: max(12px, env(safe-area-inset-top)) 16px 0;
        }
        .help-support__back {
            display: flex;
            min-height: 38px;
            flex: 0 0 auto;
            align-items: center;
            gap: 7px;
            color: var(--moto-primary);
            font-size: 13px;
            text-decoration: none;
        }
        .help-support__back svg {
            width: 18px;
            height: 18px;
            fill: none;
            stroke: currentColor;
            stroke-linecap: round;
            stroke-linejoin: round;
            stroke-width: 1.75;
        }
        .help-support__main {
            min-height: 0;
            flex: 1;
            overflow-y: auto;
            padding: 6px 0 12px;
            overscroll-behavior: contain;
            scrollbar-width: none;
        }
        .help-support__main::-webkit-scrollbar { display: none; }
        .help-support__title {
            margin: 0;
            color: var(--moto-text);
            font-size: 20px;
            font-weight: 700;
            line-height: 1.2;
        }
        .about-motocare__intro {
            margin: 16px 0 0;
            color: var(--moto-muted);
            font-size: 13px;
            line-height: 1.45;
        }
        .about-motocare__brand {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-top: 42px;
        }
        .about-motocare__icon {
            width: 24px;
            height: 24px;
            flex: 0 0 24px;
            fill: none;
            stroke: var(--moto-primary);
            stroke-linecap: round;
            stroke-linejoin: round;
            stroke-width: 1.75;
        }
        .about-motocare__wordmark {
            color: var(--moto-text);
            font-size: 24px;
            font-weight: 700;
            line-height: 1.2;
        }
        .about-motocare__tagline {
            margin: 14px 0 0;
            color: var(--moto-text);
            font-size: 14px;
            font-weight: 600;
            line-height: 1.35;
        }
        .about-motocare__description {
            margin: 10px 0 0;
            color: var(--moto-muted);
            font-size: 13px;
            line-height: 1.45;
        }
        .about-motocare__information {
            margin-top: 34px;
            padding-top: 22px;
            border-top: 1px solid var(--moto-border);
        }
        .about-motocare__section-label {
            margin: 0 0 8px;
            color: var(--moto-muted);
            font-size: 8px;
            font-weight: 500;
            letter-spacing: .04em;
            line-height: 1.3;
            text-transform: uppercase;
        }
        .about-motocare__info-row {
            display: flex;
            min-height: 47px;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 12px 0;
            border-bottom: 1px solid var(--moto-border);
            font-size: 12px;
            line-height: 1.35;
        }
        .about-motocare__info-label { color: var(--moto-muted); }
        .about-motocare__info-value { color: var(--moto-text); text-align: right; }
        .help-support__label {
            margin: 24px 0 10px;
            color: var(--moto-muted);
            font-size: 8px;
            font-weight: 500;
            letter-spacing: .04em;
            line-height: 1.3;
            text-transform: uppercase;
        }
        .help-faq__item { border-bottom: 1px solid var(--moto-border); }
        .help-faq__question {
            display: flex;
            width: 100%;
            min-height: 43px;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 10px 0;
            border: 0;
            color: var(--moto-text);
            background: transparent;
            font: 400 11px/1.35 var(--moto-font);
            text-align: left;
            cursor: pointer;
        }
        .help-faq__question:active { transform: none; }
        .help-faq__chevron {
            width: 18px;
            height: 18px;
            flex: 0 0 18px;
            fill: none;
            stroke: var(--moto-streak-primary);
            stroke-linecap: round;
            stroke-linejoin: round;
            stroke-width: 1.75;
            transition: transform 200ms ease;
        }
        .help-faq__item.is-open .help-faq__chevron { transform: rotate(90deg); }
        .help-faq__answer {
            display: grid;
            grid-template-rows: 0fr;
            opacity: 0;
            transition: grid-template-rows 200ms ease, opacity 200ms ease;
        }
        .help-faq__answer[hidden] { display: none; }
        .help-faq__item.is-open .help-faq__answer {
            grid-template-rows: 1fr;
            opacity: 1;
        }
        .help-faq__answer-inner { min-height: 0; overflow: hidden; }
        .help-faq__answer p {
            margin: 0 0 12px;
            color: var(--moto-muted);
            font-size: 11px;
            line-height: 1.4;
        }
        .help-support__back:focus-visible,
        .help-faq__question:focus-visible {
            outline: 2px solid var(--moto-primary);
            outline-offset: 3px;
        }
        @media (prefers-reduced-motion: reduce) {
            .help-faq__chevron,
            .help-faq__answer { transition: none; }
        }
        @media (min-width: 481px) {
            .help-support-sheet {
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

document.getElementById('helpAndSupportRow')?.addEventListener('click', openHelpSupport);
document.querySelector('.profile-row[aria-label="About MotoCare"]')?.addEventListener('click', openAboutMotoCare);
document.getElementById('termsAndConditionsRow')?.addEventListener('click', openTermsSettings);
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.getElementById('termsSettingsBackdrop')?.classList.contains('is-open')) {
        closeTermsSettings();
    }
    if (event.key === 'Escape' && document.getElementById('helpSupportBackdrop')?.classList.contains('is-open')) {
        closeHelpSupport();
    }
    if (event.key === 'Escape' && document.getElementById('aboutMotoCareBackdrop')?.classList.contains('is-open')) {
        closeAboutMotoCare();
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
addHelpSupportStyles();

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