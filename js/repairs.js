import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, query, where, getDocs, orderBy, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getFirestoreDocs, deleteFirestoreDoc, updateFirestoreDoc } from './firebaseUtils.js';

let cachedRepairs = [];
let currentEditingRepair = null;
let isLoading = false;

const listTarget = document.getElementById("repairList");
const statsTarget = document.getElementById("repairStats");
const searchInput = document.getElementById("repairSearch");
const logoutButton = document.getElementById("logoutButton");

onAuthStateChanged(auth, async (user) => {
    if (user) {
        document.getElementById('userName')?.textContent = user.email?.split('@')[0];
        showRepairsSkeleton();
        await loadRepairs(user.uid);
        setupEventListeners();
    } else {
        window.location.href = 'index.html';
    }
});

// LOGOUT HANDLER
logoutButton?.addEventListener('click', async () => {
    try {
        await signOut(auth);
        showToast('Logged out successfully', 'success');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 500);
    } catch (error) {
        console.error('Logout error:', error);
        showToast('Error logging out', 'error');
    }
});

function showRepairsSkeleton() {
    if (listTarget) {
        listTarget.innerHTML = `
            <div class="animate-pulse bg-gray-200 h-24 rounded-xl mb-3"></div>
            <div class="animate-pulse bg-gray-200 h-24 rounded-xl mb-3"></div>
            <div class="animate-pulse bg-gray-200 h-24 rounded-xl"></div>
        `;
    }
    if (statsTarget) {
        statsTarget.innerHTML = '';
    }
}

async function loadRepairs(userId) {
    try {
        isLoading = true;
        const q = query(
            collection(db, 'repairs'),
            where('uid', '==', userId),
            orderBy('date', 'desc')
        );
        const querySnapshot = await getDocs(q);
        
        cachedRepairs = querySnapshot.docs
            .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
            .filter(record => record.uid === userId);
        
        if (cachedRepairs.length === 0) {
            renderEmptyState();
        } else {
            renderRepairs();
            updateStats();
        }
    } catch (error) {
        console.error('Error loading repairs:', error);
        showToast('Error loading repairs', 'error');
        renderEmptyState();
    } finally {
        isLoading = false;
    }
}

function renderEmptyState() {
    if (listTarget) {
        listTarget.innerHTML = '<div class="text-gray-500 text-sm py-6 text-center">No repairs yet. Add your first repair from the Dashboard.</div>';
    }
    if (statsTarget) {
        statsTarget.innerHTML = '';
    }
}

function renderRepairs() {
    if (!listTarget) return;
    
    if (cachedRepairs.length === 0) {
        renderEmptyState();
        return;
    }
    
    listTarget.innerHTML = cachedRepairs.map(repair => renderRepair(repair)).join('');
    
    // Add event listeners to delete buttons
    listTarget.querySelectorAll('.delete-repair-btn').forEach(btn => {
        btn.addEventListener('click', (e) => handleDeleteRepair(e));
    });
}

function renderRepair(repair) {
    return `
        <div class="bg-white rounded-2xl p-5 shadow-md border border-gray-100 mb-3 hover:shadow-lg transition-all">
            <div class="flex items-start justify-between gap-4">
                <div class="flex-1">
                    <div class="flex items-center gap-3 flex-wrap mb-2">
                        <div class="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                            <i class="lucide lucide-wrench text-green-700"></i>
                        </div>
                        <div>
                            <h3 class="text-lg font-bold text-gray-800">${repair.title || 'Repair'}</h3>
                            <p class="text-xs text-gray-500">${repair.category || 'General'}</p>
                        </div>
                    </div>
                    
                    <div class="flex items-center gap-2 flex-wrap mb-2">
                        ${repair.motorcycleName ? `<span class="text-xs bg-green-700 text-white px-2 py-1 rounded-full font-medium">${repair.motorcycleName}</span>` : ''}
                        <span class="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">${repair.date || 'N/A'}</span>
                    </div>
                    
                    ${repair.notes ? `<p class="text-sm text-gray-600 mb-3">${repair.notes}</p>` : ''}
                    
                    <div class="grid grid-cols-2 gap-2 mb-3">
                        <div class="bg-gray-50 p-2 rounded-lg">
                            <p class="text-xs text-gray-500">Cost</p>
                            <p class="text-sm font-semibold text-green-700">₱${Number(repair.cost || 0).toFixed(2)}</p>
                        </div>
                        <div class="bg-gray-50 p-2 rounded-lg">
                            <p class="text-xs text-gray-500">Mechanic</p>
                            <p class="text-sm font-semibold text-gray-800">${repair.mechanic || 'Self'}</p>
                        </div>
                        ${repair.mileage ? `
                        <div class="bg-gray-50 p-2 rounded-lg">
                            <p class="text-xs text-gray-500">Mileage</p>
                            <p class="text-sm font-semibold text-gray-800">${repair.mileage} mi</p>
                        </div>
                        ` : ''}
                    </div>
                    
                    <div class="flex gap-2">
                        <button class="delete-repair-btn flex-1 px-3 py-2 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-medium" data-repair-id="${repair.id}">
                            <i class="fa-solid fa-trash mr-1"></i> Delete
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function updateStats() {
    if (!statsTarget) return;
    
    const totalSpent = cachedRepairs.reduce((sum, repair) => sum + Number(repair.cost || 0), 0);
    const totalRepairs = cachedRepairs.length;
    const average = totalRepairs ? totalSpent / totalRepairs : 0;
    
    statsTarget.innerHTML = `
        <div class="grid grid-cols-2 gap-3">
            <div class="bg-white rounded-xl p-4 border border-gray-100">
                <p class="text-xs text-gray-500 mb-1">Total Repairs</p>
                <p class="text-2xl font-bold text-gray-800">${totalRepairs}</p>
                <p class="text-xs text-gray-400 mt-1">Logged entries</p>
            </div>
            <div class="bg-white rounded-xl p-4 border border-gray-100">
                <p class="text-xs text-gray-500 mb-1">Total Spent</p>
                <p class="text-2xl font-bold text-green-700">₱${totalSpent.toFixed(2)}</p>
                <p class="text-xs text-gray-400 mt-1">All repairs</p>
            </div>
            <div class="bg-white rounded-xl p-4 border border-gray-100">
                <p class="text-xs text-gray-500 mb-1">Average Cost</p>
                <p class="text-2xl font-bold text-gray-800">₱${average.toFixed(2)}</p>
                <p class="text-xs text-gray-400 mt-1">Per repair</p>
            </div>
            <div class="bg-white rounded-xl p-4 border border-gray-100">
                <p class="text-xs text-gray-500 mb-1">This Month</p>
                <p class="text-2xl font-bold text-gray-800">₱${getThisMonthTotal().toFixed(2)}</p>
                <p class="text-xs text-gray-400 mt-1">Month total</p>
            </div>
        </div>
    `;
}

function getThisMonthTotal() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    return cachedRepairs
        .filter(repair => {
            const repairDate = new Date(repair.date);
            return repairDate.getMonth() === currentMonth && repairDate.getFullYear() === currentYear;
        })
        .reduce((sum, repair) => sum + Number(repair.cost || 0), 0);
}

async function handleDeleteRepair(e) {
    const repairId = e.currentTarget.getAttribute('data-repair-id');
    if (!repairId) return;
    
    if (!confirm('Delete this repair record?')) return;
    
    try {
        await deleteFirestoreDoc('repairs', repairId);
        cachedRepairs = cachedRepairs.filter(r => r.id !== repairId);
        
        if (cachedRepairs.length === 0) {
            renderEmptyState();
        } else {
            renderRepairs();
            updateStats();
        }
        
        showToast('Repair deleted successfully', 'success');
    } catch (error) {
        console.error('Error deleting repair:', error);
        showToast('Error deleting repair', 'error');
    }
}

function setupEventListeners() {
    searchInput?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = cachedRepairs.filter(r => 
            r.title?.toLowerCase().includes(query) || 
            r.category?.toLowerCase().includes(query) ||
            r.motorcycleName?.toLowerCase().includes(query)
        );
        
        if (listTarget) {
            if (filtered.length === 0) {
                listTarget.innerHTML = '<div class="text-gray-500 text-sm py-3">No repairs match your search</div>';
            } else {
                listTarget.innerHTML = filtered.map(repair => renderRepair(repair)).join('');
                listTarget.querySelectorAll('.delete-repair-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => handleDeleteRepair(e));
                });
            }
        }
    });
}

function showToast(message, type = 'info') {
    const el = document.createElement('div');
    el.className = 'fixed bottom-4 right-4 rounded-xl px-4 py-3 shadow-xl flex items-center gap-3 bg-white z-50';
    const icon = type === 'success' ? 'fa-circle-check text-green-600' : 'fa-circle-exclamation text-red-600';
    el.innerHTML = `<i class="fa-solid ${icon}"></i><p class="flex-1 text-sm font-medium">${message}</p><button class="hover:bg-gray-100 rounded-full p-1"><i class="fa-solid fa-xmark"></i></button>`;
    
    const btn = el.querySelector('button');
    btn.addEventListener('click', () => el.remove());
    document.body.appendChild(el);
    
    setTimeout(() => el.remove(), 3000);
}
