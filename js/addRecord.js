import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let selectedFile = null;

onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'index.html';
    }
});

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
document.getElementById('addRecordForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitBtn = document.getElementById('submitBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    
    // Show loading state
    submitBtn.disabled = true;
    cancelBtn.disabled = true;
    submitBtn.innerHTML = `
        <div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
        Saving...
    `;
    
    const formData = {
        title: document.getElementById('title').value,
        date: document.getElementById('date').value,
        cost: parseFloat(document.getElementById('cost').value),
        mileage: document.getElementById('mileage').value,
        mechanic: document.getElementById('mechanic').value,
        category: document.getElementById('category').value,
        notes: document.getElementById('notes').value,
        hasReceipt: selectedFile !== null,
        userId: auth.currentUser.uid,
        createdAt: new Date().toISOString()
    };
    
    try {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // Add to Firestore
        await addDoc(collection(db, 'repairs'), formData);
        
        showToast('Service record added successfully!', 'success');
        
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 500);
    } catch (error) {
        console.error('Error adding record:', error);
        showToast('Error saving record. Please try again.', 'error');
        
        // Reset button state
        submitBtn.disabled = false;
        cancelBtn.disabled = false;
        submitBtn.innerHTML = 'Save Record';
    }
});