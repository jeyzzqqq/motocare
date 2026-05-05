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
    return `$${amount.toFixed(2)}`;
}

// Format Date
function formatDate(date) {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(date).toLocaleDateString('en-US', options);
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