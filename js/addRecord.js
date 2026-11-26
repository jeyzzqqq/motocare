import { auth, db } from './firebase-config.js?v=3';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";
import { getFirestoreDocs, addFirestoreDoc, updateFirestoreDoc, ensureMotorcyclesTrackedFromOdo } from './firebaseUtils.js?v=4';
import { getServiceTitleGroups, getTitleSelectionMeta } from './maintenanceOptions.js?v=2';
import { showToast } from './toast.js?v=1';
import { syncMaintenanceNotifications } from './maintenanceNotifications.js?v=1';

let motorcycles = [];
let maintenanceRecords = [];
let currentUser = null; 

onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'index.html';
    } else {
        currentUser = user;
        loadMotorcyclesFromFirestore(user);
    }
});

function getMotorcycleMileage(motorcycle) {
    const raw = motorcycle.mileage ?? motorcycle.odo ?? motorcycle.currentOdo ?? motorcycle.odometer ?? 0;
    const numeric = Number(raw);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

function getAddRecordParams() {
    return new URLSearchParams(window.__addRecordQuery || window.location.search);
}

function populateTitleSelect(motorcycleId) {
    const select = document.getElementById('titleSelect');
    const customGroup = document.getElementById('customTitleGroup');
    const customLabel = document.getElementById('customTitleLabel');
    const customInput = document.getElementById('customTitle');

    if (!select) return;

    const selectedMotorcycle = motorcycles.find((m) => m.id === motorcycleId);
    const currentMileage = selectedMotorcycle ? getMotorcycleMileage(selectedMotorcycle) : 0;
    const groups = selectedMotorcycle
        ? getServiceTitleGroups(selectedMotorcycle, currentMileage, maintenanceRecords)
        : [];

    select.innerHTML = '<option value="">Select a title</option>';

    groups.forEach((group) => {
        const optGroup = document.createElement('optgroup');
        optGroup.label = group.label;

        group.options.forEach((item) => {
            const option = document.createElement('option');
            option.value = item.value;
            option.textContent = item.label;
            optGroup.appendChild(option);
        });

        select.appendChild(optGroup);
    });

    if (!select.value) {
        const firstOption = select.querySelector('option[value]');
        if (firstOption) select.value = firstOption.value;
    }

    if (customGroup) customGroup.classList.add('hidden');
    if (customLabel) customLabel.textContent = 'Describe the other service/repair';
    if (customInput) customInput.value = '';
    // Ensure update-mode visibility is synced when titles are repopulated
    try { syncUpdateModeVisibility(); } catch (e) {}
}

function syncTitleFieldVisibility() {
    const select = document.getElementById('titleSelect');
    const customGroup = document.getElementById('customTitleGroup');
    const customLabel = document.getElementById('customTitleLabel');
    const customInput = document.getElementById('customTitle');

    if (!select || !customGroup || !customLabel || !customInput) return;

    const { kind, key } = getTitleSelectionMeta(select.value);
    const isUpdateMileage = kind === 'other' && key === 'update-mileage';
    const needsCustom = (kind === 'other' && !isUpdateMileage) || select.value === 'upgrade:other';

    if (needsCustom) {
        customGroup.classList.remove('hidden');
        customLabel.textContent = kind === 'upgrade' ? 'Describe the upgrade/accessory' : 'Describe the other service/repair';
        customInput.required = true;
        if (!customInput.value) {
            customInput.value = select.selectedOptions?.[0]?.textContent?.trim() || 'Other Service / Repair';
        }
    } else {
        customGroup.classList.add('hidden');
        customInput.required = false;
        customInput.value = '';
    }
}

// Load motorcycles from Firestore
async function loadMotorcyclesFromFirestore(user) {
    const dropdown = document.getElementById('motorcycle');
    if (!dropdown) {
        console  .error('Motorcycle dropdown element not found in the DOM');
        return;
    }

    if (!user) {
        console.error('No authenticated user available while loading motorcycles');
        dropdown.innerHTML = '<option value="">Please sign in to load motorcycles.</option>'; 
        dropdown.disabled = true;
        return;
    }

    try {
        let loadedMotorcycles;
        try {
            loadedMotorcycles = await getFirestoreDocs('motorcycles', 'createdAt');
        } catch (error) {
            console.error('Error loading motorcycles from Firestore:', error);
            const fallbackQuery = query(
                collection(db, 'motorcycles'),
                where('uid', '==', user.uid)
            );
            const snapshot = await getDocs(fallbackQuery);
            loadedMotorcycles = snapshot.docs.map((entry) => ({
                id: entry.id,
                ...entry.data()
            })).filter((motorcycle) => motorcycle.deleted !== true);
        }

        motorcycles = await ensureMotorcyclesTrackedFromOdo(loadedMotorcycles);
        maintenanceRecords = await getFirestoreDocs('maintenance', 'createdAt');

        if (motorcycles.length === 0) {
            dropdown.innerHTML = '<option value="">No motorcycles found. Add one in Profile.</option>';
            dropdown.disabled = true;
            console.log('No motorcycles found in Firestore');
        } else {
            dropdown.innerHTML = '<option value="">Select a motorcycle</option>' +
                motorcycles.map((m) => `<option value="${m.id}">${m.motorcycleName || `${m.brand || 'Unknown'} ${m.model || 'Unknown'}`} (${m.year || ''})</option>`).join('');
            dropdown.disabled = false;
            console.log('Loaded motorcycles from Firestore:', motorcycles);
        }
    } catch (error) {
        console.error('Could not load motorcycle maintenance options:', error);
        dropdown.innerHTML = '<option value="">Error loading motorcycle maintenance options</option>';
        dropdown.disabled = true;
        return;
    }

    if (motorcycles.length === 1 && !dropdown.value) {
        dropdown.value = motorcycles[0].id;
    }

    const dateInput = document.getElementById('date');
    if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().slice(0, 10);
    }

    syncMileageField(dropdown.value);
    populateTitleSelect(dropdown.value);
    // Apply URL prefill parameters (used when coming from Schedule -> Mark as Complete)
    try {
        applyPrefillFromUrl();
    } catch (err) {
        console.warn('Prefill failed:', err);
    }
}

function applyPrefillFromUrl() {
    const params = getAddRecordParams();
    if (!params.toString()) return;

    const motorcycleId = params.get('motorcycleId');
    const mileage = params.get('mileage');
    const date = params.get('date');
    const titleValue = params.get('titleValue');
    const category = params.get('category');

    const dropdown = document.getElementById('motorcycle');
    const mileageInput = document.getElementById('mileage');
    const dateInput = document.getElementById('date');
    const titleSelect = document.getElementById('titleSelect');
    const customInput = document.getElementById('customTitle');
    const categoryInput = document.getElementById('category');

    if (motorcycleId && dropdown) {
        dropdown.value = motorcycleId;
        dropdown.dispatchEvent(new Event('change'));
    }

    // Set mileage after dropdown change (syncMileageField will set min)
    if (mileage && mileageInput) {
        mileageInput.value = String(Number(mileage) || 0);
    }

    if (date && dateInput) {
        dateInput.value = date;
    }

    if (titleValue && titleSelect) {
        // Try to set the select value. If option not yet present, set after a short delay.
        const setTitle = () => {
            titleSelect.value = titleValue;
            syncTitleFieldVisibility();
            syncUpdateModeVisibility();
            if (titleValue.startsWith('other:') && customInput && params.get('customTitle')) {
                customInput.value = params.get('customTitle');
            }
        };

        if ([...titleSelect.options].some(o => o.value === titleValue)) {
            setTitle();
        } else {
                // options may be populated slightly later; retry once
                setTimeout(() => {
                    if ([...titleSelect.options].some(o => o.value === titleValue)) {
                        setTitle();
                    } else {
                        // If the expected scheduled option is missing, inject it so the form treats this as a scheduled maintenance
                        try {
                            const opt = document.createElement('option');
                            opt.value = titleValue;
                            opt.textContent = params.get('customTitle') || titleValue;
                            // try to insert into the first optgroup if present, otherwise append
                            const firstOptGroup = titleSelect.querySelector('optgroup');
                            if (firstOptGroup) firstOptGroup.appendChild(opt); else titleSelect.appendChild(opt);
                            setTitle();
                        } catch (e) {
                            // fallback to custom option if injection fails
                            titleSelect.value = 'other:custom';
                            syncTitleFieldVisibility();
                            syncUpdateModeVisibility();
                            if (customInput) customInput.value = params.get('customTitle');
                        }
                    }
                }, 80);
        }
    }

    if (category && categoryInput) categoryInput.value = category;

}

function syncUpdateModeVisibility() {
    const titleSelect = document.getElementById('titleSelect');
    if (!titleSelect) return;
    const val = String(titleSelect.value || '').toLowerCase();
    const isUpdate = val.includes('update');

    const costInput = document.getElementById('cost');
    const mechanicSelect = document.getElementById('mechanic');
    const categorySelect = document.getElementById('category');

    const hideElement = (el) => {
        if (!el) return;
        const wrapper = el.parentElement;
        if (wrapper) wrapper.style.display = isUpdate ? 'none' : '';
        try { el.required = !isUpdate; } catch (e) {}
        try { el.disabled = isUpdate ? true : false; } catch (e) {}
    };

    hideElement(costInput);
    hideElement(mechanicSelect);
    hideElement(categorySelect);

    if (isUpdate && costInput) costInput.value = '0';
    if (isUpdate) showToast({ type: 'info', title: 'Mileage update mode', message: 'Only Date and Mileage are required.' });
}

function syncMileageField(motorcycleId) {
    const mileageInput = document.getElementById('mileage');
    const mileageHint = document.getElementById('mileageHint');
    const mileageUpdated = document.getElementById('mileageUpdated');
    if (!mileageInput || !mileageHint) return;

    const selectedMotorcycle = motorcycles.find((m) => m.id === motorcycleId);
    if (!selectedMotorcycle) {
        mileageInput.min = '0';
        mileageHint.textContent = 'Odometer changes help keep service reminders accurate.';
        if (mileageUpdated) mileageUpdated.textContent = '';
        return;
    }

    const currentMileage = getMotorcycleMileage(selectedMotorcycle);
    mileageInput.min = String(currentMileage);
    if (!mileageInput.value || Number(mileageInput.value) < currentMileage) {
        mileageInput.value = String(currentMileage);
    }
    mileageHint.textContent = 'Odometer changes help keep service reminders accurate.';

    if (mileageUpdated) {
        const rawDate = selectedMotorcycle.mileageUpdatedAt || selectedMotorcycle.updatedAt || selectedMotorcycle.createdAt;
        const updatedDate = rawDate && typeof rawDate.toDate === 'function' ? rawDate.toDate() : new Date(rawDate);
        mileageUpdated.textContent = !Number.isNaN(updatedDate.getTime())
            ? `Updated ${updatedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
            : '';
    }
}

document.getElementById('motorcycle')?.addEventListener('change', (e) => {
    syncMileageField(e.target.value);
    populateTitleSelect(e.target.value);
});

document.getElementById('titleSelect')?.addEventListener('change', (e) => { syncTitleFieldVisibility(e); syncUpdateModeVisibility(); });

document.querySelectorAll('[data-record-mode]').forEach((button) => {
    button.addEventListener('click', () => {
        document.querySelectorAll('[data-record-mode]').forEach((option) => {
            const isActive = option === button;
            option.classList.toggle('is-active', isActive);
            option.setAttribute('aria-selected', String(isActive));
        });
        document.body.dataset.recordMode = button.dataset.recordMode || 'maintenance';
    });
});

const recordForm = document.getElementById('addRecordForm');
if (recordForm) {
    [...recordForm.children].forEach((child, index) => {
        child.style.setProperty('--record-index', String(index));
    });
    requestAnimationFrame(() => recordForm.classList.add('is-ready'));
    recordForm.querySelectorAll('input, select, textarea').forEach((field) => {
        field.addEventListener('focus', () => {
            window.setTimeout(() => field.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
        });
    });
}

// Form submission
document.getElementById('addRecordForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const user = currentUser || auth.currentUser;
    if (!user) {
        showToast({ type: 'error', title: 'Sign-in required', message: 'Please sign in to save a record.' });
        window.location.replace('index.html');
        return;
    }
    
    const submitBtn = document.getElementById('submitBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const date = document.getElementById('date').value;
    const cost = Number(document.getElementById('cost').value);
    const category = document.getElementById('category').value.trim();
    const motorcycleId = document.getElementById('motorcycle').value;
    const mileageValue = Number(document.getElementById('mileage').value);
    const mechanicValue = document.getElementById('mechanic').value;
    const titleSelect = document.getElementById('titleSelect');
    const customTitle = document.getElementById('customTitle').value.trim();

    if (!submitBtn || !cancelBtn) {
        showToast({ type: 'error', title: 'Form unavailable', message: 'Form buttons are missing. Please refresh.' });
        return;
    }

    const updateMode = String(titleSelect.value || '').toLowerCase().includes('update');

    if (!titleSelect?.value || !date || !motorcycleId || Number.isNaN(mileageValue) || (Number.isNaN(cost) && !updateMode)) {
        showToast({ type: 'error', title: 'Check required fields', message: 'Complete all required fields with valid values.' });
        return;
    }

    if (!updateMode) {
        if (!category || Number.isNaN(cost) || cost <= 0 || !mechanicValue) {
            showToast({ type: 'error', title: 'Check required fields', message: 'Complete all required fields with valid values.' });
            return;
        }
    }

    // Get selected motorcycle details by ID
    const selectedMotorcycle = motorcycles.find(m => m.id === motorcycleId);
    if (!selectedMotorcycle) {
        showToast({ type: 'error', title: 'Invalid motorcycle', message: 'Select a valid motorcycle.' });
        return;
    }

    const currentMileage = getMotorcycleMileage(selectedMotorcycle);
    if (mileageValue < currentMileage) {
        showToast({ type: 'error', title: 'Mileage too low', message: `Mileage cannot be below current ODO (${currentMileage.toLocaleString()} km).` });
        return;
    }

    const { kind, key } = getTitleSelectionMeta(titleSelect.value);
    const selectedOption = titleSelect.selectedOptions?.[0];
    const selectedTitle = selectedOption?.textContent || '';
    const isUpdateMileageTitle = kind === 'other' && key === 'update-mileage';
    const requiresCustomTitle = !updateMode && (kind === 'other' && key !== 'update-mileage' || (kind === 'upgrade' && key === 'other'));
    const resolvedTitle = isUpdateMileageTitle
        ? 'Update Mileage'
        : requiresCustomTitle
        ? customTitle
        : selectedTitle.split('•')[0].trim();

    if (requiresCustomTitle && !customTitle) {
        showToast({ type: 'error', title: 'More detail needed', message: 'Describe the upgrade or other service item.' });
        return;
    }
    
    // Show loading state
    submitBtn.disabled = true;
    cancelBtn.disabled = true
    submitBtn.innerHTML = `
        <div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
        Saving...
    `;
    
    const normalizedCost = updateMode ? 0 : cost;
    const normalizedMechanic = updateMode ? '' : mechanicValue;
    const normalizedCategory = updateMode ? '' : category;

    const formData = {
        title: resolvedTitle,
        date,
        cost: normalizedCost,
        mileage: mileageValue,
        mechanic: normalizedMechanic,
        category: normalizedCategory,
        motorcycleId: selectedMotorcycle.id,
        motorcycleName: `${selectedMotorcycle.brand} ${selectedMotorcycle.model}`,
        recordKind: kind,
        taskKey: key
    };
    let savedMaintenanceRecord = null;
    
    try {
        // Add to Firestore (uses addFirestoreDoc to attach uid and serverTimestamp)
        await addFirestoreDoc('repairs', formData);

        if (kind === 'scheduled') {
            savedMaintenanceRecord = await addFirestoreDoc('maintenance', {
                motorcycleId: selectedMotorcycle.id,
                motorcycleName: `${selectedMotorcycle.brand} ${selectedMotorcycle.model}`,
                category,
                taskKey: key,
                task: resolvedTitle,
                status: 'completed',
                dueMileage: mileageValue,
                completedMileage: mileageValue,
                completedAt: date,
                source: 'add-record'
            });
        }

        // Keep the motorcycle profile ODO in sync with the latest logged mileage
        const motorcycleMileageUpdate = { mileage: mileageValue };
        if (mileageValue < Number(selectedMotorcycle.trackedFromOdo)) {
            motorcycleMileageUpdate.trackedFromOdo = mileageValue;
        }
        await updateFirestoreDoc('motorcycles', selectedMotorcycle.id, motorcycleMileageUpdate);

        const updatedMotorcycle = { ...selectedMotorcycle, ...motorcycleMileageUpdate };
        const notificationMotorcycles = motorcycles.map((motorcycle) =>
            motorcycle.id === selectedMotorcycle.id ? updatedMotorcycle : motorcycle
        );
        const notificationMaintenance = savedMaintenanceRecord
            ? [...maintenanceRecords, savedMaintenanceRecord]
            : maintenanceRecords;
        window.setTimeout(() => {
            void syncMaintenanceNotifications(user.uid, {
                motorcycles: notificationMotorcycles,
                maintenance: notificationMaintenance
            });
        }, 0);
        
        showToast({ type: 'success', title: 'Service record saved', message: 'Service record added successfully.' });

        // If the form was opened from the Schedule (mark as complete), return to Schedule
        const paramsAfter = getAddRecordParams();
        const fromSource = paramsAfter.get('source');
        setTimeout(() => {
            if (window.closeAddRecordSheet && document.getElementById('addRecordBackdrop')) {
                window.dispatchEvent(new CustomEvent('addrecord:saved', { detail: { source: fromSource } }));
            } else if (fromSource === 'schedule') {
                window.location.href = 'schedule.html';
            } else if (fromSource === 'expenses') {
                window.location.href = 'expenses.html';
            } else {
                window.location.href = 'history.html';
            }
        }, 500);
    } catch (error) {
        console.error('Error adding record:', error);
        showToast({ type: 'error', title: 'Save failed', message: error?.message || 'Error saving record. Please try again.' });
    } finally {
        // Reset button state on failure; on success we'll navigate away
        submitBtn.disabled = false;
        cancelBtn.disabled = false;
        submitBtn.innerHTML = 'Save Record';
    }
});