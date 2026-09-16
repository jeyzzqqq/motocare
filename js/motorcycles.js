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
let isMotorcyclesModalOpen = false;
const CURRENT_YEAR = new Date().getFullYear();

// Mapping of brand -> model -> [minYear, maxYear]
const MODEL_YEAR_MAP = {
    yamaha: {
        'NMAX V1': [2015, 2019],
        'NMAX V2 (Standard / ABS)': [2020, CURRENT_YEAR],
        'NMAX Turbo (2024+)': [2024, CURRENT_YEAR],
        'Aerox V1': [2017, 2020],
        'Aerox V2': [2021, CURRENT_YEAR],
        'Aerox ABS / S Version': [2021, CURRENT_YEAR],
        'Mio Sporty (Mio 1st gen)': [2007, 2016],
        'Mio Soul i125 (Soul i / Soul GT)': [2014, 2020],
        'Mio i125 (Mio i / Mio i125 S)': [2015, CURRENT_YEAR],
        'Mio Gravis': [2018, CURRENT_YEAR],
        'Fazzio (Hybrid)': [2022, CURRENT_YEAR],
        'Sniper 155 (Sniper 155 / Sniper 155 R)': [2021, CURRENT_YEAR],
        'Sight': [2016, CURRENT_YEAR],
        'XSR 155': [2019, CURRENT_YEAR]
    },
    honda: {
        'Click 125i V1': [2014, 2017],
        'Click 125i V2': [2018, 2021],
        'Click 125i V3': [2022, CURRENT_YEAR],
        'Click 160 (Standard / CBS / ABS)': [2022, CURRENT_YEAR],
        'Beat V1': [2009, 2015],
        'Beat V2': [2016, CURRENT_YEAR],
        'Beat Street': [2020, CURRENT_YEAR],
        'PCX 160 (CBS / ABS)': [2021, CURRENT_YEAR],
        'ADV 160 (ABS)': [2022, CURRENT_YEAR],
        'Airblade 150': [2020, 2022],
        'Airblade 160': [2023, CURRENT_YEAR],
        'Winner X (Standard / ABS / ABS Racing)': [2020, CURRENT_YEAR],
        'RS125': [2015, CURRENT_YEAR],
        'TMX 125 Alpha': [2005, CURRENT_YEAR],
        'TMX Supremo': [2012, CURRENT_YEAR],
        'CBR150R': [2021, CURRENT_YEAR],
        'CB150X': [2022, CURRENT_YEAR],
        'Giorno+': [2023, CURRENT_YEAR]
    },
    suzuki: {
        'Raider R150 Carb': [2003, 2015],
        'Raider R150 Fi': [2016, CURRENT_YEAR],
        'Raider R150 Fi ABS': [2023, CURRENT_YEAR],
        'Skydrive 125': [2010, CURRENT_YEAR],
        'Burgman Street 125': [2019, CURRENT_YEAR],
        'Smash 115': [2005, CURRENT_YEAR],
        'Shooter 115': [2010, CURRENT_YEAR],
        'Gixxer 150': [2015, CURRENT_YEAR],
        'GSX-S150': [2017, CURRENT_YEAR],
        'GSX-R150': [2017, CURRENT_YEAR]
    },
    'kawasaki / bajaj': {
        'CT100': [2015, CURRENT_YEAR],
        'Barako II': [2008, CURRENT_YEAR],
        'Fury 125': [2010, CURRENT_YEAR],
        'Rouser NS125': [2020, CURRENT_YEAR],
        'Rouser NS160': [2019, CURRENT_YEAR],
        'Rouser NS200': [2015, CURRENT_YEAR],
        'Rouser RS200': [2016, CURRENT_YEAR],
        'Dominar 400': [2018, CURRENT_YEAR],
        'Ninja 400': [2018, CURRENT_YEAR],
        'Ninja 650': [2017, CURRENT_YEAR],
        'ZX-25R': [2020, CURRENT_YEAR],
        'ZX-4RR': [2023, CURRENT_YEAR]
    }
};

function normalizeKey(str = '') {
    return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function findYearRangeForModel(brandMap, model) {
    if (!brandMap) return null;

    const normalizedModel = normalizeKey(model || '');
    const exactKey = Object.keys(brandMap).find((key) => normalizeKey(key) === normalizedModel);
    if (exactKey) {
        return { key: exactKey, range: brandMap[exactKey], matched: 'exact' };
    }

    const fuzzyKey = Object.keys(brandMap).find((key) => {
        const normalizedKey = normalizeKey(key);
        return normalizedKey === normalizedModel || normalizedKey.includes(normalizedModel) || normalizedModel.includes(normalizedKey);
    });

    if (fuzzyKey) {
        return { key: fuzzyKey, range: brandMap[fuzzyKey], matched: 'fuzzy' };
    }

    return null;
}

function populateYearsForModel(brand, model) {
    const yearSelect = document.getElementById('yearSelect');
    if (!yearSelect) return;

    const bKey = normalizeKey(brand || '');

    const brandMap = MODEL_YEAR_MAP[bKey] || MODEL_YEAR_MAP[brand?.toLowerCase?.()] || null;
    const modelMatch = findYearRangeForModel(brandMap, model);
    const modelEntry = modelMatch?.range || null;

    if (modelMatch?.matched === 'fuzzy') {
        console.debug('populateYearsForModel: fuzzy matched model', { brand, model, candidate: modelMatch.key });
    }

    yearSelect.innerHTML = '<option value="">Select Year</option>';

    if (!modelEntry) {
        // fallback to wide range
        console.warn('populateYearsForModel: no year mapping found for model', { brand, model });
        const currentYear = new Date().getFullYear();
        for (let y = currentYear + 1; y >= 1990; y--) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            yearSelect.appendChild(opt);
        }
        return;
    }

    let [minY, maxY] = modelEntry;
    const currentYear = new Date().getFullYear();
    if (!isFinite(maxY) || maxY > currentYear) maxY = currentYear;
    if (!isFinite(minY) || minY < 1900) minY = 1990;

    for (let y = maxY; y >= minY; y--) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        yearSelect.appendChild(opt);
    }
}

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
    syncMotorcyclesModalState(false);
    
    // If auth is already ready, load motorcycles
    if (authReady) {
        loadMotorcyclesFromFirestore();
    }
});

function syncMotorcyclesModalState(open) {
    isMotorcyclesModalOpen = open;
    const backdrop = document.getElementById('motorcyclesBackdrop');
    const sheet = document.getElementById('motorcyclesBottomSheet');
    if (backdrop) {
        backdrop.classList.toggle('is-open', open);
    }
    if (sheet) {
        sheet.classList.toggle('is-open', open);
    }
    document.body.classList.toggle('motorcycles-modal-open', open);
}

function openMotorcyclesModal() {
    syncMotorcyclesModalState(true);
    if (!authReady) {
        return;
    }
    if (motorcycles.length === 0) {
        loadMotorcyclesFromFirestore();
    }
}

function closeMotorcyclesModal() {
    syncMotorcyclesModalState(false);
    cancelInlineEdit();
}

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
            // Populate year options based on selected model if available
            populateYearsForModel(brand.value, model.value);
        });
    }

    if (model) {
        // when model selection changes, update available years
        model.addEventListener('change', () => populateYearsForModel(brand.value, model.value));
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

function getBikeInitials(moto) {
    const modelText = String(moto?.model || '').trim();
    const brandText = String(moto?.brand || '').trim();
    const modelMatch = modelText.match(/[A-Za-z]/g)?.slice(0, 2).join('').toUpperCase();
    const brandMatch = brandText.match(/[A-Za-z]/g)?.slice(0, 1).join('').toUpperCase();
    return modelMatch || brandMatch || 'M';
}

function getBikeBadgeColor(moto) {
    const palette = ['#dc2626', '#2563eb', '#0f766e', '#f59e0b', '#7c3aed', '#db2777', '#16a34a', '#f97316'];
    const source = `${moto?.brand || ''}${moto?.model || ''}`;
    let hash = 0;
    for (let i = 0; i < source.length; i++) {
        hash = source.charCodeAt(i) + ((hash << 5) - hash);
    }
    return palette[Math.abs(hash) % palette.length];
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
        return;
    }

    emptyState.classList.add('hidden');
    addAnother.classList.remove('hidden');
    addAnother.classList.add('flex');

    list.innerHTML = motorcycles.map((moto, idx) => {
        const badgeColor = getBikeBadgeColor(moto);
        const initials = getBikeInitials(moto);
        const bikeName = `${moto.brand || ''} ${moto.model || ''}`.trim();
        const subtitle = `${moto.year || ''} · ${moto.plate || moto.plateNumber || 'N/A'}`;
        const isEditing = editingId === moto.id;

        if (isEditing) {
            return `
                <div class="rounded-[18px] border border-gray-200 bg-[#f9fafb] p-3 shadow-sm" style="animation: fadeIn 0.2s ease-out ${idx * 0.08}s both">
                    <div class="flex items-start justify-between gap-3">
                        <div class="flex items-start gap-3">
                            <div class="flex h-10 w-10 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-sm" style="background-color: ${badgeColor};">${escapeHtml(initials)}</div>
                            <div>
                                <h3 class="text-[15px] font-bold text-[#111827]">${escapeHtml(bikeName)}</h3>
                                <p class="text-[11px] text-gray-500">${escapeHtml(subtitle)}</p>
                            </div>
                        </div>
                        <div class="flex gap-2">
                            <button type="button" aria-label="Save mileage" onclick="saveInlineMileage('${moto.id}')" class="grid h-8 w-8 place-items-center rounded-full bg-green-600 text-white transition hover:bg-green-700">
                                <i class="fa-solid fa-check text-xs"></i>
                            </button>
                            <button type="button" aria-label="Cancel edit" onclick="cancelInlineEdit()" class="grid h-8 w-8 place-items-center rounded-full bg-gray-200 text-gray-600 transition hover:bg-gray-300">
                                <i class="fa-solid fa-xmark text-xs"></i>
                            </button>
                        </div>
                    </div>

                    <div class="mt-4 grid grid-cols-2 gap-3">
                        <div class="rounded-[14px] border border-gray-200 bg-white p-3">
                            <div class="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">Mileage</div>
                            <input id="inline-mileage-${moto.id}" type="number" min="0" value="${Number(moto.mileage || 0)}" class="w-full border-0 bg-transparent p-0 text-[18px] font-bold text-[#111827] outline-none" />
                        </div>
                        <div class="rounded-[14px] border border-gray-200 bg-white p-3">
                            <div class="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">Year</div>
                            <div class="text-[18px] font-bold text-[#111827]">${escapeHtml(moto.year || '')}</div>
                        </div>
                    </div>
                </div>
            `;
        }

        return `
            <div class="rounded-[16px] border border-gray-200 bg-white p-3 shadow-[0_2px_8px_rgba(17,24,39,0.04)] transition hover:shadow-[0_4px_12px_rgba(17,24,39,0.06)]" style="animation: fadeIn 0.2s ease-out ${idx * 0.08}s both">
                <div class="flex items-start justify-between gap-3">
                    <div class="flex min-w-0 items-start gap-3">
                        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-sm" style="background-color: ${badgeColor};">${escapeHtml(initials)}</div>
                        <div class="min-w-0">
                            <h3 class="truncate text-[15px] font-bold text-[#111827]">${escapeHtml(bikeName)}</h3>
                            <p class="text-[11px] text-gray-500">${escapeHtml(subtitle)}</p>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button type="button" aria-label="Edit motorcycle" onclick="startInlineEdit('${moto.id}')" class="grid h-7 w-7 place-items-center rounded-full bg-gray-100 text-gray-600 transition hover:bg-gray-200">
                            <i class="fa-solid fa-pen text-[10px]"></i>
                        </button>
                        <button type="button" aria-label="Delete motorcycle" onclick='openDeleteMotorcycleModal(${JSON.stringify(moto.id)}, ${JSON.stringify(bikeName)}, ${JSON.stringify(moto.plate || moto.plateNumber || "")})' class="grid h-7 w-7 place-items-center rounded-full bg-red-50 text-red-600 transition hover:bg-red-100">
                            <i class="fa-solid fa-trash text-[10px]"></i>
                        </button>
                    </div>
                </div>

                <div class="mt-3 grid grid-cols-2 gap-2.5">
                    <div class="rounded-[12px] border border-gray-200 bg-[#f8faf9] p-3">
                        <div class="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">Mileage</div>
                        <div class="text-[16px] font-bold text-[#111827]">${escapeHtml(Number(moto.mileage || 0).toLocaleString())} km</div>
                    </div>
                    <div class="rounded-[12px] border border-gray-200 bg-[#f8faf9] p-3">
                        <div class="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">Year</div>
                        <div class="text-[16px] font-bold text-[#111827]">${escapeHtml(moto.year || '')}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function closeMotorcyclesSheet() {
    const sheet = document.getElementById('motorcyclesBottomSheet');
    const backdrop = document.getElementById('motorcyclesBackdrop');
    if (sheet) sheet.style.display = 'none';
    if (backdrop) backdrop.style.display = 'none';
}

function startInlineEdit(id) {
    editingId = id;
    renderMotorcycles();
}

function cancelInlineEdit() {
    editingId = null;
    renderMotorcycles();
}

async function saveInlineMileage(id) {
    const input = document.getElementById(`inline-mileage-${id}`);
    if (!input) return;

    const nextMileage = Number(input.value);
    if (!Number.isFinite(nextMileage) || nextMileage < 0) {
        showToast('Please enter a valid mileage value', 'error');
        return;
    }

    try {
        await updateFirestoreDoc('motorcycles', id, { mileage: nextMileage });
        const idx = motorcycles.findIndex((bike) => bike.id === id);
        if (idx > -1) {
            motorcycles[idx] = { ...motorcycles[idx], mileage: nextMileage };
        }
        editingId = null;
        renderMotorcycles();
        showToast('Mileage updated', 'success');
    } catch (error) {
        console.error('Error updating mileage:', error);
        showToast('Error updating mileage', 'error'); 
    }
}

function openAddModal() {
    console.log('openAddModal called, authReady:', authReady);
    editingId = null;
    const modal = document.getElementById('motorcycleModal');
    const form = document.getElementById('motorcycleForm');
    const backdrop = modal ? modal.querySelector('.modal-backdrop, .absolute.inset-0') : null;
    if (!modal || !form || !backdrop) {
        console.error('Modal elements not found', { modal, form, backdrop });
        return;
    }
    
    form.reset();
    console.log('Form reset');

    const brandSelect = document.getElementById('brandSelect');
    if (brandSelect) {
        brandSelect.value = '';
    }
    
    const modelSelect = document.getElementById('modelSelect');
    if (modelSelect) {
        modelSelect.disabled = true;
        modelSelect.innerHTML = '<option value="">Select Brand First</option>';
    }
    
    const submitBtnText = document.getElementById('submitBtnText');
    if (submitBtnText) {
        submitBtnText.textContent = 'Add Motorcycle';
    }
    
    modal.classList.remove('hidden');
    backdrop.style.display = 'block';
    
    console.log('✓ Add motorcycle modal opened');
}

function closeModal() {
    const modal = document.getElementById('motorcycleModal');
    if (!modal) return;
    const backdrop = modal.querySelector('.absolute.inset-0');
    modal.classList.add('hidden');
    if (backdrop) backdrop.style.display = 'none';
}

window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isMotorcyclesModalOpen) {
        closeMotorcyclesModal();
    }
});

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
            // populate years for this model then set the year value
            populateYearsForModel(brandSelect.value, modelSelect.value);
            const yearEl = document.getElementById('yearSelect');
            if (yearEl) yearEl.value = moto.year;
        }
    }, 0);
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
    window.openMotorcyclesModal = openMotorcyclesModal;
    window.closeMotorcyclesModal = closeMotorcyclesModal;
    window.closeMotorcyclesSheet = closeMotorcyclesModal;
    window.startInlineEdit = startInlineEdit;
    window.cancelInlineEdit = cancelInlineEdit;
    window.saveInlineMileage = saveInlineMileage;
    window.openDeleteMotorcycleModal = openDeleteMotorcycleModal;
    window.closeDeleteMotorcycleModal = closeDeleteMotorcycleModal;
    window.confirmDeleteMotorcycle = confirmDeleteMotorcycle;
    window.editMotorcycle = editMotorcycle;
    window.deleteMotorcycle = deleteMotorcycle;
    window.saveMotorcycle = saveMotorcycle;
}
