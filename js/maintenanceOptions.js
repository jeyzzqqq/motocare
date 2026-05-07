const SCOOTER_PATTERNS = ['nmax', 'aerox', 'mio', 'fazzio', 'sight', 'click', 'beat', 'pcx', 'adv', 'airblade', 'giorno', 'burgman', 'skydrive'];
const UNDERBONE_PATTERNS = ['winner x', 'rs125', 'tmx', 'sniper', 'raider', 'smash', 'gixxer', 'gsx', 'fury', 'barako', 'shooter', 'ct100', 'rouser'];
const SPORT_PATTERNS = ['r15', 'mt ', 'mt-', 'cbr150r', 'cb150x', 'ninja 400', 'ninja 650', 'zx-25r', 'zx-4rr', 'dominar', 'xsr 155'];

export const MAINTENANCE_RULES = {
    scooter: [
        { key: 'oil-1000', interval: 1000, task: 'Oil Change', icon: 'droplets' },
        { key: 'basic-3000', interval: 3000, task: 'Basic Service', icon: 'wrench' },
        { key: 'cvt-5000', interval: 5000, task: 'CVT + Air Filter + Spark Plug', icon: 'settings-2' },
        { key: 'brake-8000', interval: 8000, task: 'Brake + Belt Inspection', icon: 'shield-check' },
        { key: 'major-10000', interval: 10000, task: 'Major Service', icon: 'alert-triangle' },
        { key: 'injector-15000', interval: 15000, task: 'Injector + Throttle Body Cleaning', icon: 'sparkles' },
        { key: 'inspection-20000', interval: 20000, task: 'Full Inspection', icon: 'clipboard-check' }
    ],
    underbone: [
        { key: 'oil-chain-1000', interval: 1000, task: 'Oil Change + Chain Check', icon: 'droplets' },
        { key: 'chain-lube-3000', interval: 3000, task: 'Chain Cleaning + Lube', icon: 'link' },
        { key: 'air-spark-5000', interval: 5000, task: 'Air Filter + Spark Plug', icon: 'sparkles' },
        { key: 'brake-sprocket-8000', interval: 8000, task: 'Brake + Sprocket Check', icon: 'shield-check' },
        { key: 'valve-10000', interval: 10000, task: 'Valve Clearance Check', icon: 'settings-2' },
        { key: 'tuneup-15000', interval: 15000, task: 'Full Tune-up', icon: 'wrench' }
    ],
    sport: [
        { key: 'oil-1000', interval: 1000, task: 'Oil Change (Break-in Critical)', icon: 'droplets' },
        { key: 'oil-chain-brake-3000', interval: 3000, task: 'Oil + Chain + Brake Check', icon: 'shield-check' },
        { key: 'air-spark-5000', interval: 5000, task: 'Air Filter + Spark Plug', icon: 'sparkles' },
        { key: 'brakefluid-chain-8000', interval: 8000, task: 'Brake Fluid + Chain Service', icon: 'droplets' },
        { key: 'coolant-valve-10000', interval: 10000, task: 'Coolant + Valve Clearance', icon: 'thermometer' },
        { key: 'injector-15000', interval: 15000, task: 'Injector + Throttle Body Cleaning', icon: 'sparkles' },
        { key: 'overhaul-20000', interval: 20000, task: 'Full System Overhaul Check', icon: 'alert-circle' }
    ]
};

const CATEGORY_META = {
    scooter: {
        label: 'SCOOTER (CVT)',
        badge: 'bg-green-100 text-green-700',
        chip: 'bg-green-700 text-white'
    },
    underbone: {
        label: 'UNDERBONE / MANUAL (CHAIN TYPE)',
        badge: 'bg-blue-100 text-blue-700',
        chip: 'bg-blue-700 text-white'
    },
    sport: {
        label: 'BIG CC / SPORT',
        badge: 'bg-red-100 text-red-700',
        chip: 'bg-red-700 text-white'
    }
};

const UPGRADE_OPTIONS = [
    { key: 'tires', label: 'Tires / Tire Replacement' },
    { key: 'brake-pads', label: 'Brake Pads' },
    { key: 'battery', label: 'Battery' },
    { key: 'chain-sprocket', label: 'Chain & Sprocket' },
    { key: 'oil-filter', label: 'Oil Filter' },
    { key: 'air-filter', label: 'Air Filter' },
    { key: 'spark-plug', label: 'Spark Plug' },
    { key: 'accessories', label: 'Accessories / Add-ons' },
    { key: 'other', label: 'Other Upgrade / Accessory' }
];

function normalizeText(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function includesAny(text, patterns) {
    return patterns.some((pattern) => text.includes(normalizeText(pattern)));
}

function getNextMileageDelta(currentMileage, interval) {
    const mileage = Number(currentMileage || 0);
    const step = Number(interval || 0);

    if (!step || step <= 0) return Number.MAX_SAFE_INTEGER;
    if (!mileage || mileage < 0) return step;

    const remainder = mileage % step;
    return remainder === 0 ? 0 : step - remainder;
}

function formatRelativeMileageText(currentMileage, interval) {
    const delta = getNextMileageDelta(currentMileage, interval);

    if (delta === 0) {
        return 'due now';
    }

    return `next in ${delta.toLocaleString()} km`;
}

export function classifyMotorcycleCategory(motorcycle = {}) {
    const text = normalizeText([motorcycle.brand, motorcycle.model, motorcycle.motorcycleName].filter(Boolean).join(' '));

    if (includesAny(text, SPORT_PATTERNS)) {
        return { key: 'sport', ...CATEGORY_META.sport };
    }

    if (includesAny(text, SCOOTER_PATTERNS)) {
        return { key: 'scooter', ...CATEGORY_META.scooter };
    }

    return { key: 'underbone', ...CATEGORY_META.underbone };
}

export function getMaintenanceOptionsForMotorcycle(motorcycle = {}, currentMileage = 0) {
    const category = classifyMotorcycleCategory(motorcycle);
    const rules = MAINTENANCE_RULES[category.key] || MAINTENANCE_RULES.underbone;

    return rules
        .map((rule) => {
            const delta = getNextMileageDelta(currentMileage, rule.interval);

            return {
                value: `scheduled:${rule.key}`,
                label: `${rule.task} • every ${rule.interval.toLocaleString()} km • ${formatRelativeMileageText(currentMileage, rule.interval)}`,
                taskKey: rule.key,
                title: rule.task,
                kind: 'scheduled',
                categoryKey: category.key,
                sortDelta: delta,
                sortInterval: rule.interval
            };
        })
        .sort((a, b) => a.sortDelta - b.sortDelta || a.sortInterval - b.sortInterval || a.title.localeCompare(b.title));
}

export function getUpgradeOptions() {
    return UPGRADE_OPTIONS.map((option) => ({
        value: `upgrade:${option.key}`,
        label: option.label,
        title: option.label,
        kind: 'upgrade',
        taskKey: option.key
    }));
}

export function getServiceTitleGroups(motorcycle = {}, currentMileage = 0) {
    return [
        {
            label: 'Scheduled Maintenance',
            options: getMaintenanceOptionsForMotorcycle(motorcycle, currentMileage)
        },
        {
            label: 'Upgrades / Accessories',
            options: getUpgradeOptions()
        },
        {
            label: 'Other',
            options: [
                {
                    value: 'other:custom',
                    label: 'Other Service / Repair',
                    title: 'Other Service / Repair',
                    kind: 'other',
                    taskKey: 'other'
                }
            ]
        }
    ];
}

export function getTitleSelectionMeta(value = '') {
    const [kind = '', rawKey = ''] = String(value).split(':');
    return { kind, key: rawKey };
}
