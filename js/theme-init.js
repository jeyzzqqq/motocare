(function initializeTheme() {
    const storageKey = 'motocare.theme';
    const pathname = window.location.pathname.toLowerCase();
    const forceLight = pathname === '/' || pathname.endsWith('/index.html') || pathname.endsWith('index.html');

    function applyTheme(theme) {
        const selectedTheme = theme === 'dark' ? 'dark' : 'light';
        document.documentElement.dataset.theme = selectedTheme;
        const themeColor = document.querySelector('meta[name="theme-color"]');
        if (themeColor) themeColor.content = selectedTheme === 'dark' ? '#101713' : '#F6F7F5';
        return selectedTheme;
    }

    window.applyMotoCareTheme = applyTheme;
    window.resetMotoCareTheme = function resetMotoCareTheme() {
        try {
            localStorage.removeItem(storageKey);
        } catch (error) {
            console.error('Could not clear the saved appearance preference:', error);
        }
        applyTheme('light');
    };

    if (forceLight) {
        window.resetMotoCareTheme();
        return;
    }

    try {
        applyTheme(localStorage.getItem(storageKey));
    } catch (error) {
        console.error('Could not read the saved appearance preference:', error);
        applyTheme('light');
    }
})();
