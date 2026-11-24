import { auth, db } from './firebase-config.js?v=3';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";
import { cleanupOrphanedMotorcycleRecords } from './firebaseUtils.js';
import { normalizeRecord } from './utils-module.js';

let allRecords = [];
let currentUserId = null;
let historyReady = false;

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    currentUserId = user.uid;
    await loadHistory(user.uid);
});

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('searchInput')?.addEventListener('input', () => {
        if (historyReady) renderHistory(allRecords);
    });
    document.getElementById('historyRetry')?.addEventListener('click', () => {
        if (currentUserId) loadHistory(currentUserId);
    });
});

window.addEventListener('addrecord:saved', () => {
    if (currentUserId) loadHistory(currentUserId);
});

async function loadHistory(userId) {
    historyReady = false;
    setHistoryState('loading');
    try {
        const motorcyclesSnapshot = await getDocs(query(
            collection(db, 'motorcycles'),
            where('uid', '==', userId)
        ));

        await cleanupOrphanedMotorcycleRecords(motorcyclesSnapshot.docs);

        const repairsSnapshot = await getDocs(query(
            collection(db, 'repairs'),
            where('uid', '==', userId)
        ));

        allRecords = repairsSnapshot.docs
            .map((docSnap) => {
                const rawRecord = Object.assign({ id: docSnap.id }, docSnap.data());
                const record = normalizeRecord(rawRecord);
                record.expenseAmount = rawRecord.amount ?? rawRecord.cost ?? rawRecord.total;
                return record;
            })
            .filter((record) => record.uid === userId && record.deleted !== true)
            .sort((a, b) => getRecordTime(b) - getRecordTime(a));

        renderHistory(allRecords);
    } catch (error) {
        console.error('Error loading history:', error);
        allRecords = [];
        setHistoryState('error');
    }
}

function setHistoryState(state) {
    const summary = document.getElementById('historySummary');
    const loading = document.getElementById('historyLoading');
    const error = document.getElementById('historyError');
    const list = document.getElementById('historyList');

    if (summary) summary.hidden = state !== 'loaded';
    if (loading) loading.hidden = state !== 'loading';
    if (error) error.hidden = state !== 'error';
    if (list) list.hidden = state !== 'loaded';
}

function renderHistory(records) {
    const searchInput = document.getElementById('searchInput');
    const queryText = (searchInput?.value || '').trim().toLowerCase();
    const filtered = records.filter((record) => [
        record.title,
        record.task,
        record.category,
        record.motorcycleName,
        record.motorcycle,
        record.brand,
        record.model,
        record.mechanic,
        record.notes,
        record.description
    ].some((value) => String(value || '').toLowerCase().includes(queryText)));

    updateSummary(filtered);
    renderList(filtered, records.length === 0, Boolean(queryText));
    historyReady = true;
    setHistoryState('loaded');
}

function updateSummary(records) {
    const totalRepairs = document.getElementById('totalRepairs');
    const totalHistorySpent = document.getElementById('totalHistorySpent');
    const totalSpent = records.reduce((sum, record) => sum + getRepairAmount(record), 0);

    if (totalRepairs) {
        totalRepairs.textContent = `${records.length} ${records.length === 1 ? 'repair' : 'repairs'}`;
    }

    if (totalHistorySpent) totalHistorySpent.textContent = formatRepairAmount(totalSpent);
}

function renderList(records, noRepairs, hasSearch) {
    const container = document.getElementById('historyList');
    if (!container) return;
    container.replaceChildren();

    if (!records.length) {
        container.appendChild(createEmptyState(noRepairs, hasSearch));
        return;
    }

    const groups = new Map();
    records.forEach((record) => {
        const date = getRecordDate(record);
        const key = date ? `${date.getFullYear()}-${date.getMonth()}` : '';
        if (!groups.has(key)) groups.set(key, { date, records: [] });
        groups.get(key).records.push(record);
    });

    groups.forEach((group) => {
        if (group.date) {
            const heading = document.createElement('h2');
            heading.className = 'repair-history__month';
            heading.textContent = group.date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            container.appendChild(heading);
        }

        group.records.forEach((record) => container.appendChild(createRepairCard(record)));
    });
}

function createRepairCard(record) {
    const card = document.createElement('article');
    card.className = 'repair-card';

    const headingRow = document.createElement('div');
    headingRow.className = 'repair-card__heading';
    const icon = document.createElement('span');
    icon.className = 'repair-card__icon';
    icon.appendChild(createWrenchIcon());
    headingRow.appendChild(icon);

    const title = getRecordTitle(record);
    if (title) {
        const titleElement = document.createElement('h3');
        titleElement.className = 'repair-card__title';
        titleElement.textContent = title;
        headingRow.appendChild(titleElement);
    }
    card.appendChild(headingRow);

    const detailsRow = document.createElement('div');
    detailsRow.className = 'repair-card__details';
    const motorcycleName = getMotorcycleName(record);
    const bikeElement = document.createElement('p');
    bikeElement.className = 'repair-card__bike';
    bikeElement.textContent = motorcycleName;
    bikeElement.hidden = !motorcycleName;
    detailsRow.appendChild(bikeElement);

    if (hasRepairAmount(record)) {
        const amount = document.createElement('p');
        amount.className = 'repair-card__amount';
        amount.textContent = formatRepairAmount(getRepairAmount(record));
        detailsRow.appendChild(amount);
    }
    card.appendChild(detailsRow);

    const divider = document.createElement('div');
    divider.className = 'repair-card__divider';
    card.appendChild(divider);

    const dateAndMileage = [];
    const dateText = formatRecordDate(record);
    const mileageText = formatMileage(record.mileage);
    if (dateText) dateAndMileage.push(dateText);
    if (mileageText) dateAndMileage.push(`${mileageText} km`);
    if (dateAndMileage.length) {
        const meta = document.createElement('p');
        meta.className = 'repair-card__meta';
        meta.textContent = dateAndMileage.join(' · ');
        card.appendChild(meta);
    }

    const notes = String(record.notes || '').trim() || String(record.description || '').trim();
    if (notes) {
        const notesElement = document.createElement('p');
        notesElement.className = 'repair-card__notes';
        notesElement.textContent = notes;
        card.appendChild(notesElement);
    }

    return card;
}

function createEmptyState(noRepairs, hasSearch) {
    const state = document.createElement('section');
    state.className = 'repair-history__empty';
    const title = document.createElement('p');
    title.textContent = noRepairs ? 'No repairs yet' : hasSearch ? 'No matching repairs' : 'No repairs yet';
    state.appendChild(title);

    if (noRepairs) {
        const addRepair = document.createElement('a');
        addRepair.className = 'repair-history__empty-add';
        addRepair.href = 'add-record.html';
        addRepair.textContent = 'Add repair';
        state.appendChild(addRepair);
    }
    return state;
}

function createWrenchIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.3-3.3a6 6 0 0 1-7.9 7.9l-6.7 6.7a2.1 2.1 0 0 1-3-3l6.7-6.7a6 6 0 0 1 7.9-7.9z');
    svg.appendChild(path);
    return svg;
}

function getRepairAmount(record = {}) {
    const value = record.expenseAmount ?? record.amount ?? record.cost ?? record.total ?? 0;
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : 0;
}

function hasRepairAmount(record = {}) {
    return record.expenseAmount !== null
        && record.expenseAmount !== undefined
        && !(typeof record.expenseAmount === 'string' && !record.expenseAmount.trim());
}

function formatRepairAmount(amount) {
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        maximumFractionDigits: 0
    }).format(amount);
}

function getRecordTitle(record = {}) {
    return [record.title, record.task, record.name]
        .map((value) => String(value || '').trim())
        .find(Boolean) || '';
}

function getMotorcycleName(record = {}) {
    const bikeName = String(record.motorcycleName || '').trim();
    const brandAndModel = [record.brand, record.model]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(' ');
    return bikeName || brandAndModel || String(record.motorcycle || '').trim();
}

function getRecordDate(record = {}) {
    for (const raw of [record.date, record.createdAt, record.updatedAt]) {
        if (!raw) continue;
        const date = typeof raw.toDate === 'function'
            ? raw.toDate()
            : raw instanceof Date
                ? raw
                : new Date(raw);
        if (!Number.isNaN(date.getTime())) return date;
    }
    return null;
}

function getRecordTime(record) {
    return getRecordDate(record)?.getTime() || 0;
}

function formatRecordDate(record) {
    const date = getRecordDate(record);
    return date
        ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '';
}

function formatMileage(value) {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'string' && !value.trim()) return '';
    const numeric = Number(typeof value === 'string' ? value.replace(/,/g, '') : value);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric.toLocaleString('en-US') : '';
}
