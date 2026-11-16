const NAV_ITEMS = [
    { label: 'Home', href: 'dashboard.html', icon: 'home', activePaths: ['/', '/dashboard.html'] },
    { label: 'Schedule', href: 'schedule.html', icon: 'calendar', activePaths: ['/schedule.html', '/maintenance.html'] },
    { label: 'MotoAI', href: 'motoai.html', icon: 'motoai', activePaths: ['/motoai.html'], center: true },
    { label: 'Expenses', href: 'expenses.html', icon: 'receipt', activePaths: ['/expenses.html'] },
    { label: 'Profile', href: 'profile.html', icon: 'user', activePaths: ['/profile.html'] }
];

const NAV_ICONS = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V10Z" />',
    calendar: '<rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />',
    motoai: '<path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2M20 14h2M15 13v2M9 13v2" />',
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
            right: 50%;
            bottom: 0;
            left: auto;
            z-index: 40;
            width: min(100%, 384px);
            transform: translateX(50%);
            background: rgba(255, 255, 255, .85);
            background: color-mix(in srgb, var(--moto-surface, #fff) 85%, transparent);
            border-top: 1px solid var(--moto-border, rgba(17, 22, 19, .08));
            box-shadow: none;
            box-sizing: border-box;
            height: 66px;
            padding: 8px 12px max(8px, env(safe-area-inset-bottom));
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
        }
        .mobile-bottom-nav__inner {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            width: 100%;
            min-height: 54px;
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
            color: rgba(122, 129, 124, .8);
            color: color-mix(in srgb, var(--moto-muted, #7a817c) 80%, transparent);
            text-decoration: none;
            -webkit-tap-highlight-color: transparent;
        }
        .mobile-bottom-nav__icon {
            display: grid;
            place-items: center;
            width: 22px;
            height: 22px;
        }
        .mobile-bottom-nav__icon svg {
            width: 22px;
            height: 22px;
            fill: none;
            stroke: currentColor;
            stroke-linecap: round;
            stroke-linejoin: round;
            stroke-width: 1.5;
        }
        .mobile-bottom-nav__label {
            max-width: 100%;
            overflow: hidden;
            font-family: "Geist", Inter, system-ui, sans-serif;
            font-size: 10px;
            font-weight: 500;
            line-height: 12px;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .mobile-bottom-nav__item--center {
            color: var(--moto-primary, #2e9e4f);
        }
        .mobile-bottom-nav__icon--center {
            width: 56px;
            height: 56px;
            margin-top: -32px;
            border: 4px solid var(--moto-bg, #f6f7f5);
            border-radius: 50%;
            color: #fff;
            background: var(--moto-primary, #2e9e4f);
            box-shadow: 0 4px 12px rgba(46, 158, 79, .25);
        }
        .mobile-bottom-nav__icon--center svg {
            width: 24px;
            height: 24px;
            stroke-width: 1.7;
        }
        .mobile-bottom-nav__item--center .mobile-bottom-nav__label {
            font-weight: 500;
        }
        .mobile-bottom-nav__item:not(.mobile-bottom-nav__item--center):active .mobile-bottom-nav__icon,
        .mobile-bottom-nav__item:not(.mobile-bottom-nav__item--center).is-active {
            color: var(--moto-primary, #2e9e4f);
        }
        @media (min-width: 768px) {
            .mobile-bottom-nav {
                width: min(100%, 1180px);
                height: 74px;
                padding-right: 40px;
                padding-left: 40px;
            }
            .mobile-bottom-nav__inner {
                max-width: 720px;
            }
        }
        @media (min-width: 1200px) {
            .mobile-bottom-nav {
                padding-right: 0;
                padding-left: 0;
            }
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
