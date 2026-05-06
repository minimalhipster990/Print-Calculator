const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function makeLocalStorage(options = {}) {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      if (options.throwOnSet) throw new Error('QuotaExceededError');
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    }
  };
}

function loadStorage(overrides = {}) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'storage.js'), 'utf8');
  const context = {
    PRINTERS: [],
    localStorage: makeLocalStorage(),
    window: {},
    ...overrides
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  return context;
}

test('default settings include separate amortization/scheduler hours and queue assumptions', () => {
  const { buildDefaultSettings } = loadStorage();
  const settings = buildDefaultSettings();

  assert.equal(settings.operatingHoursPerDay, 16);
  assert.equal(settings.depreciationHoursPerDay, 16);
  assert.equal(settings.schedulerOperatingHoursPerDay, 16);
  assert.equal(settings.vatRate, 22);
  assert.equal(settings.productionStartTime, '08:00');
  assert.equal(settings.queueTurnaroundMin, 30);
  assert.equal(settings.queueSupportPct, 20);
  assert.equal(settings.queueLaborTimeMin, 30);
  assert.equal(settings.queueOtherConsumables, 0.30);
  assert.equal(settings.queuePackingMarginMm, 2);
});

test('importAllData normalizes unsafe ids, dates, queue assumptions and economic ranges', () => {
  const { importAllData, loadOrders, loadSettings } = loadStorage();

  const ok = importAllData(JSON.stringify({
    settings: {
      depreciationHoursPerDay: 0,
      schedulerOperatingHoursPerDay: 30,
      profitMargin: 250,
      vatRate: -22,
      productionStartTime: '29:99',
      queueTurnaroundMin: -10,
      queueSupportPct: 400,
      queueLaborTimeMin: -5,
      queueOtherConsumables: -0.5,
      queuePackingMarginMm: -1,
      fepLifespan: 0,
      resins: [{ name: '<script>', price: -5, density: 99 }]
    },
    orders: [{
      id: "bad' onclick='alert(1)",
      orderId: '#008',
      customer: '<b>Customer</b>',
      modelName: '<img src=x onerror=alert(1)>',
      orderType: 'model',
      footprintW: '25',
      footprintD: '30',
      height: '40',
      quantity: '2',
      printTimeH: '1',
      printTimeMin: '90',
      resinVolumeMl: '12.5',
      resinType: '<script>',
      deadline: 'not-a-date',
      notes: '<svg onload=alert(1)>'
    }]
  }));

  assert.equal(ok, true);

  const [order] = loadOrders();
  assert.match(order.id, /^ord_/);
  assert.equal(order.printTimeH, 2);
  assert.equal(order.printTimeMin, 30);
  assert.equal(order.deadline, '');

  const settings = loadSettings();
  assert.equal(settings.depreciationHoursPerDay, 1);
  assert.equal(settings.schedulerOperatingHoursPerDay, 24);
  assert.equal(settings.profitMargin, 99);
  assert.equal(settings.vatRate, 0);
  assert.equal(settings.productionStartTime, '08:00');
  assert.equal(settings.queueTurnaroundMin, 0);
  assert.equal(settings.queueSupportPct, 300);
  assert.equal(settings.queueLaborTimeMin, 0);
  assert.equal(settings.queueOtherConsumables, 0);
  assert.equal(settings.queuePackingMarginMm, 0);
  assert.equal(settings.fepLifespan, 1);
  assert.equal(settings.resins[0].price, 0);
  assert.equal(settings.resins[0].density, 3);
});

test('legacy operatingHoursPerDay migrates into both amortization and scheduler hours', () => {
  const { importAllData, loadSettings } = loadStorage();

  importAllData(JSON.stringify({
    settings: {
      operatingHoursPerDay: 9
    }
  }));

  const settings = loadSettings();
  assert.equal(settings.depreciationHoursPerDay, 9);
  assert.equal(settings.schedulerOperatingHoursPerDay, 9);
});

test('importAllData rejects JSON that contains neither settings nor orders', () => {
  const { importAllData } = loadStorage();

  assert.equal(importAllData(JSON.stringify({ message: 'not a backup' })), false);
});

test('failed openExistingDataFile does not leave a connected file handle', async () => {
  const storage = loadStorage();
  storage.window.showOpenFilePicker = async () => [{
    name: 'bad.json',
    getFile: async () => ({ text: async () => '{not json' }),
    createWritable: async () => ({ write: async () => {}, close: async () => {} })
  }];

  assert.equal(await storage.openExistingDataFile(), false);
  assert.equal(storage.isFileConnected(), false);
});

test('connectNewDataFile reports false when the initial write fails', async () => {
  const storage = loadStorage();
  storage.window.showSaveFilePicker = async () => ({
    name: 'new.json',
    createWritable: async () => { throw new Error('write failed'); }
  });

  assert.equal(await storage.connectNewDataFile(), false);
  assert.equal(storage.isFileConnected(), false);
});

test('saveSettings and saveOrders return false instead of throwing on localStorage failure', () => {
  const storage = loadStorage({ localStorage: makeLocalStorage({ throwOnSet: true }) });

  assert.equal(storage.saveSettings(storage.buildDefaultSettings()), false);
  assert.equal(storage.saveOrders([{ id: 'ord_1', modelName: 'A', footprintW: 10, footprintD: 10 }]), false);
});

test('normalizeOrders repairs duplicate ids without creating a new collision', () => {
  const { importAllData, loadOrders } = loadStorage();

  importAllData(JSON.stringify({ orders: [
    { id: 'ord_2', modelName: 'A', footprintW: 10, footprintD: 10 },
    { id: "bad'", modelName: 'B', footprintW: 10, footprintD: 10 }
  ] }));

  const ids = loadOrders().map(o => o.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('normalizeDate rejects impossible calendar dates', () => {
  const { importAllData, loadOrders } = loadStorage();

  importAllData(JSON.stringify({ orders: [
    { id: 'ord_date', modelName: 'Date test', footprintW: 10, footprintD: 10, deadline: '2026-02-31' }
  ] }));

  assert.equal(loadOrders()[0].deadline, '');
});
