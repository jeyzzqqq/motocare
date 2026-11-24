import { auth } from './firebase-config.js?v=3';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";
import { addFirestoreDoc, getFirestoreDocs, updateFirestoreDoc, deleteFirestoreDoc } from './firebaseUtils.js';
import { getOfficialBrands, getModelsForBrand, findBrandMatch, findModelMatch, isOfficialMotorcycleSelection } from './motorcycleCatalog.js';
import { MAINTENANCE_RULES, classifyMotorcycleCategory } from './maintenanceOptions.js';
import { getMaintenanceTaskStatus, isCompletionRecord } from './maintenanceStatus.js';

let motorcycles = [];
let maintenanceRecords = [];
let editingId = null;
let isLoading = false;
let authReady = false;
let pendingDeleteId = null;
let pendingDeleteLabel = '';
let isMotorcyclesModalOpen = false;
let motorcyclesSheetOpener = null;
let motorcyclesNestedOpener = null;
let motorcyclesSheetCloseTimer = null;
let profileRepairs = [];
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
    document.getElementById('motorcyclesRetry')?.addEventListener('click', loadMotorcyclesFromFirestore);
    document.getElementById('motorcycleProfileEdit')?.addEventListener('click', () => {
        const id = getMotorcycleProfileId();
        if (id) editMotorcycle(id);
    });
    document.getElementById('motorcycleProfileUpdateOdo')?.addEventListener('click', () => {
        const id = getMotorcycleProfileId();
        if (id) startInlineEdit(id);
    });
    document.getElementById('motorcyclesBackdrop')?.addEventListener('click', (event) => {
        if (event.target === event.currentTarget) closeMotorcyclesModal();
    });
    requestAnimationFrame(markProfileNavigationActive);
    
    // If auth is already ready, load motorcycles
    if (authReady) {
        loadMotorcyclesFromFirestore();
    }
});

function syncMotorcyclesModalState(open) {
    isMotorcyclesModalOpen = open;
    const backdrop = document.getElementById('motorcyclesBackdrop');
    if (!backdrop) return;
    window.clearTimeout(motorcyclesSheetCloseTimer);
    if (open) backdrop.hidden = false;
    requestAnimationFrame(() => {
        if (isMotorcyclesModalOpen) backdrop.classList.add('is-open');
    });
    if (!open) backdrop.classList.remove('is-open');
    document.body.classList.toggle('motorcycles-modal-open', open);
    document.body.classList.toggle('motoai-open', open);
    if (!open) {
        const closeDelay = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320;
        motorcyclesSheetCloseTimer = window.setTimeout(() => {
            if (!isMotorcyclesModalOpen) backdrop.hidden = true;
        }, closeDelay);
    }
}

function openMotorcyclesModal() {
    const backdrop = document.getElementById('motorcyclesBackdrop');
    if (!backdrop) {
        window.location.href = 'motorcycles.html';
        return;
    }
    motorcyclesSheetOpener = document.activeElement;
    syncMotorcyclesModalState(true);
    requestAnimationFrame(() => {
        document.getElementById('motorcyclesCloseButton')?.focus({ preventScroll: true });
    });
}

function closeMotorcyclesModal() {
    if (!isMotorcyclesModalOpen) return;
    syncMotorcyclesModalState(false);
    cancelInlineEdit();
    document.querySelectorAll('.motorcycle-card__menu').forEach((menu) => { menu.hidden = true; });
    const opener = motorcyclesSheetOpener;
    motorcyclesSheetOpener = null;
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
}

// Load motorcycles from Firestore
async function loadMotorcyclesFromFirestore() {
    if (isMotorcycleProfilePage()) {
        await loadMotorcycleProfile();
        return;
    }

    isLoading = true;
    const loading = document.getElementById('motorcyclesLoading');
    const errorState = document.getElementById('motorcyclesError');
    const emptyState = document.getElementById('emptyState');
    const list = document.getElementById('motorcyclesList');
    setElementHidden(loading, false);
    setElementHidden(errorState, true);
    setElementHidden(emptyState, true);
    setElementHidden(list, true);
    updateMotorcyclesCount('Loading…');

    try {
        const [loadedMotorcycles, loadedMaintenance] = await Promise.all([
            getFirestoreDocs('motorcycles', 'createdAt'),
            getFirestoreDocs('maintenance', 'createdAt')
        ]);
        motorcycles = loadedMotorcycles.filter((motorcycle) => motorcycle.deleted !== true);
        maintenanceRecords = loadedMaintenance.filter((record) => record.deleted !== true);
        renderMotorcycles();
    } catch (error) {
        console.error('Error loading motorcycles:', error);
        updateMotorcyclesCount('');
        if (errorState) {
            setElementHidden(errorState, false);
            setElementHidden(list, true);
        } else {
            showToast('Error loading motorcycles', 'error');
            renderEmptyState();
        }
    } finally {
        isLoading = false;
        setElementHidden(loading, true);
    }
}

function isMotorcycleProfilePage() {
    return Boolean(document.getElementById('motorcycleProfileContent'));
}

function getMotorcycleProfileId() {
    return new URLSearchParams(window.location.search).get('id')?.trim() || '';
}

async function loadMotorcycleProfile() {
    const loading = document.getElementById('motorcycleProfileLoading');
    const error = document.getElementById('motorcycleProfileError');
    const invalid = document.getElementById('motorcycleProfileInvalid');
    const content = document.getElementById('motorcycleProfileContent');
    const editButton = document.getElementById('motorcycleProfileEdit');
    const id = getMotorcycleProfileId();

    setElementHidden(loading, true);
    setElementHidden(error, true);
    setElementHidden(invalid, true);
    setElementHidden(content, true);
    if (editButton) editButton.disabled = true;

    if (!id) {
        const message = document.getElementById('motorcycleProfileInvalidMessage');
        if (message) message.textContent = 'Motorcycle ID is missing.';
        setElementHidden(invalid, false);
        return;
    }

    setElementHidden(loading, false);
    try {
        const [loadedMotorcycles, loadedMaintenance, loadedRepairs] = await Promise.all([
            getFirestoreDocs('motorcycles', 'createdAt'),
            getFirestoreDocs('maintenance', 'createdAt'),
            getFirestoreDocs('repairs', 'createdAt')
        ]);
        motorcycles = loadedMotorcycles.filter((motorcycle) => motorcycle.deleted !== true);
        maintenanceRecords = loadedMaintenance.filter((record) => record.deleted !== true);
        profileRepairs = loadedRepairs.filter((record) =>
            record.deleted !== true && String(record.motorcycleId || '') === id
        );

        if (!motorcycles.some((motorcycle) => String(motorcycle.id) === id)) {
            const message = document.getElementById('motorcycleProfileInvalidMessage');
            if (message) message.textContent = 'Motorcycle profile not found.';
            setElementHidden(invalid, false);
            return;
        }

        renderMotorcycleProfile();
        setElementHidden(content, false);
        if (editButton) editButton.disabled = false;
    } catch (loadError) {
        console.error('Error loading motorcycle profile:', loadError);
        setElementHidden(error, false);
    } finally {
        setElementHidden(loading, true);
    }
}

function setElementHidden(element, hidden) {
    if (!element) return;
    element.hidden = hidden;
    element.classList.toggle('hidden', hidden);
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
    const mileage = document.getElementById('mileageInput');

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

    if (mileage) {
        mileage.addEventListener('input', () => {
            const digits = mileage.value.replace(/[^\d]/g, '');
            mileage.value = digits ? Number(digits).toLocaleString('en-US') : '';
        });
    }
}

function markProfileNavigationActive() {
    const nav = document.getElementById('mobileNav');
    const profileLink = nav?.querySelector('a[href="profile.html"]');
    if (!profileLink) return;
    nav.querySelectorAll('.mobile-bottom-nav__item').forEach((item) => {
        item.classList.remove('is-active');
        item.setAttribute('aria-current', 'false');
    });
    profileLink.classList.add('is-active');
    profileLink.setAttribute('aria-current', 'page');
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

function bikeIconSvg(size = 22) {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>`;
}

function getMotorcycleName(moto) {
    return String(moto.motorcycleName || '').trim()
        || [moto.brand, moto.model].filter(Boolean).join(' ').trim()
        || 'Motorcycle';
}

function getMotorcycleMileage(moto) {
    const raw = moto.mileage ?? moto.odo ?? moto.currentOdo ?? moto.odometer;
    if (raw === null || raw === undefined || raw === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
}

function getNextService(moto) {
    const category = classifyMotorcycleCategory(moto);
    const rules = MAINTENANCE_RULES[category.key] || MAINTENANCE_RULES.underbone;
    const statusPriority = { overdue: 0, due: 1, upcoming: 2, scheduled: 3 };

    return rules.map((rule) => ({
        rule,
        ...getMaintenanceTaskStatus(moto, rule, maintenanceRecords)
    })).sort((left, right) => {
        const priorityDiff = statusPriority[left.status.key] - statusPriority[right.status.key];
        return priorityDiff || left.dueMileage - right.dueMileage;
    })[0] || null;
}

function formatServiceDueDate(date) {
    if (!date) return '';
    const value = date instanceof Date ? date : new Date(date);
    return Number.isNaN(value.getTime())
        ? ''
        : value.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getRepairAmount(record = {}) {
    const value = record.amount ?? record.cost ?? record.total ?? 0;
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : 0;
}

function createProfileSvg(paths) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    paths.forEach((pathData) => {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        svg.appendChild(path);
    });
    return svg;
}

function createProfileHistoryRow(title, subtitle, iconPaths, href, onClick) {
    const row = href ? document.createElement('a') : document.createElement('div');
    row.className = 'motorcycle-profile-history-row';
    if (href) row.href = href;
    if (onClick) row.addEventListener('click', onClick);

    const icon = document.createElement('span');
    icon.className = 'motorcycle-profile-history-icon';
    icon.appendChild(createProfileSvg(iconPaths));
    const copy = document.createElement('span');
    copy.className = 'motorcycle-profile-history-copy';
    const titleElement = document.createElement('strong');
    titleElement.textContent = title;
    const subtitleElement = document.createElement('span');
    subtitleElement.textContent = subtitle;
    copy.append(titleElement, subtitleElement);
    row.append(icon, copy);
    if (href) {
        const chevron = createProfileSvg(['m9 18 6-6-6-6']);
        chevron.classList.add('motorcycle-profile-history-chevron');
        row.appendChild(chevron);
    }
    return row;
}

function renderMotorcycleProfileOdoEditor(motorcycle, mileage) {
    const editor = document.getElementById('motorcycleProfileOdoEditor');
    if (!editor) return;
    editor.replaceChildren();
    if (editingId !== motorcycle.id) {
        setElementHidden(editor, true);
        return;
    }

    const name = getMotorcycleName(motorcycle);
    const input = document.createElement('input');
    input.id = `inline-mileage-${motorcycle.id}`;
    input.type = 'number';
    input.min = '0';
    input.step = '1';
    input.inputMode = 'numeric';
    input.setAttribute('aria-label', `Current odometer for ${name}`);
    input.value = mileage === null ? '' : String(mileage);

    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.textContent = 'Save';
    saveButton.addEventListener('click', () => saveInlineMileage(motorcycle.id));
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', cancelInlineEdit);
    editor.append(input, saveButton, cancelButton);
    setElementHidden(editor, false);
}

function renderMotorcycleProfileNextService(motorcycle) {
    const container = document.getElementById('motorcycleProfileNextService');
    if (!container) return;
    container.replaceChildren();

    const nextService = getNextService(motorcycle);
    if (!nextService) {
        const caughtUp = document.createElement('p');
        caughtUp.className = 'motorcycle-profile-service-card motorcycle-profile-caught-up';
        caughtUp.textContent = 'All caught up';
        container.appendChild(caughtUp);
        return;
    }

    const statusLabels = {
        overdue: ['Overdue', 'motorcycle-profile-service-status--overdue'],
        due: ['Overdue', 'motorcycle-profile-service-status--overdue'],
        upcoming: ['Due soon', 'motorcycle-profile-service-status--due-soon'],
        scheduled: ['Upcoming', 'motorcycle-profile-service-status--upcoming']
    };
    const statusInfo = statusLabels[nextService.status.key];
    if (!statusInfo) {
        const caughtUp = document.createElement('p');
        caughtUp.className = 'motorcycle-profile-service-card motorcycle-profile-caught-up';
        caughtUp.textContent = 'All caught up';
        container.appendChild(caughtUp);
        return;
    }

    const dueDate = formatServiceDueDate(nextService.dueDate);
    const dueInfo = dueDate || `at ${nextService.dueMileage.toLocaleString()} km`;
    const card = document.createElement('div');
    card.className = 'motorcycle-profile-service-card';
    const icon = document.createElement('span');
    icon.className = 'motorcycle-profile-service-icon';
    icon.appendChild(createProfileSvg(['M12 22a7 7 0 0 0 7-7c0-2-1-3-3-5-2-2-3-4-4-7-1 3-2 5-4 7-2 2-3 3-3 5a7 7 0 0 0 7 7Z']));

    const copy = document.createElement('span');
    copy.className = 'motorcycle-profile-service-copy';
    const task = document.createElement('strong');
    task.textContent = nextService.rule.task;
    const name = document.createElement('span');
    name.textContent = getMotorcycleName(motorcycle);
    copy.append(task, name);

    const meta = document.createElement('span');
    meta.className = 'motorcycle-profile-service-meta';
    const status = document.createElement('span');
    status.className = `motorcycle-profile-service-status ${statusInfo[1]}`;
    const dot = document.createElement('span');
    dot.className = 'motorcycle-profile-status-dot';
    status.append(dot, document.createTextNode(statusInfo[0]));
    const due = document.createElement('span');
    due.textContent = dueInfo;
    meta.append(status, due);
    card.append(icon, copy, meta);
    container.appendChild(card);
}

function renderMotorcycleProfile() {
    const id = getMotorcycleProfileId();
    const motorcycle = motorcycles.find((item) => String(item.id) === id && item.deleted !== true);
    if (!motorcycle) return;

    const name = document.getElementById('motorcycleProfileName');
    if (name) name.textContent = getMotorcycleName(motorcycle);

    const details = document.getElementById('motorcycleProfileDetails');
    if (details) {
        const year = motorcycle.year === null || motorcycle.year === undefined
            ? ''
            : String(motorcycle.year).trim();
        details.textContent = year;
        setElementHidden(details, !year);
    }

    const mileage = getMotorcycleMileage(motorcycle);
    const mileageElement = document.getElementById('motorcycleProfileMileage');
    const mileageUnit = document.getElementById('motorcycleProfileMileageUnit');
    if (mileageElement) mileageElement.textContent = mileage === null ? '—' : mileage.toLocaleString();
    setElementHidden(mileageUnit, mileage === null);
    renderMotorcycleProfileOdoEditor(motorcycle, mileage);

    const completedRecords = maintenanceRecords.filter((record) =>
        String(record.motorcycleId || '') === id && isCompletionRecord(record)
    );
    const serviceCount = document.getElementById('motorcycleProfileServiceCount');
    if (serviceCount) serviceCount.textContent = String(completedRecords.length);

    const spent = profileRepairs.reduce((sum, record) => sum + getRepairAmount(record), 0);
    const totalSpent = document.getElementById('motorcycleProfileTotalSpent');
    if (totalSpent) {
        totalSpent.textContent = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: window.getCurrencyPreference(),
            maximumFractionDigits: 0
        }).format(spent);
    }

    renderMotorcycleProfileNextService(motorcycle);

    const category = classifyMotorcycleCategory(motorcycle);
    const taskCount = (MAINTENANCE_RULES[category.key] || MAINTENANCE_RULES.underbone).length;
    const repairsCount = profileRepairs.length;
    const historyRows = document.getElementById('motorcycleProfileHistoryRows');
    if (historyRows) {
        const maintenanceCountLabel = completedRecords.length
            ? `${completedRecords.length} ${completedRecords.length === 1 ? 'record' : 'records'}`
            : 'No records yet';
        const repairsCountLabel = repairsCount
            ? `${repairsCount} ${repairsCount === 1 ? 'repair' : 'repairs'}`
            : 'No repairs yet';
        const taskCountLabel = `${taskCount} ${taskCount === 1 ? 'task' : 'tasks'}`;

        const maintenanceRow = createProfileHistoryRow(
            'Maintenance records',
            maintenanceCountLabel,
            ['M4 4h16v16H4z', 'M8 8h8', 'M8 12h8', 'M8 16h5'],
            null
        );
        const repairRow = createProfileHistoryRow(
            'Repair history',
            repairsCountLabel,
            ['m14.7 6.3 3 3', 'M4 20l5.5-1.5L20 8l-4-4L5.5 14.5 4 20Z'],
            'history.html'
        );
        const scheduleRow = createProfileHistoryRow(
            'Maintenance schedule',
            taskCountLabel,
            ['M8 2v4', 'M16 2v4', 'M3 10h18', 'M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z'],
            'schedule.html',
            () => {
                try {
                    localStorage.setItem('motocare.selectedMotorcycleId', id);
                } catch (error) {
                    console.warn('Could not select motorcycle for Schedule:', error);
                }
            }
        );
        historyRows.replaceChildren(maintenanceRow, repairRow, scheduleRow);
    }
}

function openMotorcycleProfile(id) {
    window.location.href = `motorcycle-profile.html?id=${encodeURIComponent(String(id))}`;
}

function createMotorcycleCard(moto) {
    const name = getMotorcycleName(moto);
    const card = document.createElement('article');
    card.className = 'motorcycle-card';
    card.dataset.motorcycleId = String(moto.id);
    card.tabIndex = 0;
    card.setAttribute('aria-label', `${name}. Press Enter to open motorcycle profile.`);
    card.addEventListener('click', (event) => {
        if (!event.target.closest('button, input')) openMotorcycleProfile(moto.id);
    });
    card.addEventListener('keydown', (event) => {
        if (event.target !== card || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        openMotorcycleProfile(moto.id);
    });

    const top = document.createElement('div');
    top.className = 'motorcycle-card__top';
    const icon = document.createElement('div');
    icon.className = 'motorcycle-card__icon';
    icon.innerHTML = bikeIconSvg();

    const identity = document.createElement('div');
    identity.className = 'motorcycle-card__identity';
    const nameElement = document.createElement('h2');
    nameElement.className = 'motorcycle-card__name';
    nameElement.textContent = name;
    const detailsElement = document.createElement('p');
    detailsElement.className = 'motorcycle-card__detail';
    detailsElement.textContent = moto.year === null || moto.year === undefined || moto.year === ''
        ? ''
        : String(moto.year);
    detailsElement.hidden = !detailsElement.textContent;
    identity.append(nameElement, detailsElement);

    const optionsWrap = document.createElement('div');
    optionsWrap.className = 'motorcycle-card__options-wrap';
    const optionsButton = document.createElement('button');
    optionsButton.type = 'button';
    optionsButton.className = 'motorcycle-card__options';
    optionsButton.textContent = 'Edit';
    optionsButton.setAttribute('aria-label', `Actions for ${name}`);
    optionsButton.setAttribute('aria-expanded', 'false');
    const menu = document.createElement('div');
    menu.className = 'motorcycle-card__menu';
    menu.id = `motorcycle-menu-${String(moto.id)}`;
    menu.dataset.motorcycleId = String(moto.id);
    menu.setAttribute('role', 'group');
    menu.setAttribute('aria-label', `Actions for ${name}`);
    menu.hidden = true;
    optionsButton.setAttribute('aria-controls', menu.id);
    optionsButton.addEventListener('click', () => {
        const shouldOpen = menu.hidden;
        document.querySelectorAll('.motorcycle-card__menu').forEach((openMenu) => { openMenu.hidden = true; });
        document.querySelectorAll('.motorcycle-card__options').forEach((button) => button.setAttribute('aria-expanded', 'false'));
        menu.hidden = !shouldOpen;
        if (shouldOpen && document.getElementById('motorcyclesBackdrop')) {
            const rect = optionsButton.getBoundingClientRect();
            const menuHeight = menu.offsetHeight || 120;
            const top = rect.bottom + menuHeight + 8 > window.innerHeight
                ? Math.max(8, rect.top - menuHeight - 4)
                : rect.bottom + 4;
            const left = Math.max(8, Math.min(rect.right - 148, window.innerWidth - 156));
            menu.style.top = `${top}px`;
            menu.style.left = `${left}px`;
        }
        optionsButton.setAttribute('aria-expanded', String(!menu.hidden));
        if (!menu.hidden) menu.querySelector('button')?.focus({ preventScroll: true });
    });

    const addMenuAction = (label, action) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.addEventListener('click', () => {
            menu.hidden = true;
            optionsButton.setAttribute('aria-expanded', 'false');
            action();
        });
        menu.appendChild(button);
    };
    addMenuAction('Edit', () => openMotorcycleProfile(moto.id));
    addMenuAction('Edit Odometer', () => startInlineEdit(moto.id));
    addMenuAction('Delete motorcycle', () => openDeleteMotorcycleModal(moto.id, name));
    optionsWrap.appendChild(optionsButton);
    if (document.getElementById('motorcyclesBackdrop')) {
        document.body.appendChild(menu);
    } else {
        optionsWrap.appendChild(menu);
    }
    top.append(icon, identity, optionsWrap);
    card.appendChild(top);

    const firstDivider = document.createElement('div');
    firstDivider.className = 'motorcycle-card__divider';
    card.appendChild(firstDivider);

    const odoLabel = document.createElement('p');
    odoLabel.className = 'motorcycle-card__label';
    odoLabel.textContent = 'Current odometer';
    const odoArea = document.createElement('button');
    odoArea.type = 'button';
    odoArea.className = 'motorcycle-card__odo-area';
    odoArea.setAttribute('aria-label', `Edit odometer for ${name}`);
    const odoRow = document.createElement('div');
    odoRow.className = 'motorcycle-card__odo-row';
    const odoValue = document.createElement('span');
    odoValue.className = 'motorcycle-card__odo-value';
    const mileage = getMotorcycleMileage(moto);
    odoValue.textContent = mileage === null ? '—' : mileage.toLocaleString();
    const odoUnit = document.createElement('span');
    odoUnit.className = 'motorcycle-card__odo-unit';
    odoUnit.textContent = 'km';
    odoUnit.hidden = mileage === null;
    const chevron = document.createElement('span');
    chevron.className = 'motorcycle-card__chevron';
    chevron.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
    odoRow.append(odoValue, odoUnit, chevron);
    odoArea.append(odoLabel, odoRow);
    odoArea.addEventListener('click', () => startInlineEdit(moto.id));
    card.appendChild(odoArea);

    if (editingId === moto.id) {
        const editor = document.createElement('div');
        editor.className = 'motorcycle-card__edit-odo';
        const input = document.createElement('input');
        input.id = `inline-mileage-${moto.id}`;
        input.type = 'number';
        input.min = '0';
        input.step = '1';
        input.inputMode = 'numeric';
        input.setAttribute('aria-label', `Current odometer for ${name}`);
        input.value = mileage === null ? '' : String(mileage);
        const saveButton = document.createElement('button');
        saveButton.type = 'button';
        saveButton.textContent = 'Save';
        saveButton.addEventListener('click', () => saveInlineMileage(moto.id));
        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.textContent = 'Cancel';
        cancelButton.addEventListener('click', cancelInlineEdit);
        editor.append(input, saveButton, cancelButton);
        card.appendChild(editor);
    }

    const secondDivider = document.createElement('div');
    secondDivider.className = 'motorcycle-card__divider';
    card.appendChild(secondDivider);

    const serviceRow = document.createElement('div');
    serviceRow.className = 'motorcycle-card__service';
    const serviceCopy = document.createElement('div');
    serviceCopy.className = 'motorcycle-card__service-copy';
    const serviceLabel = document.createElement('p');
    serviceLabel.className = 'motorcycle-card__label';
    serviceLabel.textContent = 'Next service';
    const serviceName = document.createElement('p');
    serviceName.className = 'motorcycle-card__service-name';
    const nextService = getNextService(moto);
    const statusClasses = {
        overdue: ['Overdue', 'motorcycle-card__status--overdue'],
        due: ['Overdue', 'motorcycle-card__status--overdue'],
        upcoming: ['Due soon', 'motorcycle-card__status--due-soon'],
        scheduled: ['Upcoming', 'motorcycle-card__status--upcoming']
    };
    const statusInfo = nextService && statusClasses[nextService.status.key];
    if (nextService && statusInfo) {
        const dueDate = formatServiceDueDate(nextService.dueDate);
        const dueInfo = dueDate
            ? dueDate
            : `at ${nextService.dueMileage.toLocaleString()} km`;
        serviceName.textContent = `${nextService.rule.task} · ${dueInfo}`;
        const status = document.createElement('span');
        status.className = `motorcycle-card__status ${statusInfo[1]}`;
        const dot = document.createElement('span');
        dot.className = 'motorcycle-card__status-dot';
        status.append(dot, document.createTextNode(statusInfo[0]));
        serviceRow.append(serviceCopy, status);
    } else {
        serviceName.textContent = 'All caught up';
        serviceRow.appendChild(serviceCopy);
    }
    serviceCopy.append(serviceLabel, serviceName);
    card.appendChild(serviceRow);

    return card;
}

function updateMotorcyclesCount(message) {
    const count = document.getElementById('motorcyclesModalCount');
    if (count) {
        count.textContent = message !== undefined
            ? message
            : `${motorcycles.length} ${motorcycles.length === 1 ? 'bike' : 'bikes'}`;
    }
}

function renderMotorcycles() {
    const list = document.getElementById('motorcyclesList');
    const emptyState = document.getElementById('emptyState');
    const addAnother = document.getElementById('addAnotherBtn');
    if (!list || !emptyState) return;
    updateMotorcyclesCount();
    if (addAnother) addAnother.classList.toggle('hidden', motorcycles.length === 0);
    document.querySelectorAll('.motorcycle-card__menu').forEach((menu) => menu.remove());

    if (motorcycles.length === 0) {
        list.replaceChildren();
        setElementHidden(list, true);
        setElementHidden(emptyState, false);
        return;
    }

    setElementHidden(emptyState, true);
    setElementHidden(list, false);
    list.replaceChildren(...motorcycles.map(createMotorcycleCard));
}

function renderCurrentMotorcycleView() {
    if (isMotorcycleProfilePage()) {
        renderMotorcycleProfile();
        return;
    }
    renderMotorcycles();
}

function closeMotorcyclesSheet() {
    const sheet = document.getElementById('motorcyclesBottomSheet');
    const backdrop = document.getElementById('motorcyclesBackdrop');
    if (sheet) sheet.style.display = 'none';
    if (backdrop) backdrop.style.display = 'none';
}

function getMotorcycleActionTrigger() {
    const activeElement = document.activeElement;
    const activeMenu = activeElement instanceof HTMLElement ? activeElement.closest('.motorcycle-card__menu') : null;
    if (!activeMenu) return activeElement;
    const card = Array.from(document.querySelectorAll('.motorcycle-card'))
        .find((item) => item.dataset.motorcycleId === activeMenu.dataset.motorcycleId);
    return card?.querySelector('.motorcycle-card__options') || activeElement;
}

function startInlineEdit(id) {
    editingId = id;
    renderCurrentMotorcycleView();
    requestAnimationFrame(() => document.getElementById(`inline-mileage-${id}`)?.focus({ preventScroll: true }));
}

function cancelInlineEdit() {
    editingId = null;
    renderCurrentMotorcycleView();
}

async function saveInlineMileage(id) {
    const input = document.getElementById(`inline-mileage-${id}`);
    if (!input) return;

    const rawMileage = input.value.trim();
    const nextMileage = Number(rawMileage);
    if (!rawMileage || !Number.isFinite(nextMileage) || nextMileage < 0) {
        showToast('Please enter a valid mileage value', 'error');
        return;
    }

    try {
        await updateFirestoreDoc('motorcycles', id, { mileage: nextMileage });
        editingId = null;
        await loadMotorcyclesFromFirestore();
        showToast('Mileage updated', 'success');
    } catch (error) {
        console.error('Error updating mileage:', error);
        showToast('Error updating mileage', 'error'); 
    }
}

function openAddModal() {
    console.log('openAddModal called, authReady:', authReady);
    editingId = null;
    if (isMotorcyclesModalOpen) motorcyclesNestedOpener = document.activeElement;
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
        submitBtnText.textContent = 'Add motorcycle';
    }
    const modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = 'Add motorcycle';
    const mileageUpdated = document.getElementById('mileageUpdated');
    if (mileageUpdated) {
        mileageUpdated.textContent = '';
        mileageUpdated.classList.add('hidden');
    }
    
    modal.classList.remove('hidden');
    backdrop.style.display = 'block';
    requestAnimationFrame(() => brandSelect?.focus({ preventScroll: true }));

    console.log('✓ Add motorcycle modal opened');
}

function closeModal() {
    const modal = document.getElementById('motorcycleModal');
    if (!modal) return;
    const backdrop = modal.querySelector('.absolute.inset-0');
    modal.classList.add('hidden');
    if (backdrop) backdrop.style.display = 'none';
    const opener = motorcyclesNestedOpener;
    motorcyclesNestedOpener = null;
    if (isMotorcyclesModalOpen && opener instanceof HTMLElement && opener.isConnected) {
        opener.focus({ preventScroll: true });
    } else if (isMotorcyclesModalOpen) {
        document.getElementById('motorcyclesCloseButton')?.focus({ preventScroll: true });
    }
}

function getFocusableElements(container) {
    const focusable = Array.from(container.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ));
    if (container.id === 'motorcyclesBottomSheet') {
        focusable.push(...document.querySelectorAll('.motorcycle-card__menu:not([hidden]) button:not([disabled])'));
    }
    return focusable.filter((element) => element.getClientRects().length > 0);
}

function getTopMotorcyclesDialog() {
    const deleteModal = document.getElementById('deleteMotorcycleModal');
    if (deleteModal && !deleteModal.classList.contains('hidden')) return deleteModal;
    const formModal = document.getElementById('motorcycleModal');
    if (formModal && !formModal.classList.contains('hidden')) return formModal;
    return document.getElementById('motorcyclesBottomSheet');
}

window.addEventListener('keydown', (event) => {
    if (!isMotorcyclesModalOpen) return;
    if (event.key === 'Escape') {
        const deleteModal = document.getElementById('deleteMotorcycleModal');
        const formModal = document.getElementById('motorcycleModal');
        if (deleteModal && !deleteModal.classList.contains('hidden')) closeDeleteMotorcycleModal();
        else if (formModal && !formModal.classList.contains('hidden')) closeModal();
        else closeMotorcyclesModal();
        event.stopPropagation();
        return;
    }
    if (event.key !== 'Tab') return;
    const dialog = getTopMotorcyclesDialog();
    const focusable = dialog ? getFocusableElements(dialog) : [];
    if (!focusable.length) {
        event.preventDefault();
        dialog?.focus({ preventScroll: true });
        return;
    }
    const currentIndex = focusable.indexOf(document.activeElement);
    const nextIndex = event.shiftKey
        ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1)
        : (currentIndex < 0 || currentIndex === focusable.length - 1 ? 0 : currentIndex + 1);
    event.preventDefault();
    focusable[nextIndex].focus({ preventScroll: true });
});

function openDeleteMotorcycleModal(id, label = '') {
    pendingDeleteId = id;
    pendingDeleteLabel = label;
    window.pendingDeleteMotorcycleLabel = label;
    if (isMotorcyclesModalOpen) motorcyclesNestedOpener = getMotorcycleActionTrigger();

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
    requestAnimationFrame(() => getFocusableElements(modal)[0]?.focus({ preventScroll: true }));
}

function closeDeleteMotorcycleModal() {
    const modal = document.getElementById('deleteMotorcycleModal');
    const backdrop = document.getElementById('deleteMotorcycleBackdrop');

    if (modal) modal.classList.add('hidden');
    if (backdrop) backdrop.classList.add('hidden');

    pendingDeleteId = null;
    pendingDeleteLabel = '';
    const opener = motorcyclesNestedOpener;
    motorcyclesNestedOpener = null;
    if (isMotorcyclesModalOpen && opener instanceof HTMLElement && opener.isConnected) {
        opener.focus({ preventScroll: true });
    } else if (isMotorcyclesModalOpen) {
        document.getElementById('motorcyclesCloseButton')?.focus({ preventScroll: true });
    }
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
    if (isMotorcyclesModalOpen) motorcyclesNestedOpener = getMotorcycleActionTrigger();
    editingId = id;
    const modal = document.getElementById('motorcycleModal');
    if (!modal) return;
    const backdrop = modal.querySelector('.modal-backdrop, .absolute.inset-0');
    if (!backdrop) return;

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
    document.getElementById('mileageInput').value = Number(moto.mileage || 0).toLocaleString('en-US');
    const mileageUpdated = document.getElementById('mileageUpdated');
    const updatedAt = moto.mileageUpdatedAt || moto.updatedAt || moto.createdAt;
    if (mileageUpdated && updatedAt) {
        const updatedDate = updatedAt && typeof updatedAt.toDate === 'function' ? updatedAt.toDate() : new Date(updatedAt);
        if (!Number.isNaN(updatedDate.getTime())) {
            mileageUpdated.textContent = `Updated ${updatedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
            mileageUpdated.classList.remove('hidden');
        }
    }
    const modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = 'Edit motorcycle';
    document.getElementById('submitBtnText').textContent = 'Save Changes';

    modal.classList.remove('hidden');
    backdrop.classList.remove('hidden');
    requestAnimationFrame(() => brandSelect?.focus({ preventScroll: true }));
}

async function deleteMotorcycle(id) {
    try {
        await deleteFirestoreDoc('motorcycles', id);
        motorcycles = motorcycles.filter(m => m.id !== id);
        editingId = null;
        renderCurrentMotorcycleView();
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
    const mileage = document.getElementById('mileageInput').value.replace(/,/g, '').trim();

    const brand = findBrandMatch(brandInput);
    const model = findModelMatch(brand, modelInput);

    console.log('Saving motorcycle:', { brand, model, year, mileage });

    if (!brand || !model || !year || !mileage) {
        showToast('Please fill all fields', 'error');
        return;
    }

    if (!isOfficialMotorcycleSelection(brand, model)) {
        showToast('Invalid motorcycle model. Please choose from the official list.', 'error');
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
                mileage,
                motorcycleName: `${brand} ${model}`
            });
            
            // Update local array
            const idx = motorcycles.findIndex(m => m.id === editingId);
            if (idx > -1) {
                motorcycles[idx] = { ...motorcycles[idx], brand, model, year, mileage, motorcycleName: `${brand} ${model}` };
            }
            
            showToast('Motorcycle updated', 'success');
        } else {
            // Add new motorcycle
            console.log('Adding new motorcycle');
            const newMoto = await addFirestoreDoc('motorcycles', {
                brand,
                model,
                year,
                mileage,
                motorcycleName: `${brand} ${model}`
            });
            
            console.log('Motorcycle added with ID:', newMoto.id);
            motorcycles.unshift(newMoto);
            showToast('Motorcycle added successfully', 'success');
        }
        
        editingId = null;
        window.dispatchEvent(new CustomEvent('motocare:motorcycle-changed'));
        renderCurrentMotorcycleView();
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
    if (!list || !emptyState) return;
    updateMotorcyclesCount();
    
    list.replaceChildren();
    setElementHidden(list, true);
    setElementHidden(emptyState, false);
    if (addAnother) addAnother.classList.add('hidden');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'rounded-xl px-4 py-3 shadow-xl flex items-center gap-3 bg-white';
    el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg><p class="flex-1 text-sm font-medium">${escapeHtml(message)}</p><button class="hover:bg-gray-100 rounded-full p-1"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6 18 18M6 18 18 6"/></svg></button>`;
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
