import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getFirestoreDocs, addFirestoreDoc } from './firebaseUtils.js';

let selectedFile = null;
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
                motorcycles.map((m, idx) => `<option value="${m.id}">${m.brand || 'Unknown'} ${m.model || 'Unknown'} (${m.year || ''})</option>`).join('');
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
                    motorcycles.map((m) => `<option value="${m.id}">${m.brand || 'Unknown'} ${m.model || 'Unknown'} (${m.year || ''})</option>`).join('');
                dropdown.disabled = false;
                console.log('Loaded motorcycles from Firestore using fallback query:', motorcycles);
            }
        } catch (fallbackError) {
            console.error('Fallback motorcycle query failed:', fallbackError);
            dropdown.innerHTML = '<option value="">Error loading motorcycles</option>';
            dropdown.disabled = true;
        }
    }
}

// File upload handling
document.getElementById('uploadArea')?.addEventListener('click', () => {
    document.getElementById('receiptInput').click();
});

document.getElementById('receiptInput')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        selectedFile = file;
        showReceiptPreview(file);
    }
});

document.getElementById('removeReceiptBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    selectedFile = null;
    hideReceiptPreview();
});

function showReceiptPreview(file) {
    const uploadArea = document.getElementById('uploadArea');
    const preview = document.getElementById('receiptPreview');
    const removeBtn = document.getElementById('removeReceiptBtn');
    
    uploadArea.classList.add('hidden');
    preview.classList.remove('hidden');
    preview.classList.add('flex');
    removeBtn.classList.remove('hidden');
    removeBtn.classList.add('flex');
    
    document.getElementById('receiptFileName').textContent = file.name;
    document.getElementById('receiptFileSize').textContent = formatFileSize(file.size);
}

function hideReceiptPreview() {
    const uploadArea = document.getElementById('uploadArea');
    const preview = document.getElementById('receiptPreview');
    const removeBtn = document.getElementById('removeReceiptBtn');
    
    uploadArea.classList.remove('hidden');
    preview.classList.add('hidden');
    preview.classList.remove('flex');
    removeBtn.classList.add('hidden');
    removeBtn.classList.remove('flex');
    
    document.getElementById('receiptInput').value = '';
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

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
    const title = document.getElementById('title').value.trim();
    const date = document.getElementById('date').value;
    const cost = Number(document.getElementById('cost').value);
    const category = document.getElementById('category').value.trim();
    const motorcycleId = document.getElementById('motorcycle').value;

    if (!submitBtn || !cancelBtn) {
        showToast('Form buttons are missing. Please refresh.', 'error');
        return;
    }

    if (!title || !date || !category || !motorcycleId || Number.isNaN(cost) || cost <= 0) {
        showToast('Please complete all required fields with valid values.', 'error');
        return;
    }

    // Get selected motorcycle details by ID
    const selectedMotorcycle = motorcycles.find(m => m.id === motorcycleId);
    if (!selectedMotorcycle) {
        showToast('Invalid motorcycle selection.', 'error');
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
        title,
        date,
        cost,
        mileage: document.getElementById('mileage').value,
        mechanic: document.getElementById('mechanic').value,
        category,
        notes: document.getElementById('notes').value,
        hasReceipt: selectedFile !== null,
        motorcycleId: selectedMotorcycle.id,
        motorcycleName: `${selectedMotorcycle.brand} ${selectedMotorcycle.model}`
    };
    
    try {
        // Add to Firestore (uses addFirestoreDoc to attach uid and serverTimestamp)
        await addFirestoreDoc('repairs', formData);
        
        showToast('Service record added successfully!', 'success');
        
        setTimeout(() => {
            window.location.href = 'dashboard.html';
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