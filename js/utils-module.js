// Module-safe shared helpers used by ES module pages.

function formatDate(date) {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(date).toLocaleDateString('en-US', options);
}

export function normalizeRecord(raw = {}) {
    const r = Object.assign({}, raw);
    r.id = raw.id || raw._id || r.id;
    r.uid = raw.uid || null;

    const created = raw.createdAt || raw.created_at || raw.created || null;
    const dateRaw = raw.date || raw.dueDate || created || null;
    let dateObj = null;
    if (dateRaw && typeof dateRaw.toDate === 'function') {
        dateObj = dateRaw.toDate();
    } else if (dateRaw) {
        dateObj = new Date(dateRaw);
    }
    r.rawDate = dateObj;
    r.dateString = r.rawDate ? formatDate(r.rawDate) : '';

    const costVal = raw.cost !== undefined ? raw.cost : (raw.amount !== undefined ? raw.amount : 0);
    r.cost = Number(costVal || 0);
    r.amount = r.cost;

    r.title = raw.title || raw.task || raw.name || '';
    r.item = r.title || r.task || 'Record';
    r.category = raw.category || 'Other';
    r.motorcycleName = raw.motorcycleName || (raw.brand && raw.model ? `${raw.brand} ${raw.model}` : raw.motorcycle || '');

    return r;
}
