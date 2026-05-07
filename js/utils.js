// Toast Notification Function
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    
    const colors = {
        success: 'bg-green-700 text-white',
        error: 'bg-red-500 text-white',
        info: 'bg-blue-500 text-white'
    };

    const icons = {
        success: 'check-circle-2',
        error: 'alert-circle',
        info: 'info'
    };

    toast.className = `${colors[type]} rounded-xl px-4 py-3 shadow-xl flex items-center gap-3 animate-slide-in`;
    toast.innerHTML = `
        <i class="lucide lucide-${icons[type]} text-xl"></i>
        <p class="flex-1 text-sm font-medium">${message}</p>
        <button onclick="this.parentElement.remove()" class="hover:bg-white/20 rounded-full p-1 transition-colors">
            <i class="lucide lucide-x text-lg"></i>
        </button>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Format Currency
function formatCurrency(amount) {
    return `₱${amount.toFixed(2)}`;
}

// Format Date
function formatDate(date) {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(date).toLocaleDateString('en-US', options);
}

// Normalize a Firestore document object into consistent fields used across the UI
function normalizeRecord(raw = {}) {
    const r = Object.assign({}, raw);
    r.id = raw.id || raw._id || r.id;
    r.uid = raw.uid || null;

    const created = raw.createdAt || raw.created_at || raw.created || null;
    const dateRaw = raw.date || raw.dueDate || created || null;
    let dateObj = null;
    if (dateRaw && typeof dateRaw.toDate === 'function') {
        // Firestore Timestamp
        dateObj = dateRaw.toDate();
    } else if (dateRaw) {
        dateObj = new Date(dateRaw);
    }
    r.rawDate = dateObj;
    r.dateString = r.rawDate ? formatDate(r.rawDate) : '';

    // cost/amount normalization
    const costVal = raw.cost !== undefined ? raw.cost : (raw.amount !== undefined ? raw.amount : 0);
    r.cost = Number(costVal || 0);
    r.amount = r.cost;

    // title/item/category normalization
    r.title = raw.title || raw.task || raw.name || '';
    r.item = r.title || r.task || 'Record';
    r.category = raw.category || 'Other';

    // motorcycle name normalization
    r.motorcycleName = raw.motorcycleName || (raw.brand && raw.model ? `${raw.brand} ${raw.model}` : raw.motorcycle || '');

    return r;
}

// Check Authentication
function checkAuth() {
    // Backward-compatible helper for non-module pages.
    // Real protection is done inside each page module with auth.currentUser / onAuthStateChanged.
    const protectedPage = window.location.pathname.endsWith('.html') && !window.location.pathname.endsWith('index.html');
    if (protectedPage && !window.location.pathname.includes('index.html')) {
        const moduleAuth = window.firebaseAuthCurrentUser || null;
        if (!moduleAuth) {
            window.location.href = 'index.html';
        }
    }
}