import { auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { addFirestoreDoc, getFirestoreDocs, updateFirestoreDoc, deleteFirestoreDoc } from './firebaseUtils.js';
import { getOfficialBrands, getModelsForBrand, findBrandMatch, findModelMatch, isOfficialMotorcycleSelection } from './motorcycleCatalog.js';

let motorcycles = [];
let editingId = null;
let isLoading = false;
let authReady = false;
let pendingDeleteId = null;
let pendingDeleteLabel = '';

onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log('Auth ready for motorcycles:', user.uid);
        authReady = true;
        loadMotorcyclesFromFirestore();
    } else {
        window.location.href = 'index.html';
    }
});

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing motorcycles page');
    populateBrands();
    populateYears();
    setupEventListeners();
    
    // If auth is already ready, load motorcycles
    if (authReady) {
        loadMotorcyclesFromFirestore();
    }
});

// Load motorcycles from Firestore
async function loadMotorcyclesFromFirestore() {
    isLoading = true;
    try {
        motorcycles = await getFirestoreDocs('motorcycles', 'createdAt');
        renderMotorcycles();
    } catch (error) {
        console.error('Error loading motorcycles:', error);
        showToast('Error loading motorcycles', 'error');
        renderEmptyState();
    } finally {
        isLoading = false;
    }
}

function populateBrands() {
    const brandSelect = document.getElementById('brandSelect');
    if (!brandSelect) return;
    brandSelect.innerHTML = '<option value="">Select Brand</option>';
    getOfficialBrands().forEach(brand => {
        const opt = document.createElement('option');
        opt.value = brand;
        opt.textContent = brand;
        brandSelect.appendChild(opt);
    });
}

function populateYears() {
    const yearSelect = document.getElementById('yearSelect');
    if (!yearSelect) return;
    const currentYear = new Date().getFullYear();
    for (let y = currentYear + 1; y >= 1990; y--) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        yearSelect.appendChild(opt);
    }
}

function setupEventListeners() {
    const brand = document.getElementById('brandSelect');
    const model = document.getElementById('modelSelect');
    const form = document.getElementById('motorcycleForm');
    const plate = document.getElementById('plateInput');

    if (brand && model) {
        brand.addEventListener('change', () => {
            const selected = findBrandMatch(brand.value);
            model.innerHTML = '<option value="">Select Brand First</option>';
            model.disabled = true;
            if (selected) {
                model.disabled = false;
                getModelsForBrand(selected).forEach(m => {
                    const o = document.createElement('option');
                    o.value = m;
                    o.textContent = m;
                    model.appendChild(o);
                });
            }
        });
    }

    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            console.log('Form submitted - calling saveMotorcycle');
            saveMotorcycle();
        });
    }

    if (plate) {
        plate.addEventListener('input', function () { this.value = this.value.toUpperCase(); });
    }
}

function renderMotorcycles() {
    const list = document.getElementById('motorcyclesList');
    const emptyState = document.getElementById('emptyState');
    const addAnother = document.getElementById('addAnotherBtn');
    if (!list || !emptyState || !addAnother) return;

    if (motorcycles.length === 0) {
        list.innerHTML = '';
        emptyState.classList.remove('hidden');
        addAnother.classList.add('hidden');
    } else {
        emptyState.classList.add('hidden');
        addAnother.classList.remove('hidden');
        addAnother.classList.add('flex');

        list.innerHTML = motorcycles.map((moto, idx) => {
            return `
                <div class="bg-white rounded-2xl p-5 shadow-md border border-gray-100" style="animation: fadeIn 0.3s ease-out ${idx * 0.1}s both">
                    <div class="flex items-start justify-between mb-4">
                        <div class="flex items-start gap-4">
                            <div class="w-14 h-14 bg-gradient-to-br from-green-700 to-green-900 rounded-xl flex items-center justify-center shrink-0">
                                <i class="fa-solid fa-motorcycle text-white text-2xl"></i>
                            </div>
                            <div>
                                <h3 class="text-gray-800 font-bold text-lg">${escapeHtml(moto.brand)} ${escapeHtml(moto.model)}</h3>
                                <p class="text-gray-500 text-sm">Year ${escapeHtml(moto.year)}</p>
                            </div>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="editMotorcycle('${moto.id}')" class="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                                <i class="fa-solid fa-pen text-gray-600"></i>
                            </button>
                            <button onclick='openDeleteMotorcycleModal(${JSON.stringify(moto.id)}, ${JSON.stringify((moto.brand || "") + " " + (moto.model || ""))}, ${JSON.stringify(moto.plate || moto.plateNumber || "")})' class="p-2 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
                                <i class="fa-solid fa-trash text-red-600"></i>
                            </button>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                        <div class="bg-gray-50 rounded-xl p-3">
                            <div class="flex items-center gap-2 mb-1">
                                <i class="fa-solid fa-hashtag text-gray-400"></i>
                                <p class="text-xs text-gray-500">Plate Number</p>
                            </div>
                            <p class="text-gray-800 font-medium">${escapeHtml(moto.plate || moto.plateNumber)}</p>
                        </div>

                        <div class="bg-gray-50 rounded-xl p-3">
                            <div class="flex items-center gap-2 mb-1">
                                <i class="fa-solid fa-tachometer-alt text-gray-400"></i>
                                <p class="text-xs text-gray-500">Mileage</p>
                            </div>
                            <p class="text-gray-800 font-medium">${escapeHtml(moto.mileage)} mi</p>
                        </div>

                        <div class="bg-gray-50 rounded-xl p-3">
                            <div class="flex items-center gap-2 mb-1">
                                <i class="fa-solid fa-palette text-gray-400"></i>
                                <p class="text-xs text-gray-500">Color</p>
                            </div>
                            <p class="text-gray-800 font-medium">${escapeHtml(moto.color)}</p>
                        </div>

                        <div class="bg-gray-50 rounded-xl p-3">
                            <div class="flex items-center gap-2 mb-1">
                                <i class="fa-solid fa-calendar-day text-gray-400"></i>
                                <p class="text-xs text-gray-500">Added</p>
                            </div>
                            <p class="text-gray-800 font-medium text-sm">${new Date(moto.createdAt?.toDate?.() || moto.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
}

function openAddModal() {
    console.log('openAddModal called, authReady:', authReady);
    editingId = null;
    const modal = document.getElementById('motorcycleModal');
    const backdrop = document.querySelector('.modal-backdrop');
    const form = document.getElementById('motorcycleForm');
    if (!modal || !backdrop || !form) {
        console.error('Modal elements not found', { modal, backdrop, form });
        return;
    }
    
    // Reset form
    form.reset();
    console.log('Form reset');

    const brandSelect = document.getElementById('brandSelect');
    if (brandSelect) {
        brandSelect.value = '';
    }
    
    // Reset selects
    const modelSelect = document.getElementById('modelSelect');
    if (modelSelect) {
        modelSelect.disabled = true;
        modelSelect.innerHTML = '<option value="">Select Brand First</option>';
    }
    
    // Reset button text
    const submitBtnText = document.getElementById('submitBtnText');
    if (submitBtnText) {
        submitBtnText.textContent = 'Add Motorcycle';
    }
    
    // Show modal
    modal.classList.remove('hidden');
    backdrop.classList.remove('hidden');
    
    console.log('✓ Add motorcycle modal opened');
}

function closeModal() {
    const modal = document.getElementById('motorcycleModal');
    const backdrop = document.querySelector('.modal-backdrop');
    if (!modal || !backdrop) return;
    modal.classList.add('hidden');
    backdrop.classList.add('hidden');
}

function openDeleteMotorcycleModal(id, label = '', plate = '') {
    pendingDeleteId = id;
    pendingDeleteLabel = label;
    window.pendingDeleteMotorcycleLabel = label;
    window.pendingDeleteMotorcyclePlate = plate;

    const modal = document.getElementById('deleteMotorcycleModal');
    const backdrop = document.getElementById('deleteMotorcycleBackdrop');
    const labelEl = document.getElementById('deleteMotorcycleLabel');

    if (labelEl) {
        labelEl.textContent = label || 'this motorcycle';
    }

    if (!modal || !backdrop) {
        deleteMotorcycle(id);
        return;
    }

    modal.classList.remove('hidden');
    backdrop.classList.remove('hidden');
}

function closeDeleteMotorcycleModal() {
    const modal = document.getElementById('deleteMotorcycleModal');
    const backdrop = document.getElementById('deleteMotorcycleBackdrop');

    if (modal) modal.classList.add('hidden');
    if (backdrop) backdrop.classList.add('hidden');

    pendingDeleteId = null;
    pendingDeleteLabel = '';
}

async function confirmDeleteMotorcycle() {
    if (!pendingDeleteId) return;

    const id = pendingDeleteId;
    closeDeleteMotorcycleModal();
    await deleteMotorcycle(id);
}

function editMotorcycle(id) {
    const moto = motorcycles.find(m => m.id === id);
    if (!moto) return;
    editingId = id;
    const modal = document.getElementById('motorcycleModal');
    const backdrop = document.querySelector('.modal-backdrop');
    if (!modal || !backdrop) return;

    const brandSelect = document.getElementById('brandSelect');
    const modelSelect = document.getElementById('modelSelect');
    const officialBrand = findBrandMatch(moto.brand);
    const officialModel = findModelMatch(officialBrand || moto.brand, moto.model);

    if (brandSelect) {
        brandSelect.value = officialBrand || moto.brand || '';
    }
    const evt = new Event('change');
    brandSelect?.dispatchEvent(evt);

    setTimeout(() => {
        if (modelSelect) {
            modelSelect.value = officialModel || moto.model || '';
        }
    }, 0);

    document.getElementById('yearSelect').value = moto.year;
    document.getElementById('plateInput').value = moto.plate || moto.plateNumber;
    document.getElementById('colorInput').value = moto.color;
    document.getElementById('mileageInput').value = moto.mileage;
    document.getElementById('submitBtnText').textContent = 'Save Changes';

    modal.classList.remove('hidden');
    backdrop.classList.remove('hidden');
}

async function deleteMotorcycle(id) {
    try {
        await deleteFirestoreDoc('motorcycles', id);
        motorcycles = motorcycles.filter(m => m.id !== id);
        renderMotorcycles();
        showToast('Motorcycle deleted', 'success');
    } catch (error) {
        console.error('Error deleting motorcycle:', error);
        showToast('Error deleting motorcycle', 'error');
    }
}

async function saveMotorcycle() {
    const brandInput = document.getElementById('brandSelect').value;
    const modelInput = document.getElementById('modelSelect').value;
    const year = document.getElementById('yearSelect').value;
    const plate = document.getElementById('plateInput').value.trim().toUpperCase();
    const color = document.getElementById('colorInput').value.trim();
    const mileage = document.getElementById('mileageInput').value.trim();

    const brand = findBrandMatch(brandInput);
    const model = findModelMatch(brand, modelInput);

    console.log('Saving motorcycle:', { brand, model, year, plate, color, mileage });

    if (!brand || !model || !year || !plate || !color || !mileage) {
        showToast('Please fill all fields', 'error');
        return;
    }

    if (!isOfficialMotorcycleSelection(brand, model)) {
        showToast('Invalid motorcycle model. Please choose from the official list.', 'error');
        return;
    }

    // Validate plate format
    if (!/^[A-Z0-9\-]{4,}$/.test(plate)) {
        showToast('Plate number format invalid (format: ABC-1234)', 'error');
        return;
    }

    // Validate mileage is a number
    if (isNaN(mileage) || Number(mileage) < 0) {
        showToast('Mileage must be a valid number', 'error');
        return;
    }

    // Check if user is authenticated
    if (!authReady) {
        showToast('User not authenticated. Please refresh the page.', 'error');
        console.error('Auth not ready when trying to save motorcycle');
        return;
    }

    try {
        if (editingId) {
            // Update existing motorcycle
            console.log('Updating motorcycle:', editingId);
            await updateFirestoreDoc('motorcycles', editingId, {
                brand,
                model,
                year,
                plate,
                color,
                mileage,
                motorcycleName: `${brand} ${model}`
            });
            
            // Update local array
            const idx = motorcycles.findIndex(m => m.id === editingId);
            if (idx > -1) {
                motorcycles[idx] = { ...motorcycles[idx], brand, model, year, plate, color, mileage, motorcycleName: `${brand} ${model}` };
            }
            
            showToast('Motorcycle updated', 'success');
        } else {
            // Add new motorcycle
            console.log('Adding new motorcycle');
            const newMoto = await addFirestoreDoc('motorcycles', {
                brand,
                model,
                year,
                plate,
                color,
                mileage,
                motorcycleName: `${brand} ${model}`
            });
            
            console.log('Motorcycle added with ID:', newMoto.id);
            motorcycles.unshift(newMoto);
            showToast('Motorcycle added successfully', 'success');
        }
        
        renderMotorcycles();
        closeModal();
    } catch (error) {
        console.error('Error saving motorcycle:', error);
        showToast('Error saving motorcycle: ' + error.message, 'error');
    }
}

function renderEmptyState() {
    const list = document.getElementById('motorcyclesList');
    const emptyState = document.getElementById('emptyState');
    const addAnother = document.getElementById('addAnotherBtn');
    if (!list || !emptyState || !addAnother) return;
    
    list.innerHTML = '';
    emptyState.classList.remove('hidden');
    addAnother.classList.add('hidden');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'rounded-xl px-4 py-3 shadow-xl flex items-center gap-3 bg-white';
    el.innerHTML = `<i class="fa-solid fa-circle-check text-green-600"></i><p class="flex-1 text-sm font-medium">${escapeHtml(message)}</p><button class="hover:bg-gray-100 rounded-full p-1"><i class="fa-solid fa-xmark"></i></button>`;
    const btn = el.querySelector('button');
    btn.addEventListener('click', () => el.remove());
    container.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

// small helper to escape HTML
function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]);
}

if (typeof window !== 'undefined') {
    window.openAddModal = openAddModal;
    window.closeModal = closeModal;
    window.openDeleteMotorcycleModal = openDeleteMotorcycleModal;
    window.closeDeleteMotorcycleModal = closeDeleteMotorcycleModal;
    window.confirmDeleteMotorcycle = confirmDeleteMotorcycle;
    window.editMotorcycle = editMotorcycle;
    window.deleteMotorcycle = deleteMotorcycle;
    window.saveMotorcycle = saveMotorcycle;
}
