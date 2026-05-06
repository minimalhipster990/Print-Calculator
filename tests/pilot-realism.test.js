const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadRuntime() {
  const files = ['printers.js', 'calculator.js', 'storage.js', 'optimizer.js', 'scheduler.js'];
  const context = {};
  vm.createContext(context);
  for (const file of files) {
    const code = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
    vm.runInContext(code, context);
  }
  return context;
}

function pilotSettings(context) {
  return {
    scheduleStartAt: '2026-05-05T08:00:00.000Z',
    currency: 'EUR',
    electricityRate: 0.25,
    laborRate: 15,
    operatingHoursPerDay: 16,
    failedPrintRisk: 12,
    profitMargin: 40,
    vatRate: 22,
    ipaPrice: 5,
    ipaPerPrint: 30,
    fepCost: 12,
    fepLifespan: 200,
    queueSupportPct: 20,
    queueLaborTimeMin: 30,
    queueOtherConsumables: 0.30,
    resins: [
      { name: 'Standard Grey', price: 35, density: 1.10 },
      { name: 'ABS-Like', price: 40, density: 1.10 },
      { name: 'Water Washable', price: 38, density: 1.10 },
      { name: 'Flexible', price: 55, density: 1.20 }
    ],
    printerFleet: { mini8k: 1, gk3pro: 1, athena2: 1 },
    printerDepreciation: context.buildDefaultSettings().printerDepreciation,
    customPrinters: []
  };
}

function pilotOrders() {
  const specs = [
    ['P001', 'Arianna', 'Infantry 28mm squad', 'model', 28, 24, 38, 10, 1, 40, 4.8, 'Standard Grey', '2026-05-07'],
    ['P002', 'Marco', 'Hero commander', 'model', 35, 30, 52, 2, 2, 10, 8.5, 'ABS-Like', '2026-05-08'],
    ['P003', 'Studio N', 'Terrain bits', 'model', 55, 45, 32, 6, 2, 35, 16.0, 'Standard Grey', '2026-05-09'],
    ['P004', 'Luca', 'Vehicle turret set', 'model', 72, 58, 45, 3, 3, 20, 21.0, 'ABS-Like', '2026-05-10'],
    ['P005', 'Elena', 'Bust 1/10', 'model', 86, 70, 118, 1, 6, 15, 55.0, 'Standard Grey', '2026-05-12'],
    ['P006', 'Davide', 'Base toppers', 'model', 32, 32, 8, 18, 1, 25, 3.2, 'Water Washable', '2026-05-11'],
    ['P007', 'Marta', 'Cavalry riders', 'model', 42, 36, 55, 5, 2, 50, 9.3, 'ABS-Like', '2026-05-07'],
    ['P008', 'Andrea', 'Large dragon wing L', 'model', 118, 64, 30, 1, 4, 20, 24.0, 'Standard Grey', '2026-05-13'],
    ['P009', 'Andrea', 'Large dragon wing R', 'model', 118, 64, 30, 1, 4, 20, 24.0, 'Standard Grey', '2026-05-13'],
    ['P010', 'Shop', 'Plate: infantry mixed A', 'plate', 160, 70, 110, 2, 3, 55, 58.0, 'Standard Grey', '2026-05-08'],
    ['P011', 'Shop', 'Plate: monsters ABS', 'plate', 205, 118, 180, 1, 6, 30, 94.0, 'ABS-Like', '2026-05-09'],
    ['P012', 'Sara', 'Dice tower parts', 'model', 95, 62, 170, 2, 5, 45, 42.0, 'ABS-Like', '2026-05-14'],
    ['P013', 'Club', 'Objective markers', 'model', 26, 22, 18, 24, 1, 10, 2.1, 'Standard Grey', '2026-05-10'],
    ['P014', 'Nico', 'Mech legs', 'model', 80, 52, 85, 2, 4, 35, 31.5, 'ABS-Like', '2026-05-11'],
    ['P015', 'Nico', 'Mech torso', 'model', 92, 80, 105, 1, 5, 10, 49.0, 'ABS-Like', '2026-05-11'],
    ['P016', 'Laura', 'Flexible tentacles', 'model', 44, 28, 95, 8, 3, 15, 7.5, 'Flexible', '2026-05-15'],
    ['P017', 'Michele', 'Mini bust trio', 'model', 58, 48, 75, 3, 4, 10, 22.0, 'Standard Grey', '2026-05-12'],
    ['P018', 'Shop', 'Plate: bases water washable', 'plate', 150, 90, 35, 1, 2, 20, 41.0, 'Water Washable', '2026-05-06'],
    ['P019', 'Giorgio', 'Scenic wall sections', 'model', 112, 46, 70, 4, 4, 5, 38.0, 'Standard Grey', '2026-05-13'],
    ['P020', 'Vale', 'Tiny familiars', 'model', 18, 18, 24, 30, 1, 0, 1.1, 'Standard Grey', '2026-05-16'],
    ['P021', 'Fede', 'Oversize statue', 'model', 180, 140, 260, 1, 8, 0, 120.0, 'Standard Grey', '2026-05-20'],
    ['P022', 'Shop', 'Plate: too wide terrain', 'plate', 240, 145, 90, 1, 5, 30, 110.0, 'Standard Grey', '2026-05-18'],
    ['P023', 'Irene', 'Character pack', 'model', 36, 32, 50, 7, 2, 15, 6.7, 'ABS-Like', '2026-05-07'],
    ['P024', 'RPG Club', 'Scatter crates', 'model', 48, 38, 24, 12, 1, 55, 5.5, 'Water Washable', '2026-05-09'],
    ['P025', 'Store', 'Plate: heroes grey', 'plate', 165, 72, 160, 3, 4, 10, 66.0, 'Standard Grey', '2026-05-12'],
    ['P026', 'Gilda', 'Tall wizard staff', 'model', 30, 24, 190, 2, 3, 5, 5.0, 'Standard Grey', '2026-05-13'],
    ['P027', 'Matteo', 'Tank hull half', 'model', 132, 86, 54, 1, 5, 25, 61.0, 'ABS-Like', '2026-05-14'],
    ['P028', 'Chiara', 'Display plinth', 'model', 100, 100, 40, 2, 3, 45, 35.0, 'Standard Grey', '2026-05-11'],
    ['P029', 'Shop', 'Plate: flexible bits', 'plate', 120, 70, 80, 2, 3, 30, 39.0, 'Flexible', '2026-05-17'],
    ['P030', 'Beta', 'Rotated fit test beam', 'model', 110, 80, 40, 1, 2, 45, 18.0, 'Standard Grey', '2026-05-15']
  ];

  return specs.map((s, i) => ({
    id: `pilot_${String(i + 1).padStart(2, '0')}`,
    orderId: s[0],
    customer: s[1],
    modelName: s[2],
    orderType: s[3],
    footprintW: s[4],
    footprintD: s[5],
    height: s[6],
    quantity: s[7],
    printTimeH: s[8],
    printTimeMin: s[9],
    resinVolumeMl: s[10],
    resinType: s[11],
    deadline: s[12],
    notes: ''
  }));
}

function hasSlotOverlaps(batches) {
  const bySlot = {};
  for (const batch of batches.filter(b => b.printer)) {
    const key = `${batch.printer.id}#${batch.slotIndex || 1}`;
    bySlot[key] ??= [];
    bySlot[key].push(batch);
  }

  for (const slotBatches of Object.values(bySlot)) {
    const sorted = slotBatches
      .slice()
      .sort((a, b) => new Date(a.scheduledStartAt) - new Date(b.scheduledStartAt));
    for (let i = 1; i < sorted.length; i++) {
      if (new Date(sorted[i].scheduledStartAt) < new Date(sorted[i - 1].scheduledEndAt)) {
        return true;
      }
    }
  }
  return false;
}

test('pilot dataset schedules 30 realistic orders without invalid physical assignments', () => {
  const context = loadRuntime();
  const orders = pilotOrders();
  const batches = context.generateQueue(orders, pilotSettings(context));
  const scheduled = batches.filter(b => b.printer);
  const oversized = batches.filter(b => !b.printer);
  const fitProblems = [];

  for (const batch of scheduled) {
    for (const item of batch.items || []) {
      const zOk = !item.h || item.h <= batch.printer.plateZ;
      const xyOk = batch.orderType === 'plate'
        ? ((item.w <= batch.printer.plateW && item.d <= batch.printer.plateD)
          || (item.d <= batch.printer.plateW && item.w <= batch.printer.plateD))
        : (((item.layoutW || item.w) + 2 <= batch.printer.plateW)
          && ((item.layoutD || item.d) + 2 <= batch.printer.plateD));
      if (!zOk || !xyOk) fitProblems.push({ batch: batch.batchId, item: item.label });
    }
  }

  assert.equal(orders.length, 30);
  assert.equal(batches.length <= 29, true);
  assert.equal(scheduled.length + oversized.length, batches.length);
  assert.equal(oversized.length, 2);
  assert.deepEqual(fitProblems, []);
});

test('pilot dataset creates a non-overlapping no-late machine timeline', () => {
  const context = loadRuntime();
  const batches = context.generateQueue(pilotOrders(), pilotSettings(context));
  const scheduled = batches.filter(b => b.printer);

  assert.equal(hasSlotOverlaps(scheduled), false);
  assert.equal(scheduled.filter(b => (b.minutesLate || 0) > 0).length, 0);
  assert.equal(scheduled.every(b => b.scheduledStartAt && b.scheduledEndAt), true);
});

test('pilot dataset produces finite batch pricing for every scheduled batch', () => {
  const context = loadRuntime();
  const settings = pilotSettings(context);
  const batches = context.generateQueue(pilotOrders(), settings).filter(b => b.printer);

  for (const batch of batches) {
    const resin = settings.resins.find(r => r.name === batch.resinType) || settings.resins[0];
    const dep = settings.printerDepreciation[batch.printer.id] || { purchasePrice: 0, lifespanYears: 5 };
    const result = context.runCalculation({
      modelVolume: batch.resinVolumeMl || 0,
      supportPct: settings.queueSupportPct,
      resinPrice: resin.price,
      printerWattage: batch.printer.wattage,
      printTime: batch.printTimeMin,
      electricityRate: settings.electricityRate,
      ipaPrice: settings.ipaPrice,
      ipaPerPrint: settings.ipaPerPrint,
      fepCost: settings.fepCost,
      fepLifespan: settings.fepLifespan,
      purchasePrice: dep.purchasePrice,
      lifespanYears: dep.lifespanYears,
      operatingHoursPerDay: settings.operatingHoursPerDay,
      laborTime: settings.queueLaborTimeMin,
      laborRate: settings.laborRate,
      otherConsumables: settings.queueOtherConsumables,
      failedPrintRisk: settings.failedPrintRisk,
      profitMargin: settings.profitMargin,
      vatRate: settings.vatRate,
      boxMaterials: 0,
      labelsAndTape: 0,
      brandingInserts: 0,
      packingTime: 0,
      shippingCost: 0
    });

    assert.equal(Number.isFinite(result.salePrice), true);
    assert.equal(result.salePrice > 0, true);
  }
});
