import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getFirestoreDocs, addFirestoreDoc, updateFirestoreDoc } from './firebaseUtils.js';
import { getServiceTitleGroups, getTitleSelectionMeta } from './maintenanceOptions.js';

let motorcycles = [];
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

function populateTitleSelect(motorcycleId) {
    const select = document.getElementById('titleSelect');
    const customGroup = document.getElementById('customTitleGroup');
    const customLabel = document.getElementById('customTitleLabel');
    const customInput = document.getElementById('customTitle');

    if (!select) return;

    const selectedMotorcycle = motorcycles.find((m) => m.id === motorcycleId);
    const currentMileage = selectedMotorcycle ? getMotorcycleMileage(selectedMotorcycle) : 0;
    const groups = selectedMotorcycle ? getServiceTitleGroups(selectedMotorcycle, currentMileage) : [];

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

    if (customGroup) customGroup.classList.add('hidden');
    if (customLabel) customLabel.textContent = 'Custom Item';
    if (customInput) customInput.value = '';
}

function syncTitleFieldVisibility() {
    const select = document.getElementById('titleSelect');
    const customGroup = document.getElementById('customTitleGroup');
    const customLabel = document.getElementById('customTitleLabel');
    const customInput = document.getElementById('customTitle');

    if (!select || !customGroup || !customLabel || !customInput) return;

    const { kind } = getTitleSelectionMeta(select.value);
    const needsCustom = kind === 'other' || select.value === 'upgrade:other';

    if (needsCustom) {
        customGroup.classList.remove('hidden');
        customLabel.textContent = kind === 'upgrade' ? 'Describe the upgrade/accessory' : 'Describe the other service/repair';
        customInput.required = true;
    } else {
        customGroup.classList.add('hidden');
        customInput.required = false;
        customInput.value = '';
    }
}

// Load motorcycles from Firestore
async function loadMotorcyclesFromFirestore(user = currentUser) {
    const dropdown = document.getElementById('motorcycle');
    if (!dropdown) {
        console.error('Motorcycle dropdown not found');
        return;
    }

    if (!user) {
        console.error('No authenticated user available while loading motorcycles');
        dropdown.innerHTML = '<option value="">Please sign in first</option>';
        dropdown.disabled = true;
        return;
    }

    try {
        motorcycles = await getFirestoreDocs('motorcycles', 'createdAt');
        
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
        console.error('Error loading motorcycles from Firestore:', error);

        // Fallback: try a plain uid-filtered query without ordering.
        try {
            const fallbackQuery = query(
                collection(db, 'motorcycles'),
                where('uid', '==', user.uid)
            );
            const snapshot = await getDocs(fallbackQuery);
            motorcycles = [];
            snapshot.forEach((doc) => {
                motorcycles.push({ id: doc.id, ...doc.data() });
            });

            if (motorcycles.length === 0) {
                dropdown.innerHTML = '<option value="">No motorcycles found. Add one in Profile.</option>';
                dropdown.disabled = true;
                console.log('No motorcycles found in Firestore (fallback)');
            } else {
                dropdown.innerHTML = '<option value="">Select a motorcycle</option>' +
                    motorcycles.map((m) => `<option value="${m.id}">${m.motorcycleName || `${m.brand || 'Unknown'} ${m.model || 'Unknown'}`} (${m.year || ''})</option>`).join('');
                dropdown.disabled = false;
                console.log('Loaded motorcycles from Firestore using fallback query:', motorcycles);
            }
        } catch (fallbackError) {
            console.error('Fallback motorcycle query failed:', fallbackError);
            dropdown.innerHTML = '<option value="">Error loading motorcycles</option>';
            dropdown.disabled = true;
        }
    }

    syncMileageField(dropdown.value);
    populateTitleSelect(dropdown.value);
}

function syncMileageField(motorcycleId) {
    const mileageInput = document.getElementById('mileage');
    const mileageHint = document.getElementById('mileageHint');
    if (!mileageInput || !mileageHint) return;

    const selectedMotorcycle = motorcycles.find((m) => m.id === motorcycleId);
    if (!selectedMotorcycle) {
        mileageInput.min = '0';
        mileageHint.textContent = 'Select a motorcycle first to lock the minimum mileage.';
        return;
    }

    const currentMileage = getMotorcycleMileage(selectedMotorcycle);
    mileageInput.min = String(currentMileage);
    if (!mileageInput.value || Number(mileageInput.value) < currentMileage) {
        mileageInput.value = String(currentMileage);
    }
    mileageHint.textContent = `Current motorcycle ODO: ${currentMileage.toLocaleString()} km. Enter the new reading, not lower than this.`;
}

document.getElementById('motorcycle')?.addEventListener('change', (e) => {
    syncMileageField(e.target.value);
    populateTitleSelect(e.target.value);
});

document.getElementById('titleSelect')?.addEventListener('change', syncTitleFieldVisibility);

// Form submission
// Toast notification system
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const bgColor = type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500';
    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
    
    toast.className = `fixed bottom-8 left-1/2 transform -translate-x-1/2 px-4 py-3 rounded-lg text-white ${bgColor} shadow-lg z-50 flex items-center gap-2`;
    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.remove(), 3000);
}

document.getElementById('addRecordForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const user = currentUser || auth.currentUser;
    if (!user) {
        showToast('Please sign in to save a record.', 'error');
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
        showToast('Form buttons are missing. Please refresh.', 'error');
        return;
    }

    if (!titleSelect?.value || !date || !category || !motorcycleId || Number.isNaN(cost) || cost <= 0 || Number.isNaN(mileageValue) || !mechanicValue) {
        showToast('Please complete all required fields with valid values.', 'error');
        return;
    }

    // Get selected motorcycle details by ID
    const selectedMotorcycle = motorcycles.find(m => m.id === motorcycleId);
    if (!selectedMotorcycle) {
        showToast('Invalid motorcycle selection.', 'error');
        return;
    }

    const currentMileage = getMotorcycleMileage(selectedMotorcycle);
    if (mileageValue < currentMileage) {
        showToast(`Mileage cannot go below the motorcycle's current ODO (${currentMileage.toLocaleString()} km).`, 'error');
        return;
    }

    const { kind, key } = getTitleSelectionMeta(titleSelect.value);
    const selectedOption = titleSelect.selectedOptions?.[0];
    const selectedTitle = selectedOption?.textContent || '';
    const requiresCustomTitle = kind === 'other' || (kind === 'upgrade' && key === 'other');
    const resolvedTitle = requiresCustomTitle
        ? customTitle
        : selectedTitle.split('•')[0].trim();

    if (requiresCustomTitle && !customTitle) {
        showToast('Please describe the upgrade or other service item.', 'error');
        return;
    }
    
    // Show loading state
    submitBtn.disabled = true;
    cancelBtn.disabled = true;
    submitBtn.innerHTML = `
        <div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
        Saving...
    `;
    
    const formData = {
        title: resolvedTitle,
        date,
        cost,
        mileage: mileageValue,
        mechanic: mechanicValue,
        category,
        notes: document.getElementById('notes').value,
        motorcycleId: selectedMotorcycle.id,
        motorcycleName: `${selectedMotorcycle.brand} ${selectedMotorcycle.model}`,
        recordKind: kind,
        taskKey: key
    };
    
    try {
        // Add to Firestore (uses addFirestoreDoc to attach uid and serverTimestamp)
        await addFirestoreDoc('repairs', formData);

        if (kind === 'scheduled') {
            await addFirestoreDoc('maintenance', {
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
        await updateFirestoreDoc('motorcycles', selectedMotorcycle.id, {
            mileage: mileageValue
        });
        
        showToast('Service record added successfully!', 'success');
        
        setTimeout(() => {
            window.location.href = 'history.html';
        }, 500);
    } catch (error) {
        console.error('Error adding record:', error);
        showToast(error?.message || 'Error saving record. Please try again.', 'error');
    } finally {
        // Reset button state on failure; on success we'll navigate away
        submitBtn.disabled = false;
        cancelBtn.disabled = false;
        submitBtn.innerHTML = 'Save Record';
    }
});