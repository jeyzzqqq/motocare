import { auth, onAuthStateChanged } from "./firebase-config.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestoreDocs } from './firebaseUtils.js';

let currentUser = null;

const STREAK_PREFIX = 'motocare-streak-v1:';
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function dateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getStreakState(uid) {
    let data = {};
    try { data = JSON.parse(localStorage.getItem(`${STREAK_PREFIX}${uid}`)) || {}; } catch { data = {}; }
    const today = new Date();
    const todayKey = dateKey(today);
    const dates = new Set([...(data.dates || []), todayKey]);
    let streak = 1;
    const cursor = new Date(today);
    while (true) {
        cursor.setDate(cursor.getDate() - 1);
        if (!dates.has(dateKey(cursor))) break;
        streak += 1;
    }
    const monday = new Date(today);
    const day = monday.getDay();
    monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));
    const completed = DAY_LABELS.map((_, index) => {
        const current = new Date(monday);
        current.setDate(monday.getDate() + index);
        return dates.has(dateKey(current)) && dateKey(current) <= todayKey;
    });
    return { streak, completed, remaining: Math.max(0, 7 - completed.filter(Boolean).length) };
}

function renderProfile(user, bikeCount) {
    const name = user.displayName || user.email?.split('@')[0] || 'Rider';
    document.getElementById('profileName').textContent = name;
    document.getElementById('profileEmail').textContent = user.email || '';
    document.getElementById('bikeCount').textContent = `${bikeCount} bike${bikeCount === 1 ? '' : 's'} registered`;
    if (user.photoURL) {
        const avatar = document.getElementById('profileAvatar');
        const image = document.createElement('img');
        image.src = user.photoURL;
        image.alt = `${name} profile photo`;
        avatar.replaceChildren(image);
    }

    const state = getStreakState(user.uid);
    document.getElementById('profileStreak').textContent = `${state.streak}-Day Streak`;
    document.getElementById('profileWeek').innerHTML = state.completed.map((complete, index) => `<span class="streak-day${complete ? ' is-complete' : ''}">${complete ? '&#10003;' : DAY_LABELS[index]}</span>`).join('');
    document.getElementById('profileProgress').textContent = state.remaining ? `${state.remaining} more day${state.remaining === 1 ? '' : 's'} to complete your week.` : 'You completed your week. Keep it going!';
}

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
        renderProfile(currentUser, bikeCount);

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