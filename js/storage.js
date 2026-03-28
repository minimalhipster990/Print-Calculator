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
    laborRate: 15,
    failedPrintRisk: 10,
    profitMargin: 40,
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

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    const base = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    if (!raw) return base;
    const stored = JSON.parse(raw);
    // Migration: old resinPrices {name: number} format -> resins array
    if (stored.resinPrices && !stored.resins) {
      stored.resins = Object.entries(stored.resinPrices).map(([name, price]) => ({
        name,
        price: typeof price === 'object' ? (price.price || 35) : price,
        density: 1.10
      }));
    }
    // Migration: remove any custom printers that are now built-in
    if (stored.customPrinters) {
      const builtInIds = new Set(PRINTERS.map(p => p.id));
      stored.customPrinters = stored.customPrinters.filter(p => !builtInIds.has(p.id));
    }
    // Ensure all built-in printers have a depreciation entry
    if (!stored.printerDepreciation) stored.printerDepreciation = {};
    PRINTERS.forEach(p => {
      if (!stored.printerDepreciation[p.id]) {
        stored.printerDepreciation[p.id] = base.printerDepreciation[p.id] || { purchasePrice: 0, lifespanYears: 5 };
      }
    });
    return Object.assign(base, stored);
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }
}

function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
}

function loadOrders() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.orders);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveOrders(orders) {
  localStorage.setItem(STORAGE_KEYS.orders, JSON.stringify(orders));
}

// ── File System API (USB persistence) ────────────────────────────────────────
let _fileHandle = null;

function isFileConnected() { return !!_fileHandle; }
function getFileName() { return _fileHandle?.name || null; }

async function connectNewDataFile() {
  if (!window.showSaveFilePicker) return false;
  try {
    _fileHandle = await window.showSaveFilePicker({
      suggestedName: 'tl-data.json',
      types: [{ description: 'TL Production Data', accept: { 'application/json': ['.json'] } }]
    });
    await saveToFile();
    return true;
  } catch (e) { return false; }
}

async function openExistingDataFile() {
  if (!window.showOpenFilePicker) return false;
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'TL Production Data', accept: { 'application/json': ['.json'] } }]
    });
    _fileHandle = handle;
    const file = await handle.getFile();
    const content = await file.text();
    const data = JSON.parse(content);
    if (data.settings) saveSettings(data.settings);
    if (data.orders) saveOrders(data.orders);
    return true;
  } catch (e) { return false; }
}

async function saveToFile() {
  if (!_fileHandle) return false;
  try {
    const data = { savedAt: new Date().toISOString(), settings: loadSettings(), orders: loadOrders() };
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
    const data = JSON.parse(jsonStr);
    if (data.settings) saveSettings(data.settings);
    if (data.orders) saveOrders(data.orders);
    return true;
  } catch (e) {
    return false;
  }
}
