import { auth, onAuthStateChanged } from "./firebase-config.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestoreDocs } from './firebaseUtils.js';

let currentUser = null;

// Auth State Listener - redirect ONLY if explicitly checked and no user
onAuthStateChanged(auth, async (user) => {
    console.log('Auth state changed:', user ? user.uid : 'no user');
    if (user) {
        currentUser = user;
        console.log('User authenticated:', user.uid);
        await loadUserStats();
    } else {
        console.log('No user, redirecting to login');
        setTimeout(() => {
            window.location.href = "./index.html";
        }, 1000);
    }
});

// Load user statistics
async function loadUserStats() {
    if (!currentUser) return;
    
    try {
        // Get motorcycles count
        const bikes = await getFirestoreDocs('motorcycles');
        const bikeCount = bikes.length;
        console.log('Motorcycles count:', bikeCount);

        // Get repairs/services count
        const repairs = await getFirestoreDocs('repairs');
        const serviceCount = repairs.length;
        console.log('Services count:', serviceCount);

        // Calculate total spent from repairs collection (use 'cost' field)
        let totalSpent = 0;
        repairs.forEach(doc => {
            totalSpent += parseFloat(doc.cost || 0);
        });
        
        console.log('Total spent:', totalSpent);
    } catch (error) {
        console.error("Error loading stats:", error);
    }
}

// Edit toggle - simple for now (no email editing)
window.toggleEdit = function() {
    console.log('Edit toggle clicked');
};

// Save profile - no-op for now
window.saveProfile = async function() {
    console.log('Save clicked');
};

// Cancel edit - no-op for now
window.cancelEdit = function() {
    console.log('Cancel clicked');
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