export const motorcycleCatalog = {
    Yamaha: [
        'NMAX V1',
        'NMAX V2 (Standard / ABS)',
        'NMAX Turbo (2024+)',
        'Aerox V1',
        'Aerox V2',
        'Aerox ABS / S Version',
        'Mio Sporty (Mio 1st gen)',
        'Mio Soul i125 (Soul i / Soul GT)',
        'Mio i125 (Mio i / Mio i125 S)',
        'Mio Gravis',
        'Fazzio (Hybrid)',
        'Sniper 155 (Sniper 155 / Sniper 155 R)',
        'Sight',
        'XSR 155'
    ],
    Honda: [
        'Click 125i V1',
        'Click 125i V2',
        'Click 125i V3',
        'Click 160 (Standard / CBS / ABS)',
        'Beat V1',
        'Beat V2',
        'Beat Street',
        'PCX 160 (CBS / ABS)',
        'ADV 160 (ABS)',
        'Airblade 150',
        'Airblade 160',
        'Winner X (Standard / ABS / ABS Racing)',
        'RS125',
        'TMX 125 Alpha',
        'TMX Supremo',
        'CBR150R',
        'CB150X',
        'Giorno+'
    ],
    Suzuki: [
        'Raider R150 Carb',
        'Raider R150 Fi',
        'Raider R150 Fi ABS',
        'Skydrive 125',
        'Burgman Street 125',
        'Smash 115',
        'Shooter 115',
        'Gixxer 150',
        'GSX-S150',
        'GSX-R150'
    ],
    'Kawasaki / Bajaj': [
        'CT100',
        'Barako II',
        'Fury 125',
        'Rouser NS125',
        'Rouser NS160',
        'Rouser NS200',
        'Rouser RS200',
        'Dominar 400',
        'Ninja 400',
        'Ninja 650',
        'ZX-25R',
        'ZX-4RR'
    ]
};

const normalizeText = (value) => String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function getOfficialBrands() {
    return Object.keys(motorcycleCatalog);
}

export function getModelsForBrand(brand) {
    return motorcycleCatalog[brand] || [];
}

export function findBrandMatch(inputBrand) {
    const normalized = normalizeText(inputBrand);
    if (!normalized) return '';

    return getOfficialBrands().find((brand) => normalizeText(brand) === normalized) || '';
}

export function findModelMatch(brand, inputModel) {
    const normalized = normalizeText(inputModel);
    if (!normalized) return '';

    const models = getModelsForBrand(brand);
    const exactMatch = models.find((model) => normalizeText(model) === normalized);
    if (exactMatch) return exactMatch;

    return models.find((model) => {
        const canonical = normalizeText(model);
        return canonical.includes(normalized) || normalized.includes(canonical);
    }) || '';
}

export function isOfficialMotorcycleSelection(brand, model) {
    const officialBrand = findBrandMatch(brand);
    return Boolean(officialBrand && findModelMatch(officialBrand, model));
}
