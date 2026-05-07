// Mobile Navigation Component
const NAV_ITEMS = [
    { label: 'Home', href: 'dashboard.html', icon: 'fa-house', activePaths: ['/', '/dashboard.html'] },
    { label: 'Profile', href: 'profile.html', icon: 'fa-user', activePaths: ['/profile.html'] },
    { label: 'Schedule', href: 'schedule.html', icon: 'fa-calendar', activePaths: ['/schedule.html', '/maintenance.html'] },
    { label: 'History', href: 'history.html', icon: 'fa-clock', activePaths: ['/history.html', '/repairs.html'] },
    { label: 'Expenses', href: 'expenses.html', icon: 'fa-dollar-sign', activePaths: ['/expenses.html'] }
];

function getActivePath() {
    const pathname = window.location.pathname;
    // Extract the filename from the path
    const filename = pathname.split('/').pop() || 'dashboard.html';
    return '/' + filename;
}

function isActive(navItem, currentPath) {
    return navItem.activePaths.includes(currentPath);
}

function getNavMarkup() {
    const currentPath = getActivePath();
    
    return `
        <nav class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-40">
            <div class="max-w-lg mx-auto px-4">
                <div class="grid grid-cols-5 gap-0">
                    ${NAV_ITEMS.map((item) => {
                        const active = isActive(item, currentPath);
                        return `
                            <a href="${item.href}" class="flex flex-col items-center justify-center py-3 px-2 rounded-lg transition-all ${
                                active 
                                    ? 'text-green-700 scale-110' 
                                    : 'text-gray-500 hover:text-gray-700'
                            }">
                                <i class="fa-solid ${item.icon} text-lg mb-1" aria-hidden="true"></i>
                                <span class="text-xs font-medium whitespace-nowrap">${item.label}</span>
                                ${active ? '<div class="absolute bottom-0 w-full h-1 bg-green-700 rounded-t-md"></div>' : ''}
                            </a>
                        `;
                    }).join('')}
                </div>
            </div>
        </nav>
    `;
}

function mountMobileNav() {
    const navContainer = document.getElementById('mobileNav');
    if (!navContainer) return;
    
    navContainer.innerHTML = getNavMarkup();
}

// Mount on page load
document.addEventListener('DOMContentLoaded', mountMobileNav);
