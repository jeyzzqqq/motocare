import { auth, onAuthStateChanged, db } from "./firebase-config.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let currentUser = null;
let isEditMode = false;

// Auth State Listener
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('emailValue').textContent = user.email;
        await loadUserStats();
    } else {
        window.location.href = "./index.html";
    }
});

// Load user statistics
async function loadUserStats() {
    if (!currentUser) return;
    
    try {
        // Get motorcycles count
        const bikesSnap = await getDocs(query(collection(db, 'motorcycles'), where('uid', '==', currentUser.uid)));
        document.getElementById('bikesCount').textContent = bikesSnap.size;

        // Get repairs/services count
        const repairsSnap = await getDocs(query(collection(db, 'repairs'), where('uid', '==', currentUser.uid)));
        document.getElementById('servicesCount').textContent = repairsSnap.size;

        // Calculate total spent
        const expensesSnap = await getDocs(query(collection(db, 'expenses'), where('uid', '==', currentUser.uid)));
        let totalSpent = 0;
        expensesSnap.forEach(doc => {
            totalSpent += parseFloat(doc.data().amount || 0);
        });
        document.getElementById('totalSpent').textContent = '₱' + totalSpent.toFixed(2);
    } catch (error) {
        console.error("Error loading stats:", error);
    }
}

// Toggle edit mode
window.toggleEdit = function() {
    isEditMode = !isEditMode;
    const editIcon = document.getElementById('editIcon');
    const emailInput = document.getElementById('emailInput');
    const emailValue = document.getElementById('emailValue');
    const saveBtn = document.getElementById('saveBtn');
    const cancelBtn = document.getElementById('cancelBtn');

    if (isEditMode) {
        // Enter edit mode
        editIcon.className = 'fa-solid fa-check text-xl text-green-700';
        emailValue.classList.add('hidden');
        emailInput.classList.remove('hidden');
        emailInput.value = currentUser.email;
        saveBtn.classList.remove('hidden');
        cancelBtn.classList.remove('hidden');
    } else {
        // Exit edit mode
        editIcon.className = 'fa-solid fa-pen text-xl';
        emailValue.classList.remove('hidden');
        emailInput.classList.add('hidden');
        saveBtn.classList.add('hidden');
        cancelBtn.classList.add('hidden');
    }
};

// Save profile changes
window.saveProfile = async function() {
    // Email update via Firebase Auth if needed
    const newEmail = document.getElementById('emailInput').value;
    
    if (newEmail && newEmail !== currentUser.email) {
        try {
            await auth.currentUser.updateEmail(newEmail);
            document.getElementById('emailValue').textContent = newEmail;
            showToast('Email updated successfully', 'success');
        } catch (error) {
            console.error("Error updating email:", error);
            showToast('Error updating email: ' + error.message, 'error');
            return;
        }
    }

    isEditMode = false;
    window.toggleEdit();
};

// Cancel edit
window.cancelEdit = function() {
    isEditMode = true;
    window.toggleEdit();
};

// Logout
window.logoutUser = async function() {
    try {
        await auth.signOut();
        window.location.href = "./index.html";
    } catch (error) {
        console.error("Logout error:", error);
        showToast('Error logging out', 'error');
    }
};

// Show toast notification
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;
    
    const toast = document.createElement('div');
    const colors = {
        success: 'bg-green-700 text-white',
        error: 'bg-red-500 text-white',
        info: 'bg-blue-500 text-white'
    };
    
    const icons = {
        success: 'check-circle',
        error: 'alert-circle',
        info: 'info'
    };

    toast.className = `${colors[type]} rounded-lg px-4 py-3 shadow-lg flex items-center gap-2`;
    toast.innerHTML = `
        <i class="fa-solid fa-${icons[type]}"></i>
        <span class="text-sm font-medium">${message}</span>
    `;
    
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}