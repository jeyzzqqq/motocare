// Module-safe shared helpers used by ES module pages.

function formatDate(date) {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    const normalized = date instanceof Date ? date : new Date(date);
    return Number.isNaN(normalized.getTime()) ? '' : normalized.toLocaleDateString('en-US', options);
}

function toDate(value) {
    if (value && typeof value.toDate === 'function') return value.toDate();
    if (value instanceof Date) return value;
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeRecord(raw = {}) {
    const r = Object.assign({}, raw);
    r.id = raw.id || raw._id || r.id;
    r.uid = raw.uid || null;

    const created = raw.createdAt || raw.created_at || raw.created || null;
    const dateRaw = raw.date || raw.dueDate || created || null;
    let dateObj = null;
    dateObj = toDate(dateRaw);
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
