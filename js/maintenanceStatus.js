function normalizeText(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function dateValue(value) {
    if (value && typeof value.toDate === 'function') return value.toDate();
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function getMileageValue(motorcycle) {
    const raw = motorcycle.mileage ?? motorcycle.odo ?? motorcycle.currentOdo ?? motorcycle.odometer ?? 0;
    const numeric = Number(raw);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

export function getReminderThreshold(motorcycleId) {
    const parseThreshold = (value) => {
        if (value === null || value === undefined || value === '') return null;
        const numeric = Number(value);
        return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
    };

    try {
        if (motorcycleId) {
            const perValue = localStorage.getItem(`motocare.reminderThreshold.${motorcycleId}`);
            const perMotorcycleThreshold = parseThreshold(perValue);
            if (perMotorcycleThreshold !== null) return perMotorcycleThreshold;
        }
        const globalValue = localStorage.getItem('motocare.reminderThreshold.default');
        const globalThreshold = parseThreshold(globalValue);
        if (globalThreshold !== null) return globalThreshold;
    } catch (error) {}
    return 500;
}

export function getNextMileageAfterCompletion(completedMileage, interval) {
    const mileage = Number(completedMileage || 0);
    const step = Number(interval || 0);
    if (!step || step <= 0) return Number.MAX_SAFE_INTEGER;
    if (!Number.isFinite(mileage) || mileage < 0) return step;
    return mileage + step;
}

export function getCompletionMileage(item = {}) {
    const value = item.completedMileage ?? item.mileage ?? item.dueMileage ?? 0;
    const normalized = typeof value === 'string' ? value.replace(/[^0-9.-]/g, '') : value;
    const numeric = Number(normalized);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

export function getCompletionTimestamp(item = {}) {
    const raw = item.completedAt ?? item.date ?? item.createdAt ?? item.updatedAt ?? null;
    const date = dateValue(raw);
    return date ? date.getTime() : 0;
}

export function isCompletionRecord(item = {}) {
    const status = String(item.status || '').toLowerCase().trim();
    const hasCompletionStatus = ['completed', 'complete', 'done', 'logged'].includes(status);
    return item.deleted !== true
        && (hasCompletionStatus || getCompletionMileage(item) > 0 || getCompletionTimestamp(item) > 0);
}

export function findCompletedMaintenanceRecord(records, motorcycleId, rule) {
    const ruleName = normalizeText(rule.task);
    const matches = records.filter((item) => {
        if (String(item.motorcycleId || '') !== String(motorcycleId)) return false;
        const itemTaskKey = String(item.taskKey || '').trim();
        if (itemTaskKey) return itemTaskKey === rule.key && isCompletionRecord(item);
        const itemName = normalizeText(item.task || item.title || item.name || '');
        const matchesTaskName = itemName
            && (itemName === ruleName || itemName.includes(ruleName) || ruleName.includes(itemName));
        return matchesTaskName && isCompletionRecord(item);
    });
    return matches.sort((left, right) => {
        const timeDiff = getCompletionTimestamp(right) - getCompletionTimestamp(left);
        if (timeDiff !== 0) return timeDiff;
        const mileageDiff = getCompletionMileage(right) - getCompletionMileage(left);
        if (mileageDiff !== 0) return mileageDiff;
        return String(right.id || '').localeCompare(String(left.id || ''));
    })[0] || null;
}

export function getMaintenanceTaskStatus(motorcycle, rule, records = [], now = new Date()) {
    const odo = getMileageValue(motorcycle);
    const completedRecord = findCompletedMaintenanceRecord(records, motorcycle.id, rule);
    const interval = Number(rule.interval);
    if (!Number.isFinite(interval) || interval <= 0) {
        throw new Error(`Invalid maintenance interval for task "${rule.task}".`);
    }

    let dueMileage;
    if (completedRecord) {
        dueMileage = getNextMileageAfterCompletion(getCompletionMileage(completedRecord), interval);
    } else {
        const trackedFromOdoValue = motorcycle.trackedFromOdo;
        const trackedFromOdo = Number(trackedFromOdoValue);
        if (trackedFromOdoValue === null
            || trackedFromOdoValue === undefined
            || trackedFromOdoValue === ''
            || !Number.isFinite(trackedFromOdo)
            || trackedFromOdo < 0) {
            throw new Error(`Motorcycle "${motorcycle.id}" is missing a persisted trackedFromOdo value.`);
        }
        dueMileage = trackedFromOdo + interval;
    }
    const threshold = getReminderThreshold(motorcycle.id);

    let status;
    if (odo >= dueMileage) {
        status = { key: 'overdue', label: 'Due / overdue', className: 'bg-red-100 text-red-700', dotClass: 'bg-red-500' };
    } else if ((dueMileage - odo) <= (Number.isFinite(threshold) ? threshold : 500)) {
        status = { key: 'upcoming', label: 'Coming up', className: 'bg-amber-100 text-amber-700', dotClass: 'bg-amber-500' };
    } else {
        status = { key: 'scheduled', label: 'Scheduled', className: 'bg-gray-100 text-gray-600', dotClass: 'bg-gray-400' };
    }

    const dueDate = completedRecord
        ? dateValue(completedRecord.nextDueDate || completedRecord.dueDate)
        : null;

    return { completedRecord, hasCompletion: !!completedRecord, dueMileage, dueDate, status };
}
