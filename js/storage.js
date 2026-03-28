const STORAGE_KEYS = {
  orders: 'tl_orders',
  settings: 'tl_settings'
};

const DEFAULT_SETTINGS = {
  electricityRate: 0.25,
  laborRate: 15,
  failedPrintRisk: 10,
  profitMargin: 40,
  ipaPrice: 5,
  ipaPerPrint: 30,
  fepCost: 12,
  fepLifespan: 200,
  resinPrices: {
    'Standard Grey': 35,
    'ABS-Like': 40,
    'Water Washable': 38,
    'Flexible': 55,
    'Castable': 80,
    'Custom': 35
  },
  printerDepreciation: {
    mini8k: { purchasePrice: 250, lifespanYears: 5 },
    athena2: { purchasePrice: 600, lifespanYears: 5 },
    gk3pro: { purchasePrice: 450, lifespanYears: 5 }
  }
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    return Object.assign({}, JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), JSON.parse(raw));
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
