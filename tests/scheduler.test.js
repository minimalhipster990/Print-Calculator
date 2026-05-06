const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadScheduler() {
  const files = ['printers.js', 'optimizer.js', 'scheduler.js'];
  let exportedText = '';
  const context = {
    Blob: class {
      constructor(parts) {
        this.parts = parts;
      }
      async text() {
        return this.parts.join('');
      }
    },
    URL: {
      createObjectURL(blob) {
        exportedText = blob.parts.join('');
        return 'blob:queue';
      },
      revokeObjectURL() {}
    },
    document: {
      createElement() {
        return { click() {} };
      }
    },
    Date,
    getExportedText() {
      return exportedText;
    }
  };
  vm.createContext(context);
  for (const file of files) {
    const code = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
    vm.runInContext(code, context);
  }
  return context;
}

function baseOrder(overrides = {}) {
  return {
    id: 'ord_1',
    orderId: '#1',
    modelName: 'Test model',
    orderType: 'model',
    footprintW: 30,
    footprintD: 30,
    height: 30,
    quantity: 1,
    printTimeH: 1,
    printTimeMin: 0,
    resinVolumeMl: 10,
    resinType: 'Standard Grey',
    deadline: '2026-05-10',
    ...overrides
  };
}

function localIso(year, month, day, hour, minute = 0) {
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();
}

test('generateQueue does not silently use built-in printers when fleet is empty', () => {
  const { generateQueue } = loadScheduler();

  const batches = generateQueue([baseOrder()], { printerFleet: {} });

  assert.equal(batches.length, 1);
  assert.equal(batches[0].printer, null);
  assert.match(batches[0].warning, /fleet/i);
});

test('generateQueue marks full plates oversized when height exceeds fleet printer Z', () => {
  const { generateQueue } = loadScheduler();
  const settings = {
    printerFleet: { short: 1 },
    customPrinters: [
      { id: 'short', name: 'Short Z', plateW: 100, plateD: 100, plateZ: 50, wattage: 10 }
    ]
  };

  const batches = generateQueue([baseOrder({
    orderType: 'plate',
    footprintW: 80,
    footprintD: 80,
    height: 60
  })], settings);

  assert.equal(batches.length, 1);
  assert.equal(batches[0].printer, null);
  assert.match(batches[0].warning, /does not fit/i);
});

test('generateQueue assigns real scheduled start and end times from scheduleStartAt', () => {
  const { generateQueue } = loadScheduler();
  const settings = {
    scheduleStartAt: '2026-05-05T08:00:00.000Z',
    printerFleet: { mini8k: 1 }
  };

  const batches = generateQueue([
    baseOrder({ id: 'ord_1', printTimeH: 1, printTimeMin: 30 }),
    baseOrder({ id: 'ord_2', orderId: '#2', resinType: 'ABS-Like', printTimeH: 2, printTimeMin: 0 })
  ], settings);

  const scheduled = batches.filter(b => b.printer);
  assert.equal(scheduled.length, 2);
  assert.equal(scheduled[0].scheduledStartAt, '2026-05-05T08:00:00.000Z');
  assert.equal(scheduled[0].scheduledEndAt, '2026-05-05T09:30:00.000Z');
  assert.equal(scheduled[1].scheduledStartAt, '2026-05-05T09:30:00.000Z');
  assert.equal(scheduled[1].scheduledEndAt, '2026-05-05T11:30:00.000Z');
});

test('generateQueue delays the next start until the next operating window after turnaround', () => {
  const { generateQueue } = loadScheduler();
  const settings = {
    scheduleStartAt: localIso(2026, 5, 5, 15, 0),
    productionStartTime: '08:00',
    operatingHoursPerDay: 8,
    queueTurnaroundMin: 30,
    printerFleet: { mini8k: 1 }
  };

  const batches = generateQueue([
    baseOrder({ id: 'late_1', printTimeH: 1, printTimeMin: 0 }),
    baseOrder({ id: 'late_2', orderId: '#2', resinType: 'ABS-Like', printTimeH: 1, printTimeMin: 0 })
  ], settings).filter(b => b.printer);

  assert.equal(batches[0].scheduledStartAt, localIso(2026, 5, 5, 15, 0));
  assert.equal(batches[0].scheduledEndAt, localIso(2026, 5, 5, 16, 0));
  assert.equal(batches[0].readyForNextAt, localIso(2026, 5, 6, 8, 0));
  assert.equal(batches[1].scheduledStartAt, localIso(2026, 5, 6, 8, 0));
  assert.equal(batches[1].scheduledEndAt, localIso(2026, 5, 6, 9, 0));
});

test('generateQueue uses scheduler hours instead of amortization hours for operating windows', () => {
  const { generateQueue } = loadScheduler();
  const settings = {
    scheduleStartAt: localIso(2026, 5, 5, 15, 0),
    productionStartTime: '08:00',
    depreciationHoursPerDay: 8,
    operatingHoursPerDay: 8,
    schedulerOperatingHoursPerDay: 12,
    queueTurnaroundMin: 30,
    printerFleet: { mini8k: 1 }
  };

  const batches = generateQueue([
    baseOrder({ id: 'split_1', printTimeH: 1, printTimeMin: 0 }),
    baseOrder({ id: 'split_2', orderId: '#2', resinType: 'ABS-Like', printTimeH: 1, printTimeMin: 0 })
  ], settings).filter(b => b.printer);

  assert.equal(batches[0].scheduledStartAt, localIso(2026, 5, 5, 15, 0));
  assert.equal(batches[0].readyForNextAt, localIso(2026, 5, 5, 16, 30));
  assert.equal(batches[1].scheduledStartAt, localIso(2026, 5, 5, 16, 30));
});

test('generateQueue uses configurable packing margin when creating single-model batches', () => {
  const { generateQueue } = loadScheduler();
  const orders = [baseOrder({
    id: 'tight',
    orderId: '#tight',
    modelName: 'Tight Fit',
    footprintW: 49,
    footprintD: 48,
    quantity: 2,
    printTimeH: 1,
    printTimeMin: 0
  })];
  const baseSettings = {
    scheduleStartAt: '2026-05-05T08:00:00.000Z',
    printerFleet: { tight_plate: 1 },
    customPrinters: [
      { id: 'tight_plate', name: 'Tight Plate', plateW: 100, plateD: 50, plateZ: 80, wattage: 20 }
    ]
  };

  const defaultMarginBatches = generateQueue(orders, { ...baseSettings, queuePackingMarginMm: 2 })
    .filter(b => b.printer);
  const zeroMarginBatches = generateQueue(orders, { ...baseSettings, queuePackingMarginMm: 0 })
    .filter(b => b.printer);

  assert.equal(defaultMarginBatches.length, 2);
  assert.equal(zeroMarginBatches.length, 1);
  assert.equal(zeroMarginBatches[0].items.length, 2);
});

test('exportQueueCSV neutralizes spreadsheet formulas in exported cells', () => {
  const { exportQueueCSV, getExportedText } = loadScheduler();

  exportQueueCSV([{
    batchId: 'B1',
    printer: { name: '=HYPERLINK("https://bad.example")' },
    resinType: '+SUM(1,1)',
    items: [{ label: '=HYPERLINK("https://bad.example","open")' }],
    earliestDeadline: '2026-05-10',
    daysLeft: 5,
    utilization: 0.5,
    urgency: 'ok'
  }]);

  const csv = getExportedText();
  assert.match(csv, /"'=HYPERLINK/);
  assert.match(csv, /"'\+SUM/);
});

test('exportQueueCSV includes run sheet timing, slot, warning and cost columns', () => {
  const { exportQueueCSV, getExportedText } = loadScheduler();

  exportQueueCSV([{
    batchId: 'B7',
    printer: { name: 'Mini 8K' },
    slotIndex: 2,
    printerCount: 3,
    waveIndex: 4,
    resinType: 'ABS-Like',
    items: [{ label: 'Knight' }],
    earliestDeadline: '2026-05-10',
    scheduledStartAt: '2026-05-05T08:00:00.000Z',
    scheduledEndAt: '2026-05-05T10:30:00.000Z',
    minutesLate: 45,
    warning: 'Check support density',
    productionCost: 12.34,
    batchEstimate: 24.68,
    currencySymbol: '€',
    daysLeft: 5,
    utilization: 0.5,
    urgency: 'warning'
  }]);

  const csv = getExportedText();
  assert.match(csv.split('\n')[0], /Scheduled Start/);
  assert.match(csv.split('\n')[0], /Scheduled End/);
  assert.match(csv.split('\n')[0], /Slot/);
  assert.match(csv.split('\n')[0], /Wave/);
  assert.match(csv.split('\n')[0], /Late Minutes/);
  assert.match(csv.split('\n')[0], /Warning/);
  assert.match(csv.split('\n')[0], /Production Cost/);
  assert.match(csv, /"2026-05-05T08:00:00.000Z"/);
  assert.match(csv, /"2 of 3"/);
  assert.match(csv, /"4"/);
  assert.match(csv, /"45"/);
  assert.match(csv, /"Check support density"/);
  assert.match(csv, /"€12.34"/);
  assert.match(csv, /"€24.68"/);
});

test('generateQueue uses mixed printer fleet slots instead of leaving capable printers idle', () => {
  const { generateQueue } = loadScheduler();
  const settings = {
    scheduleStartAt: '2026-05-05T08:00:00.000Z',
    printerFleet: { mini8k: 1, gk3pro: 1 }
  };
  const orders = Array.from({ length: 5 }, (_, i) => baseOrder({
    id: `plate_${i}`,
    orderId: `P${i}`,
    modelName: `Plate ${i}`,
    orderType: 'plate',
    footprintW: 120,
    footprintD: 70,
    height: 80,
    printTimeH: 4,
    printTimeMin: 0,
    deadline: '2026-05-05'
  }));

  const batches = generateQueue(orders, settings);
  const usedPrinters = new Set(batches.filter(b => b.printer).map(b => b.printer.id));

  assert.equal(usedPrinters.has('mini8k'), true);
  assert.equal(usedPrinters.has('gk3pro'), true);
  assert.equal(batches.filter(b => (b.minutesLate || 0) > 0).length, 0);
});

test('generateQueue keeps incomplete physical data out of the active schedule', () => {
  const { generateQueue } = loadScheduler();
  const settings = {
    scheduleStartAt: '2026-05-05T08:00:00.000Z',
    printerFleet: { mini8k: 1 }
  };
  const batches = generateQueue([
    baseOrder({ id: 'missing_height', height: 0, printTimeH: 2 }),
    baseOrder({ id: 'missing_time', height: 30, printTimeH: 0, printTimeMin: 0 })
  ], settings);

  assert.equal(batches.length, 2);
  assert.equal(batches.every(b => b.printer === null), true);
  assert.equal(batches.every(b => /height|print time/i.test(b.warning)), true);
  assert.equal(batches.every(b => b.earliestDeadline === '2026-05-10'), true);
});

test('generateQueue uses multiple printer types for single-model batches when both are useful', () => {
  const { generateQueue } = loadScheduler();
  const settings = {
    scheduleStartAt: '2026-05-05T08:00:00.000Z',
    printerFleet: { mini8k: 1, gk3pro: 1 }
  };
  const orders = Array.from({ length: 30 }, (_, i) => baseOrder({
    id: `model_${i}`,
    orderId: `M${i}`,
    modelName: `Model ${i}`,
    footprintW: 35,
    footprintD: 35,
    height: 45,
    quantity: 1,
    printTimeH: 4,
    deadline: '2026-05-05'
  }));

  const batches = generateQueue(orders, settings);
  const usedPrinters = new Set(batches.filter(b => b.printer).map(b => b.printer.id));

  assert.equal(usedPrinters.has('mini8k'), true);
  assert.equal(usedPrinters.has('gk3pro'), true);
});
