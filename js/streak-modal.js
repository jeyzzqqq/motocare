import { auth, onAuthStateChanged } from './firebase-config.js';

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
            <div class="streak-modal__day-circle${isComplete ? ' is-complete' : ''}">${isComplete ? '&#10003;' : DAY_LABELS[index]}</div>
            <span>${DAY_LABELS[index]}</span>
        </div>
    `).join('');
    const headline = `${state.streak}-Day Streak`;
    const subtext = `Nice, ${state.streak} day${state.streak === 1 ? '' : 's'} in a row checking your motorcycle.`;
    const progress = state.remaining === 0
        ? 'You completed your week. Keep it going!'
        : `${state.remaining} more day${state.remaining === 1 ? '' : 's'} to complete your week.`;

    return `
        <div class="streak-modal__backdrop" data-streak-dismiss>
            <section class="streak-modal" role="dialog" aria-modal="true" aria-labelledby="streakModalTitle">
                <button class="streak-modal__close" type="button" aria-label="Close streak modal" data-streak-dismiss>&times;</button>
                <div class="streak-modal__badge" aria-hidden="true">&#128293;</div>
                <h2 id="streakModalTitle">${headline}</h2>
                <p class="streak-modal__subtext">${subtext}</p>
                <div class="streak-modal__week" aria-label="Weekly check-in progress">${completedMarkup}</div>
                <p class="streak-modal__progress">${progress}</p>
                <button class="streak-modal__continue" type="button" data-streak-continue>Continue</button>
            </section>
        </div>
    `;
}

function addModalStyles() {
    if (document.getElementById('streak-modal-styles')) return;

    const style = document.createElement('style');
    style.id = 'streak-modal-styles';
    style.textContent = `
        .streak-modal__backdrop {
            position: fixed;
            inset: 0;
            z-index: 100;
            display: grid;
            place-items: center;
            padding: 20px;
            background: rgba(19, 24, 21, 0.5);
            backdrop-filter: blur(9px);
            -webkit-backdrop-filter: blur(9px);
            animation: streak-modal-fade-in 180ms ease-out;
        }
        .streak-modal {
            position: relative;
            width: min(100%, 380px);
            padding: 16px 16px 16px;
            border-radius: 18px;
            background: #fff;
            box-shadow: 0 20px 55px rgba(0, 0, 0, 0.24);
            text-align: center;
            animation: streak-modal-rise-in 220ms ease-out;
        }
        .streak-modal__close {
            position: absolute;
            top: 12px;
            right: 12px;
            width: 22px;
            height: 22px;
            padding: 0;
            border: 0;
            border-radius: 50%;
            color: #9ca3af;
            background: #f1f3f4;
            font-size: 18px;
            font-weight: 400;
            line-height: 20px;
            cursor: pointer;
        }
        .streak-modal__badge {
            display: grid;
            place-items: center;
            width: 42px;
            height: 42px;
            margin: 0 auto 10px;
            border-radius: 50%;
            background: #fff3d6;
            font-size: 22px;
        }
        .streak-modal h2 {
            margin: 0;
            color: #172033;
            font-family: sans-serif;
            font-size: 21px;
            font-weight: 700;
            line-height: 1.25;
        }
        .streak-modal__subtext {
            max-width: 265px;
            margin: 5px auto 16px;
            color: #7b8493;
            font-family: sans-serif;
            font-size: 12px;
            line-height: 1.35;
        }
        .streak-modal__week {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            gap: 6px;
            margin: 0 auto;
            max-width: 300px;
        }
        .streak-modal__day {
            display: flex;
            align-items: center;
            flex-direction: column;
            gap: 5px;
            color: #9aa2ad;
            font-family: sans-serif;
            font-size: 8px;
            font-weight: 500;
        }
        .streak-modal__day-circle {
            display: grid;
            place-items: center;
            width: 22px;
            height: 22px;
            border-radius: 50%;
            color: #9aa2ad;
            background: #f0f2f4;
            font-size: 9px;
        }
        .streak-modal__day-circle.is-complete {
            color: #fff;
            background: #2e9e4f;
            font-size: 13px;
        }
        .streak-modal__progress {
            margin: 13px 0 11px;
            color: #d9791f;
            font-family: sans-serif;
            font-size: 10px;
            font-weight: 600;
        }
        .streak-modal__continue {
            width: 100%;
            min-height: 34px;
            border: 0;
            border-radius: 11px;
            color: #fff;
            background: #2e9e4f;
            font-family: sans-serif;
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
        }
        .streak-modal__continue:hover { background: #278b45; }
        .streak-modal__continue:focus-visible,
        .streak-modal__close:focus-visible { outline: 3px solid rgba(46, 158, 79, 0.35); outline-offset: 2px; }
        @keyframes streak-modal-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes streak-modal-rise-in { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
    `;
    document.head.appendChild(style);
}

function dismissModal() {
    document.getElementById('streakModal')?.remove();
}

function showStreakModal(uid) {
    if (localStorage.getItem(LOGIN_PENDING_KEY) !== 'true') return;

    const state = getStreakState(uid);
    localStorage.removeItem(LOGIN_PENDING_KEY);
    if (state.data.completedOn === state.todayKey) return;

    addModalStyles();

    const modal = document.createElement('div');
    modal.id = 'streakModal';
    modal.innerHTML = getModalMarkup(state);
    const backdrop = modal.firstElementChild;
    document.body.appendChild(backdrop);

    backdrop.querySelector('[data-streak-dismiss]')?.addEventListener('click', (event) => {
        if (event.target === event.currentTarget || event.target.closest('.streak-modal__close')) dismissModal();
    });
    backdrop.querySelector('[data-streak-continue]')?.addEventListener('click', () => {
        state.data.dates = [...new Set([...state.data.dates, state.todayKey])].sort();
        state.data.completedOn = state.todayKey;
        writeStreak(uid, state.data);
        dismissModal();
        window.location.href = './dashboard.html';
    });
}

onAuthStateChanged(auth, (user) => {
    if (!user) return;
    showStreakModal(user.uid);
});
