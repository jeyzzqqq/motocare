import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { cleanupOrphanedMotorcycleRecords } from './firebaseUtils.js';
import { normalizeRecord } from './utils-module.js';

let allRecords = [];
let currentUserId = null;

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    currentUserId = user.uid;
    await loadHistory(user.uid);
});

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => renderHistory(allRecords));
    }
});

async function loadHistory(userId) {
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
            .map((docSnap) => normalizeRecord(Object.assign({ id: docSnap.id }, docSnap.data())))
            .filter((record) => record.uid === userId && record.deleted !== true)
            .sort((a, b) => getRecordTime(b) - getRecordTime(a));

        renderHistory(allRecords);
    } catch (error) {
        console.error('Error loading history:', error);
        allRecords = [];
        renderHistory([]);
    }
}

function renderHistory(records) {
    const searchInput = document.getElementById('searchInput');
    const queryText = (searchInput?.value || '').trim().toLowerCase();

    const filtered = records.filter((record) => {
        if (!queryText) return true;
        return [
            record.title,
            record.task,
            record.category,
            record.motorcycleName,
            record.mechanic,
            record.notes
        ].some((value) => String(value || '').toLowerCase().includes(queryText));
    });

    updateSummary(records, filtered);
    renderList(filtered);
}

function updateSummary(records, filteredRecords) {
    const totalRepairs = document.getElementById('totalRepairs');
    const totalHistorySpent = document.getElementById('totalHistorySpent');
    const recordCount = document.getElementById('recordCount');

    const totalSpent = records.reduce((sum, record) => sum + Number(record.cost || 0), 0);

    if (totalRepairs) {
        totalRepairs.textContent = String(records.length);
    }

    if (totalHistorySpent) {
        totalHistorySpent.textContent = `₱${totalSpent.toFixed(2)}`;
    }

    if (recordCount) {
        recordCount.textContent = `${filteredRecords.length} entr${filteredRecords.length === 1 ? 'y' : 'ies'}`;
    }
}

function renderList(records) {
    const container = document.getElementById('historyList');
    if (!container) return;

    if (!records.length) {
        container.innerHTML = `
            <div class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center text-gray-500">
                <i class="lucide lucide-receipt text-4xl mb-3 block text-gray-300"></i>
                <p>No repair records found.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = records.map((record) => {
        const dateText = formatRecordDate(record);
        const amountText = `₱${Number(record.cost || 0).toFixed(2)}`;
        const motorcycleLabel = record.motorcycleName || [record.brand, record.model].filter(Boolean).join(' ');

        return `
            <div class="bg-white rounded-2xl p-4 shadow-md border border-gray-100 mb-4">
                <div class="flex items-start justify-between gap-3">
                    <div class="flex items-start gap-3 flex-1">
                        <div class="w-11 h-11 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                            <i class="lucide lucide-check-circle-2 text-green-700 text-xl"></i>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                                <p class="font-semibold text-gray-800 truncate">${escapeHtml(record.title || record.task || 'Repair')}</p>
                                ${motorcycleLabel ? `<span class="text-xs bg-green-700 text-white px-2 py-1 rounded-full font-medium">${escapeHtml(motorcycleLabel)}</span>` : ''}
                            </div>
                            <p class="text-sm text-gray-500 mt-1">${escapeHtml(record.category || 'Maintenance')}</p>
                            <div class="flex items-center gap-2 mt-2 text-xs text-gray-500 flex-wrap">
                                <span>${escapeHtml(dateText)}</span>
                                ${record.mechanic ? `<span>• ${escapeHtml(record.mechanic)}</span>` : ''}
                                ${record.mileage ? `<span>• ${escapeHtml(String(record.mileage))} km</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="text-green-700 font-bold shrink-0">${amountText}</div>
                </div>
                ${record.notes ? `<p class="mt-3 text-sm text-gray-600 leading-relaxed">${escapeHtml(record.notes)}</p>` : ''}
            </div>
        `;
    }).join('');
}

function getRecordTime(record) {
    const raw = record.date || record.createdAt || record.updatedAt || '';
    const parsed = raw instanceof Date ? raw : new Date(raw);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function formatRecordDate(record) {
    const raw = record.date || record.createdAt || record.updatedAt || '';
    const parsed = raw instanceof Date ? raw : new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(value) {
    if (typeof value !== 'string') return String(value ?? '');
    return value.replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[char]);
}

// Export history feature removed
