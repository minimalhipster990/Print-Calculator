// Tiny Legions — Production Helper
// Copyright (c) 2026 minimalhipster990. All rights reserved.

const STORAGE_KEYS = {
  orders: 'tl_orders',
  settings: 'tl_settings'
};

function buildDefaultSettings() {
  // Build depreciation defaults for every built-in printer (approximate retail prices)
  const dep = {
    mini8k:          { purchasePrice: 250,  lifespanYears: 5 },
    athena2:         { purchasePrice: 600,  lifespanYears: 5 },
    gk3pro:          { purchasePrice: 450,  lifespanYears: 5 },
    c_mars2pro:      { purchasePrice: 160,  lifespanYears: 5 },
    c_mars3pro:      { purchasePrice: 190,  lifespanYears: 5 },
    c_mars4ultra:    { purchasePrice: 250,  lifespanYears: 5 },
    c_mars5ultra:    { purchasePrice: 280,  lifespanYears: 5 },
    c_saturn3ultra:  { purchasePrice: 380,  lifespanYears: 5 },
    c_saturn4ultra:  { purchasePrice: 480,  lifespanYears: 5 },
    c_jupiterse:     { purchasePrice: 650,  lifespanYears: 5 },
    c_mono4:         { purchasePrice: 170,  lifespanYears: 5 },
    c_mono4ultra:    { purchasePrice: 210,  lifespanYears: 5 },
    c_monox6ks:      { purchasePrice: 340,  lifespanYears: 5 },
    c_m5s:           { purchasePrice: 380,  lifespanYears: 5 },
    c_m7:            { purchasePrice: 470,  lifespanYears: 5 },
    c_m7pro:         { purchasePrice: 650,  lifespanYears: 5 },
    c_sonicmini4k:   { purchasePrice: 160,  lifespanYears: 5 },
    c_sonicxl4k:     { purchasePrice: 340,  lifespanYears: 5 },
    c_sonicmega8k:   { purchasePrice: 780,  lifespanYears: 5 },
    c_halotmagepro:  { purchasePrice: 240,  lifespanYears: 5 },
    c_halotoneplus:  { purchasePrice: 190,  lifespanYears: 5 },
    c_form3:         { purchasePrice: 3200, lifespanYears: 7 },
    c_proxima6:      { purchasePrice: 150,  lifespanYears: 5 }
  };

  return {
    currency: 'EUR',
    electricityRate: 0.25,
    washCureTimeMin: 30,
    laborRate: 15,
    operatingHoursPerDay: 16,
    depreciationHoursPerDay: 16,
    schedulerOperatingHoursPerDay: 16,
    productionStartTime: '08:00',
    queueTurnaroundMin: 30,
    queueSupportPct: 20,
    queueLaborTimeMin: 30,
    queueOtherConsumables: 0.30,
    queuePackingMarginMm: 2,
    failedPrintRisk: 10,
    profitMargin: 40,
    vatRate: 22,
    ipaPrice: 5,
    ipaPerPrint: 30,
    fepCost: 12,
    fepLifespan: 200,
    resins: [
      { name: 'Standard Grey',  price: 35, density: 1.10 },
      { name: 'ABS-Like',       price: 40, density: 1.10 },
      { name: 'Water Washable', price: 38, density: 1.10 },
      { name: 'Flexible',       price: 55, density: 1.20 },
      { name: 'Castable',       price: 80, density: 1.05 },
      { name: 'Custom',         price: 35, density: 1.10 }
    ],
    customPrinters: [],
    printerDepreciation: dep,
    printerFleet: {}
  };
}
const DEFAULT_SETTINGS = buildDefaultSettings();

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function storageNumber(value, fallback = 0) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function storageClamp(value, fallback = 0, min = -Infinity, max = Infinity) {
  return Math.min(Math.max(storageNumber(value, fallback), min), max);
}

function storageText(value, maxLength = 240) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeId(value, prefix, index) {
  const raw = storageText(value, 80);
  return /^[A-Za-z0-9_-]+$/.test(raw) ? raw : `${prefix}_${index + 1}`;
}

function normalizeDate(value) {
  const raw = storageText(value, 20);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  const [year, month, day] = raw.split('-').map(n => parseInt(n, 10));
  const d = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(d.getTime())) return '';
  const valid = d.getUTCFullYear() === year
    && d.getUTCMonth() === month - 1
    && d.getUTCDate() === day;
  return valid ? raw : '';
}

function normalizeTimeOfDay(value, fallback = '08:00') {
  const raw = storageText(value, 5);
  if (!/^\d{2}:\d{2}$/.test(raw)) return fallback;
  const [hour, minute] = raw.split(':').map(n => parseInt(n, 10));
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  return raw;
}

function normalizeOrder(raw, index) {
  if (!isPlainObject(raw)) return null;
  const modelName = storageText(raw.modelName, 160);
  const footprintW = storageClamp(raw.footprintW, 0, 0, 10000);
  const footprintD = storageClamp(raw.footprintD, 0, 0, 10000);
  if (!modelName || footprintW <= 0 || footprintD <= 0) return null;

  const totalPrintMin = (storageClamp(raw.printTimeH, 0, 0, 10000) * 60)
    + storageClamp(raw.printTimeMin, 0, 0, 10000);

  return {
    id: normalizeId(raw.id, 'ord', index),
    orderId: storageText(raw.orderId, 80),
    customer: storageText(raw.customer, 160),
    modelName,
    orderType: raw.orderType === 'plate' ? 'plate' : 'model',
    footprintW,
    footprintD,
    height: storageClamp(raw.height, 0, 0, 10000),
    quantity: Math.max(1, Math.floor(storageClamp(raw.quantity, 1, 1, 10000))),
    printTimeH: Math.floor(totalPrintMin / 60),
    printTimeMin: Math.floor(totalPrintMin % 60),
    resinVolumeMl: storageClamp(raw.resinVolumeMl, 0, 0, 1000000),
    resinType: storageText(raw.resinType || 'Standard Grey', 120) || 'Standard Grey',
    deadline: normalizeDate(raw.deadline),
    notes: storageText(raw.notes, 1000)
  };
}

function normalizeOrders(rawOrders) {
  if (!Array.isArray(rawOrders)) return [];
  const usedIds = new Set();
  return rawOrders
    .map((order, index) => normalizeOrder(order, index))
    .filter(Boolean)
    .map((order, index) => {
      let id = order.id || `ord_${index + 1}`;
      let suffix = index + 1;
      while (usedIds.has(id)) {
        id = `ord_${suffix}`;
        suffix += 1;
      }
      usedIds.add(id);
      return { ...order, id };
    });
}

function normalizeResin(raw, fallback, index) {
  const source = isPlainObject(raw) ? raw : {};
  const fallbackResin = fallback || { name: `Resin ${index + 1}`, price: 35, density: 1.10 };
  const name = storageText(source.name || fallbackResin.name, 120) || fallbackResin.name;
  return {
    name,
    price: storageClamp(source.price, fallbackResin.price, 0, 10000),
    density: storageClamp(source.density, fallbackResin.density, 0.5, 3)
  };
}

function normalizePrinter(raw, index) {
  if (!isPlainObject(raw)) return null;
  const name = storageText(raw.name, 160);
  const plateW = storageClamp(raw.plateW, 0, 1, 10000);
  const plateD = storageClamp(raw.plateD, 0, 1, 10000);
  const plateZ = storageClamp(raw.plateZ, 0, 1, 10000);
  if (!name || plateW <= 0 || plateD <= 0 || plateZ <= 0) return null;
  return {
    id: normalizeId(raw.id, 'custom', index),
    name,
    plateW,
    plateD,
    plateZ,
    wattage: storageClamp(raw.wattage, 0, 1, 10000),
    purchasePrice: storageClamp(raw.purchasePrice, 0, 0, 1000000),
    lifespanYears: storageClamp(raw.lifespanYears, 5, 1, 50)
  };
}

function normalizeSettings(rawSettings) {
  const base = cloneData(DEFAULT_SETTINGS);
  if (!isPlainObject(rawSettings)) return base;
  const stored = cloneData(rawSettings);

  // Migration: old resinPrices {name: number} format -> resins array
  if (stored.resinPrices && !stored.resins) {
    stored.resins = Object.entries(stored.resinPrices).map(([name, price]) => ({
      name,
      price: typeof price === 'object' ? (price.price || 35) : price,
      density: 1.10
    }));
  }

  const builtInPrinters = typeof PRINTERS !== 'undefined' ? PRINTERS : [];
  const builtInIds = new Set(builtInPrinters.map(p => p.id));
  const customPrinters = Array.isArray(stored.customPrinters)
    ? stored.customPrinters
      .map((printer, index) => normalizePrinter(printer, index))
      .filter(p => p && !builtInIds.has(p.id))
    : [];
  const knownPrinterIds = new Set([...builtInIds, ...customPrinters.map(p => p.id)]);

  const resins = Array.isArray(stored.resins)
    ? stored.resins.map((resin, index) => normalizeResin(resin, base.resins[index], index))
    : base.resins;

  const printerDepreciation = cloneData(base.printerDepreciation);
  const storedDep = isPlainObject(stored.printerDepreciation) ? stored.printerDepreciation : {};
  for (const printer of builtInPrinters) {
    const dep = isPlainObject(storedDep[printer.id]) ? storedDep[printer.id] : {};
    printerDepreciation[printer.id] = {
      purchasePrice: storageClamp(dep.purchasePrice, printerDepreciation[printer.id]?.purchasePrice || 0, 0, 1000000),
      lifespanYears: storageClamp(dep.lifespanYears, printerDepreciation[printer.id]?.lifespanYears || 5, 1, 50)
    };
  }

  const printerFleet = {};
  if (isPlainObject(stored.printerFleet)) {
    for (const [id, count] of Object.entries(stored.printerFleet)) {
      if (knownPrinterIds.has(id)) {
        const normalizedCount = Math.floor(storageClamp(count, 0, 0, 100));
        if (normalizedCount > 0) printerFleet[id] = normalizedCount;
      }
    }
  }

  const legacyOperatingHours = storageClamp(stored.operatingHoursPerDay, base.operatingHoursPerDay, 1, 24);
  const depreciationHoursPerDay = storageClamp(stored.depreciationHoursPerDay, legacyOperatingHours, 1, 24);
  const schedulerOperatingHoursPerDay = storageClamp(stored.schedulerOperatingHoursPerDay, legacyOperatingHours, 1, 24);

  return {
    ...base,
    currency: /^[A-Z]{3}$/.test(storageText(stored.currency, 3)) ? storageText(stored.currency, 3) : base.currency,
    electricityRate: storageClamp(stored.electricityRate, base.electricityRate, 0, 100),
    washCureTimeMin: storageClamp(stored.washCureTimeMin, base.washCureTimeMin, 0, 1440),
    laborRate: storageClamp(stored.laborRate, base.laborRate, 0, 10000),
    operatingHoursPerDay: depreciationHoursPerDay,
    depreciationHoursPerDay,
    schedulerOperatingHoursPerDay,
    productionStartTime: normalizeTimeOfDay(stored.productionStartTime, base.productionStartTime),
    queueTurnaroundMin: storageClamp(stored.queueTurnaroundMin, base.queueTurnaroundMin, 0, 1440),
    queueSupportPct: storageClamp(stored.queueSupportPct, base.queueSupportPct, 0, 300),
    queueLaborTimeMin: storageClamp(stored.queueLaborTimeMin, base.queueLaborTimeMin, 0, 1440),
    queueOtherConsumables: storageClamp(stored.queueOtherConsumables, base.queueOtherConsumables, 0, 10000),
    queuePackingMarginMm: storageClamp(stored.queuePackingMarginMm, base.queuePackingMarginMm, 0, 50),
    failedPrintRisk: storageClamp(stored.failedPrintRisk, base.failedPrintRisk, 0, 95),
    profitMargin: storageClamp(stored.profitMargin, base.profitMargin, 0, 99),
    vatRate: storageClamp(stored.vatRate, base.vatRate, 0, 100),
    ipaPrice: storageClamp(stored.ipaPrice, base.ipaPrice, 0, 10000),
    ipaPerPrint: storageClamp(stored.ipaPerPrint, base.ipaPerPrint, 0, 100000),
    fepCost: storageClamp(stored.fepCost, base.fepCost, 0, 10000),
    fepLifespan: storageClamp(stored.fepLifespan, base.fepLifespan, 1, 100000),
    resins: resins.length > 0 ? resins : base.resins,
    customPrinters,
    printerDepreciation,
    printerFleet
  };
}

function normalizeBackupData(data) {
  if (!isPlainObject(data)) return null;
  const hasSettings = Object.prototype.hasOwnProperty.call(data, 'settings');
  const hasOrders = Object.prototype.hasOwnProperty.call(data, 'orders');
  if (!hasSettings && !hasOrders) return null;
  if (hasSettings && !isPlainObject(data.settings)) return null;
  if (hasOrders && !Array.isArray(data.orders)) return null;
  return {
    settings: hasSettings ? normalizeSettings(data.settings) : null,
    orders: hasOrders ? normalizeOrders(data.orders) : null
  };
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    if (!raw) return cloneData(DEFAULT_SETTINGS);
    const stored = JSON.parse(raw);
    return normalizeSettings(stored);
  } catch (e) {
    return cloneData(DEFAULT_SETTINGS);
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(normalizeSettings(settings)));
    return true;
  } catch (e) {
    return false;
  }
}

function loadOrders() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.orders);
    return raw ? normalizeOrders(JSON.parse(raw)) : [];
  } catch (e) {
    return [];
  }
}

function saveOrders(orders) {
  try {
    localStorage.setItem(STORAGE_KEYS.orders, JSON.stringify(normalizeOrders(orders)));
    return true;
  } catch (e) {
    return false;
  }
}

// ── File System API (USB persistence) ────────────────────────────────────────
let _fileHandle = null;

function isFileConnected() { return !!_fileHandle; }
function getFileName() { return _fileHandle?.name || null; }

async function connectNewDataFile() {
  if (!window.showSaveFilePicker) return false;
  const previousHandle = _fileHandle;
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: 'tl-data.json',
      types: [{ description: 'TL Production Data', accept: { 'application/json': ['.json'] } }]
    });
    _fileHandle = handle;
    const saved = await saveToFile();
    if (!saved) {
      _fileHandle = previousHandle;
      return false;
    }
    return true;
  } catch (e) {
    _fileHandle = previousHandle;
    return false;
  }
}

async function openExistingDataFile() {
  if (!window.showOpenFilePicker) return false;
  const previousHandle = _fileHandle;
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'TL Production Data', accept: { 'application/json': ['.json'] } }]
    });
    const file = await handle.getFile();
    const content = await file.text();
    const data = normalizeBackupData(JSON.parse(content));
    if (!data) return false;
    if (data.settings && !saveSettings(data.settings)) return false;
    if (data.orders && !saveOrders(data.orders)) return false;
    _fileHandle = handle;
    return true;
  } catch (e) {
    _fileHandle = previousHandle;
    return false;
  }
}

function buildPersistenceData(dataOverride) {
  const source = dataOverride || {};
  return {
    savedAt: source.savedAt || new Date().toISOString(),
    settings: normalizeSettings(source.settings || loadSettings()),
    orders: normalizeOrders(source.orders || loadOrders())
  };
}

async function saveToFile(dataOverride) {
  if (!_fileHandle) return false;
  try {
    const data = buildPersistenceData(dataOverride);
    const writable = await _fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
    return true;
  } catch (e) { return false; }
}

function exportAllData() {
  const data = {
    exportedAt: new Date().toISOString(),
    settings: loadSettings(),
    orders: loadOrders()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tl-production-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importAllData(jsonStr) {
  try {
    const data = normalizeBackupData(JSON.parse(jsonStr));
    if (!data) return false;
    if (data.settings && !saveSettings(data.settings)) return false;
    if (data.orders && !saveOrders(data.orders)) return false;
    return true;
  } catch (e) {
    return false;
  }
}
