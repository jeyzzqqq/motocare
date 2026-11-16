let addRecordOverlayPromise = null;
let addRecordModulePromise = null;

function getOverlay() {
    return document.getElementById('addRecordBackdrop');
}

function ensureOverlay() {
    let backdrop = getOverlay();
    if (backdrop) return backdrop;

    if (!document.getElementById('add-record-overlay-styles')) {
        const styles = document.createElement('link');
        styles.id = 'add-record-overlay-styles';
        styles.rel = 'stylesheet';
        styles.href = './css/add-record-overlay.css';
        document.head.appendChild(styles);
    }

    document.body.insertAdjacentHTML('beforeend', `
        <div id="addRecordBackdrop" class="add-record-backdrop" hidden>
            <section id="addRecordSheet" class="add-record-sheet" role="dialog" aria-modal="true" aria-labelledby="addRecordTitle"></section>
        </div>
    `);
    backdrop = getOverlay();
    backdrop?.addEventListener('click', (event) => {
        if (event.target === backdrop) window.closeAddRecordSheet();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && backdrop && !backdrop.hidden) window.closeAddRecordSheet();
    });
    return backdrop;
}

async function loadAddRecordContent(queryString = '') {
    if (addRecordOverlayPromise) return addRecordOverlayPromise;

    addRecordOverlayPromise = fetch('./add-record.html', { credentials: 'same-origin' })
        .then((response) => {
            if (!response.ok) throw new Error(`Unable to load Add record screen (${response.status})`);
            return response.text();
        })
        .then((html) => {
            const documentFragment = new DOMParser().parseFromString(html, 'text/html');
            const style = documentFragment.querySelector('style');
            const page = documentFragment.querySelector('.record-page');
            const submitBar = documentFragment.querySelector('.record-submit-bar');
            const sheet = document.getElementById('addRecordSheet');
            if (!page || !submitBar || !sheet) throw new Error('Add record screen markup is incomplete.');

            if (style && !document.getElementById('add-record-page-styles')) {
                const pageStyles = document.createElement('style');
                pageStyles.id = 'add-record-page-styles';
                pageStyles.textContent = style.textContent;
                document.head.appendChild(pageStyles);
            }

            sheet.replaceChildren(page, submitBar);
            const title = sheet.querySelector('#addRecordTitle');
            if (!title) {
                const heading = sheet.querySelector('.record-title');
                if (heading) heading.id = 'addRecordTitle';
            }
            return sheet;
        });

    await addRecordOverlayPromise;
    window.__addRecordQuery = queryString;
    return addRecordOverlayPromise;
}

async function openAddRecordSheet(queryString = '') {
    const backdrop = ensureOverlay();
    const sheet = await loadAddRecordContent(queryString);
    if (!addRecordModulePromise) {
        addRecordModulePromise = import('./addRecord.js');
    }
    await addRecordModulePromise;
    window.__addRecordQuery = queryString;
    if (!backdrop || !sheet) return;

    backdrop.hidden = false;
    requestAnimationFrame(() => backdrop.classList.add('is-open'));
    document.body.classList.add('add-record-open');
    sheet.querySelector('.record-back')?.focus({ preventScroll: true });
}

function closeAddRecordSheet() {
    const backdrop = getOverlay();
    if (!backdrop) return;

    backdrop.classList.remove('is-open');
    document.body.classList.remove('add-record-open');
    window.setTimeout(() => {
        if (!backdrop.classList.contains('is-open')) backdrop.hidden = true;
    }, 320);
}

window.openAddRecordSheet = openAddRecordSheet;
window.closeAddRecordSheet = closeAddRecordSheet;

document.addEventListener('click', (event) => {
    const trigger = event.target.closest('a[href*="add-record.html"]');
    if (!trigger || trigger.closest('#addRecordBackdrop')) return;
    event.preventDefault();
    const url = new URL(trigger.href, window.location.href);
    openAddRecordSheet(url.search);
});

window.addEventListener('addrecord:saved', () => {
    closeAddRecordSheet();
});
