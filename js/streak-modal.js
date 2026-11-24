import { auth, onAuthStateChanged } from './firebase-config.js?v=3';

const STORAGE_PREFIX = 'motocare-streak-v1:';
const LOGIN_PENDING_KEY = 'motocare-streak-login-pending';
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function getDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseDate(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(year, month - 1, day);
}

function getYesterdayKey() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return getDateKey(yesterday);
}

function getMonday(date = new Date()) {
    const monday = new Date(date);
    const day = monday.getDay();
    monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));
    monday.setHours(0, 0, 0, 0);
    return monday;
}

function getStorageKey(uid) {
    return `${STORAGE_PREFIX}${uid}`;
}

function readStreak(uid) {
    try {
        return JSON.parse(localStorage.getItem(getStorageKey(uid))) || { dates: [], completedOn: '' };
    } catch (error) {
        console.warn('Unable to read streak data:', error);
        return { dates: [], completedOn: '' };
    }
}

function writeStreak(uid, data) {
    localStorage.setItem(getStorageKey(uid), JSON.stringify(data));
}

function getStreakState(uid) {
    const today = new Date();
    const todayKey = getDateKey(today);
    const data = readStreak(uid);
    const storedDates = [...new Set(data.dates || [])].sort();
    const dates = [...new Set([...storedDates, todayKey])].sort();
    let streak = 1;
    let cursor = todayKey;

    while (dates.includes(getDateKey(new Date(parseDate(cursor).setDate(parseDate(cursor).getDate() - 1))))) {
        streak += 1;
        const previous = parseDate(cursor);
        previous.setDate(previous.getDate() - 1);
        cursor = getDateKey(previous);
    }

    const monday = getMonday(today);
    const weekDates = DAY_LABELS.map((_, index) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + index);
        return getDateKey(date);
    });
    const completed = weekDates.map((date) => dates.includes(date) && date <= todayKey);
    const completedCount = completed.filter(Boolean).length;

    return {
        data: { dates: storedDates, completedOn: data.completedOn || '' },
        todayKey,
        streak,
        completed,
        completedCount,
        remaining: Math.max(0, 7 - completedCount)
    };
}

function getModalMarkup(state) {
    const completedMarkup = state.completed.map((isComplete, index) => `
        <div class="streak-modal__day">
            <div class="streak-modal__day-circle${isComplete ? ' is-complete' : ''}"${isComplete ? ' aria-label="Completed"' : ''}>
                ${isComplete ? `
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M20 6 9 17l-5-5"/>
                    </svg>
                ` : ''}
            </div>
            <span>${DAY_LABELS[index]}</span>
        </div>
    `).join('');
    const subtext = `${state.streak} day${state.streak === 1 ? '' : 's'} in a row checking on your motorcycle.`;
    const progress = state.remaining === 0
        ? 'You completed your week!'
        : `${state.remaining} more day${state.remaining === 1 ? '' : 's'} to complete your week`;

    return `
        <div class="streak-modal__backdrop" data-streak-dismiss aria-hidden="true"></div>
        <section class="streak-modal" role="dialog" aria-modal="true" aria-labelledby="streakModalTitle" tabindex="-1">
            <button class="streak-modal__close" type="button" aria-label="Close streak modal" data-streak-dismiss>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M18 6 6 18"/>
                    <path d="m6 6 12 12"/>
                </svg>
            </button>
            <div class="streak-modal__badge" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
                </svg>
            </div>
            <h2 id="streakModalTitle" class="streak-modal__number" aria-live="polite">0</h2>
            <p class="streak-modal__label">DAY STREAK</p>
            <p class="streak-modal__subtext">${subtext}</p>
            <div class="streak-modal__week" aria-label="Weekly check-in progress">${completedMarkup}</div>
            <p class="streak-modal__progress">${progress}</p>
            <button class="streak-modal__continue" type="button" data-streak-continue>Continue</button>
        </section>
    `;
}

function addModalStyles() {
    if (document.getElementById('streak-modal-styles')) return;

    const style = document.createElement('style');
    style.id = 'streak-modal-styles';
    style.textContent = `
        #streakModal {
            position: fixed;
            inset: 0;
            z-index: 1000;
            pointer-events: none;
        }
        .streak-modal__backdrop {
            position: absolute;
            inset: 0;
            display: grid;
            place-items: center;
            padding: 20px;
            background: rgba(17, 22, 19, 0.32);
            backdrop-filter: blur(9px);
            -webkit-backdrop-filter: blur(9px);
            opacity: 0;
            pointer-events: auto;
            transition: opacity 200ms ease-out;
            z-index: 1;
        }
        .streak-modal {
            position: absolute;
            top: 50%;
            left: 50%;
            z-index: 2;
            width: calc(100% - 40px);
            max-width: 360px;
            margin: 0;
            padding: 24px;
            border-radius: 28px;
            background: var(--moto-surface);
            box-shadow: 0 20px 55px rgba(17, 22, 19, 0.24);
            text-align: center;
            opacity: 0;
            visibility: hidden;
            transform: translate(-50%, -50%) scale(.96);
            pointer-events: none;
            transition: opacity 250ms cubic-bezier(.22, 1, .36, 1),
                        transform 250ms cubic-bezier(.22, 1, .36, 1),
                        visibility 250ms;
        }
        #streakModal.is-open { pointer-events: auto; }
        #streakModal.is-open .streak-modal__backdrop { opacity: 1; }
        #streakModal.is-open .streak-modal {
            opacity: 1;
            visibility: visible;
            transform: translate(-50%, -50%) scale(1);
            pointer-events: auto;
        }
        .streak-modal__close {
            position: absolute;
            top: 10px;
            right: 10px;
            width: 44px;
            height: 44px;
            padding: 0;
            border: 0;
            border-radius: 50%;
            display: grid;
            place-items: center;
            color: var(--moto-streak-close);
            background: transparent;
            cursor: pointer;
        }
        .streak-modal__close:active { background: var(--moto-icon-tile); transform: scale(.96); }
        .streak-modal__badge {
            display: grid;
            place-items: center;
            width: 64px;
            height: 64px;
            margin: 6px auto 10px;
            border-radius: 50%;
            background: var(--moto-icon-tile);
            color: var(--moto-due-soon);
        }
        .streak-modal__badge.is-animated svg { animation: streak-modal-flame 600ms ease-out; }
        .streak-modal__number {
            min-height: 72px;
            margin: 0;
            color: var(--moto-text);
            font-family: var(--moto-font);
            font-size: clamp(52px, 18vw, 64px);
            font-weight: 700;
            letter-spacing: -.04em;
            line-height: 1;
        }
        .streak-modal__label {
            margin: 6px 0 0;
            color: var(--moto-muted);
            font-family: var(--moto-font);
            font-size: 9px;
            font-weight: 600;
            letter-spacing: .12em;
            line-height: 1.2;
            text-transform: uppercase;
        }
        .streak-modal__subtext {
            max-width: 280px;
            margin: 22px auto 18px;
            color: var(--moto-muted);
            font-family: var(--moto-font);
            font-size: 16px;
            line-height: 1.35;
        }
        .streak-modal__week {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            gap: 6px;
            margin: 0 auto;
            max-width: 296px;
        }
        .streak-modal__day {
            display: flex;
            align-items: center;
            flex-direction: column;
            gap: 8px;
            min-width: 0;
            color: var(--moto-muted);
            font-family: var(--moto-font);
            font-size: 10px;
            font-weight: 500;
        }
        .streak-modal__day-circle {
            display: grid;
            place-items: center;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            border: 1.5px solid var(--moto-streak-incomplete-border);
            color: transparent;
            background: var(--moto-surface);
        }
        .streak-modal__day-circle.is-complete {
            color: var(--moto-surface);
            border-color: var(--moto-streak-primary);
            background: var(--moto-streak-primary);
            opacity: 0;
            transform: scale(.6);
        }
        .streak-modal__day-circle.is-complete.is-pop {
            animation: streak-modal-pop 220ms cubic-bezier(.22, 1, .36, 1) forwards;
        }
        .streak-modal__day-circle svg {
            opacity: 0;
        }
        .streak-modal__day-circle.is-complete svg {
            opacity: 1;
        }
        .streak-modal__day-circle.is-complete.is-pop svg {
            animation: streak-modal-check-fade 180ms ease-out both;
        }
        .streak-modal__progress {
            margin: 18px 0 14px;
            color: var(--moto-muted);
            font-family: var(--moto-font);
            font-size: 12px;
            line-height: 1.35;
        }
        .streak-modal__continue {
            width: 100%;
            min-height: 52px;
            border: 0;
            border-radius: var(--moto-radius-pill);
            color: var(--moto-surface);
            background: var(--moto-streak-primary);
            font-family: var(--moto-font);
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 120ms ease-out, background 120ms ease-out;
        }
        .streak-modal__continue:active { transform: scale(.98); }
        .streak-modal__continue:focus-visible,
        .streak-modal__close:focus-visible { outline: 3px solid rgba(46, 158, 79, 0.35); outline-offset: 2px; }
        @keyframes streak-modal-pop {
            from { opacity: 0; transform: scale(.6); }
            to { opacity: 1; transform: scale(1); }
        }
        @keyframes streak-modal-check-fade {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        @keyframes streak-modal-flame {
            0%, 100% { transform: scale(1) rotate(0); }
            45% { transform: scale(1.12) rotate(-7deg); }
            75% { transform: scale(1.05) rotate(5deg); }
        }
        #streakModal.is-closing .streak-modal__backdrop { opacity: 0; }
        #streakModal.is-closing .streak-modal {
            opacity: 0;
            visibility: visible;
            transform: translate(-50%, -50%) scale(.96);
            pointer-events: none;
        }
        @media (prefers-reduced-motion: reduce) {
            .streak-modal__backdrop,
            .streak-modal,
            .streak-modal__continue { transition: none; }
            .streak-modal__badge.is-animated svg,
            .streak-modal__day-circle.is-complete.is-pop,
            .streak-modal__day-circle.is-complete.is-pop svg { animation: none; }
            .streak-modal__day-circle.is-complete { opacity: 1; transform: scale(1); }
            .streak-modal__day-circle.is-complete svg { opacity: 1; }
        }
    `;
    document.head.appendChild(style);
}

let streakModalState = null;

function dismissModal() {
    if (!streakModalState) {
        document.getElementById('streakModal')?.remove();
        return;
    }

    const state = streakModalState;
    if (state.closing) return;
    state.closing = true;
    state.modal.classList.add('is-closing');
    state.modal.classList.remove('is-open');

    document.removeEventListener('keydown', state.escapeHandler);
    window.setTimeout(() => {
        state.modal.remove();
        document.body.style.overflow = state.previousOverflow;
        state.previousFocus?.focus?.();
        streakModalState = null;
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 150);
}

function animateStreakModal(modal, streak) {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const number = modal.querySelector('.streak-modal__number');
    const badge = modal.querySelector('.streak-modal__badge');

    if (reduceMotion) {
        if (number) number.textContent = String(streak);
        modal.querySelectorAll('.streak-modal__day-circle.is-complete').forEach((circle) => circle.classList.add('is-pop'));
        return;
    }

    badge?.classList.add('is-animated');
    const started = performance.now();
    const duration = 700;

    function updateNumber(now) {
        const progress = Math.min(1, (now - started) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        if (number) number.textContent = String(Math.round(streak * eased));
        if (progress < 1) window.requestAnimationFrame(updateNumber);
    }
    window.requestAnimationFrame(updateNumber);

    modal.querySelectorAll('.streak-modal__day-circle.is-complete').forEach((circle, index) => {
        window.setTimeout(() => circle.classList.add('is-pop'), 60 * index);
    });
}

function showStreakModal(uid, manual = false) {
    if (!manual && localStorage.getItem(LOGIN_PENDING_KEY) !== 'true') return;
    if (document.getElementById('streakModal')) return;

    const state = getStreakState(uid);
    if (!manual) localStorage.removeItem(LOGIN_PENDING_KEY);
    if (!manual && state.data.completedOn === state.todayKey) return;

    addModalStyles();

    const modal = document.createElement('div');
    modal.id = 'streakModal';
    modal.innerHTML = getModalMarkup(state);
    document.body.appendChild(modal);

    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const escapeHandler = (event) => {
        if (event.key === 'Escape') dismissModal();
    };
    streakModalState = { modal, closing: false, previousFocus, previousOverflow, escapeHandler };
    document.addEventListener('keydown', escapeHandler);

    modal.querySelector('.streak-modal__backdrop')?.addEventListener('click', dismissModal);
    modal.querySelector('.streak-modal__close')?.addEventListener('click', dismissModal);
    modal.querySelector('[data-streak-continue]')?.addEventListener('click', () => {
        state.data.dates = [...new Set([...state.data.dates, state.todayKey])].sort();
        state.data.completedOn = state.todayKey;
        writeStreak(uid, state.data);
        dismissModal();
        window.location.href = './dashboard.html';
    });

    window.requestAnimationFrame(() => {
        modal.classList.add('is-open');
        modal.querySelector('.streak-modal')?.focus({ preventScroll: true });
        animateStreakModal(modal, state.streak);
    });
}

window.openStreakModal = (uid) => showStreakModal(uid, true);
onAuthStateChanged(auth, (user) => {
    if (!user) return;
    showStreakModal(user.uid);
});
