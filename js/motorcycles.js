const motorcycleBrands = {
    "Honda": ["CBR 600RR", "CBR 1000RR", "CB650R", "CB500X", "CRF450L", "Africa Twin", "Gold Wing", "Rebel 500", "Grom"],
    "Yamaha": ["YZF-R1", "YZF-R6", "MT-07", "MT-09", "MT-10", "Tenere 700", "FZ-07", "R15", "XSR900"],
    "Kawasaki": ["Ninja 650", "Ninja ZX-10R", "Z900", "Z650", "Versys 650", "W800", "KLR650", "Ninja 400"],
    "Suzuki": ["GSX-R1000", "GSX-R750", "GSX-S1000", "SV650", "V-Strom 650", "Hayabusa", "Boulevard M109R"],
    "Ducati": ["Panigale V4", "Monster 821", "Scrambler", "Multistrada", "Diavel", "SuperSport 950"],
    "BMW": ["S1000RR", "R1250GS", "F850GS", "R nineT", "K1600GT", "G310R"],
    "KTM": ["Duke 390", "Duke 790", "RC 390", "Adventure 890", "Super Duke 1290", "Enduro 690"],
    "Harley-Davidson": ["Sportster Iron 883", "Street 750", "Fat Boy", "Road King", "Street Glide", "Pan America"],
    "Triumph": ["Street Triple", "Speed Triple", "Tiger 900", "Bonneville", "Rocket 3", "Scrambler 1200"],
    "Royal Enfield": ["Classic 350", "Himalayan", "Interceptor 650", "Continental GT 650", "Meteor 350"]
};

let motorcycles = [];
let editingId = null;

document.addEventListener('DOMContentLoaded', () => {
    loadMotorcycles();
    populateBrands();
    populateYears();
    setupEventListeners();
    renderMotorcycles();
});

function loadMotorcycles() {
    const saved = localStorage.getItem('motorcycles');
    if (saved) motorcycles = JSON.parse(saved);
}

function saveMotorcycles() {
    localStorage.setItem('motorcycles', JSON.stringify(motorcycles));
}

function populateBrands() {
    const brandSelect = document.getElementById('brandSelect');
    if (!brandSelect) return;
    brandSelect.innerHTML = '<option value="">Select Brand</option>';
    Object.keys(motorcycleBrands).forEach(brand => {
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
            const selected = brand.value;
            model.innerHTML = '<option value="">Select Brand First</option>';
            if (selected && motorcycleBrands[selected]) {
                model.disabled = false;
                motorcycleBrands[selected].forEach(m => {
                    const o = document.createElement('option');
                    o.value = m;
                    o.textContent = m;
                    model.appendChild(o);
                });
            } else {
                model.disabled = true;
            }
        });
    }

    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
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
                            <button onclick="deleteMotorcycle('${moto.id}')" class="p-2 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
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
                            <p class="text-gray-800 font-medium">${escapeHtml(moto.plateNumber)}</p>
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
                            <p class="text-gray-800 font-medium text-sm">${new Date(moto.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
}

function openAddModal() {
    editingId = null;
    const modal = document.getElementById('motorcycleModal');
    const backdrop = document.querySelector('.modal-backdrop');
    const form = document.getElementById('motorcycleForm');
    if (!modal || !backdrop || !form) return;
    form.reset();
    document.getElementById('modelSelect').disabled = true;
    document.getElementById('submitBtnText').textContent = 'Add Motorcycle';
    modal.classList.remove('hidden');
    backdrop.classList.remove('hidden');
}

function closeModal() {
    const modal = document.getElementById('motorcycleModal');
    const backdrop = document.querySelector('.modal-backdrop');
    if (!modal || !backdrop) return;
    modal.classList.add('hidden');
    backdrop.classList.add('hidden');
}

function editMotorcycle(id) {
    const moto = motorcycles.find(m => m.id === id);
    if (!moto) return;
    editingId = id;
    const modal = document.getElementById('motorcycleModal');
    const backdrop = document.querySelector('.modal-backdrop');
    if (!modal || !backdrop) return;

    document.getElementById('brandSelect').value = moto.brand;
    const evt = new Event('change');
    document.getElementById('brandSelect').dispatchEvent(evt);

    setTimeout(() => {
        document.getElementById('modelSelect').value = moto.model;
    }, 0);

    document.getElementById('yearSelect').value = moto.year;
    document.getElementById('plateInput').value = moto.plateNumber;
    document.getElementById('colorInput').value = moto.color;
    document.getElementById('mileageInput').value = moto.mileage;
    document.getElementById('submitBtnText').textContent = 'Save Changes';

    modal.classList.remove('hidden');
    backdrop.classList.remove('hidden');
}

function deleteMotorcycle(id) {
    if (!confirm('Delete this motorcycle?')) return;
    motorcycles = motorcycles.filter(m => m.id !== id);
    saveMotorcycles();
    renderMotorcycles();
    showToast('Motorcycle deleted', 'success');
}

function saveMotorcycle() {
    const brand = document.getElementById('brandSelect').value;
    const model = document.getElementById('modelSelect').value;
    const year = document.getElementById('yearSelect').value;
    const plate = document.getElementById('plateInput').value.trim().toUpperCase();
    const color = document.getElementById('colorInput').value.trim();
    const mileage = document.getElementById('mileageInput').value.trim();

    if (!brand || !model || !year || !plate || !color || !mileage) {
        showToast('Please fill all fields', 'error');
        return;
    }

    if (editingId) {
        const idx = motorcycles.findIndex(m => m.id === editingId);
        if (idx > -1) {
            motorcycles[idx] = { ...motorcycles[idx], brand, model, year, plateNumber: plate, color, mileage };
            saveMotorcycles();
            renderMotorcycles();
            closeModal();
            showToast('Motorcycle updated', 'success');
            return;
        }
    }

    const newMoto = {
        id: 'm_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
        brand,
        model,
        year,
        plateNumber: plate,
        color,
        mileage,
        createdAt: Date.now()
    };

    motorcycles.unshift(newMoto);
    saveMotorcycles();
    renderMotorcycles();
    closeModal();
    showToast('Motorcycle added', 'success');
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
