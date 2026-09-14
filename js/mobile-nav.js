const NAV_ITEMS = [
    { label: 'Home', href: 'dashboard.html', icon: 'home', activePaths: ['/', '/dashboard.html'] },
    { label: 'Schedule', href: 'schedule.html', icon: 'calendar', activePaths: ['/schedule.html', '/maintenance.html'] },
    { label: 'MotoAI', href: 'motoai.html', icon: 'sparkles', activePaths: ['/motoai.html'], center: true },
    { label: 'Expenses', href: 'expenses.html', icon: 'receipt', activePaths: ['/expenses.html'] },
    { label: 'Profile', href: 'profile.html', icon: 'user', activePaths: ['/profile.html'] }
];

const NAV_ICONS = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V10Z" />',
    calendar: '<rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />',
    sparkles: '<path d="m12 3-1.2 4.1L7 8.3l3.8 1.2L12 13l1.2-3.5L17 8.3l-3.8-1.2L12 3ZM19 13l-.7 2.3L16 16l2.3.7L19 19l.7-2.3L22 16l-2.3-.7L19 13ZM5 14l-.8 2.7L2 17.5l2.2.8L5 21l.8-2.7 2.2-.8-2.2-.8L5 14Z" />',
    receipt: '<path d="M4 3h16v18l-3-2-3 2-3-2-3 2-4-2V3Z" /><path d="M8 8h8M8 12h8M8 16h4" />',
    user: '<circle cx="12" cy="8" r="3.5" /><path d="M5 21a7 7 0 0 1 14 0" />'
};

function getNavIcon(icon) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${NAV_ICONS[icon]}</svg>`;
}

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
        <nav class="mobile-bottom-nav" aria-label="Primary navigation">
            <div class="mobile-bottom-nav__inner">
                ${NAV_ITEMS.map((item) => {
                    const active = isActive(item, currentPath);
                    const classes = `mobile-bottom-nav__item${item.center ? ' mobile-bottom-nav__item--center' : ''}${active ? ' is-active' : ''}`;
                    return `
                        <a href="${item.href}" class="${classes}" aria-current="${active ? 'page' : 'false'}">
                            <span class="mobile-bottom-nav__icon${item.center ? ' mobile-bottom-nav__icon--center' : ''}">${getNavIcon(item.icon)}</span>
                            <span class="mobile-bottom-nav__label">${item.label}</span>
                        </a>
                    `;
                }).join('')}
                </div>
            </div>
        </nav>
    `;
}

function addNavStyles() {
    if (document.getElementById('mobile-nav-styles')) return;

    const style = document.createElement('style');
    style.id = 'mobile-nav-styles';
    style.textContent = `
        .mobile-bottom-nav {
            position: fixed;
            right: 0;
            bottom: 0;
            left: 0;
            z-index: 40;
            background: #fff;
            border-top: 1px solid #e8e8ea;
            box-shadow: 0 -4px 16px rgba(31, 35, 32, 0.08);
            padding: 7px 12px max(7px, env(safe-area-inset-bottom));
        }
        .mobile-bottom-nav__inner {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            width: min(100%, 480px);
            min-height: 58px;
            margin: 0 auto;
        }
        .mobile-bottom-nav__item {
            display: flex;
            position: relative;
            align-items: center;
            justify-content: flex-end;
            flex-direction: column;
            min-width: 0;
            gap: 4px;
            color: #8e8e93;
            text-decoration: none;
            -webkit-tap-highlight-color: transparent;
        }
        .mobile-bottom-nav__icon {
            display: grid;
            place-items: center;
            width: 24px;
            height: 24px;
        }
        .mobile-bottom-nav__icon svg {
            width: 21px;
            height: 21px;
            fill: none;
            stroke: currentColor;
            stroke-linecap: round;
            stroke-linejoin: round;
            stroke-width: 1.8;
        }
        .mobile-bottom-nav__label {
            max-width: 100%;
            overflow: hidden;
            font-family: sans-serif;
            font-size: 11px;
            font-weight: 500;
            line-height: 14px;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .mobile-bottom-nav__item--center {
            color: #2e9e4f;
        }
        .mobile-bottom-nav__icon--center {
            width: 48px;
            height: 48px;
            margin-top: -27px;
            border: 4px solid #fff;
            border-radius: 50%;
            color: #fff;
            background: #2e9e4f;
            box-shadow: 0 3px 8px rgba(46, 158, 79, 0.28);
        }
        .mobile-bottom-nav__icon--center svg {
            width: 22px;
            height: 22px;
            stroke-width: 1.9;
        }
        .mobile-bottom-nav__item--center .mobile-bottom-nav__label {
            font-weight: 700;
        }
        .mobile-bottom-nav__item:not(.mobile-bottom-nav__item--center):active .mobile-bottom-nav__icon,
        .mobile-bottom-nav__item:not(.mobile-bottom-nav__item--center).is-active {
            color: #2e9e4f;
        }
    `;
    document.head.appendChild(style);
}

function mountMobileNav() {
    const navContainer = document.getElementById('mobileNav');
    if (!navContainer) return;

    addNavStyles();
    navContainer.innerHTML = getNavMarkup();
}

// Mount on page load
document.addEventListener('DOMContentLoaded', mountMobileNav);
