const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadApp(options = {}) {
  const calculatorCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'calculator.js'), 'utf8');
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  const elements = options.elements || {};
  const settings = options.settings || { currency: 'EUR', resins: [] };
  const context = {
    document: {
      addEventListener() {},
      getElementById(id) {
        return elements[id] || null;
      }
    },
    PRINTERS: options.printers || [],
    loadOrders: () => [],
    loadSettings: () => settings
  };
  vm.createContext(context);
  vm.runInContext(calculatorCode, context);
  vm.runInContext(code, context);
  return context;
}

test('parseOrdersCSVText handles quoted commas and escaped quotes', () => {
  const { parseOrdersCSVText } = loadApp();
  const csv = [
    'OrderID,Customer,ModelName,FootprintW,FootprintD,Height,Quantity,ResinType,Deadline,Notes,OrderType,PrintTimeH,PrintTimeMin,ResinVolumeMl',
    '"#008","Acme, Inc.","Knight ""Alpha""","10","20","30","2","Standard Grey","2026-05-10","Fragile, expedite","model","1","25","7.5"'
  ].join('\n');

  const orders = parseOrdersCSVText(csv, () => 'fixed_id');

  assert.equal(orders.length, 1);
  assert.equal(orders[0].id, 'fixed_id');
  assert.equal(orders[0].customer, 'Acme, Inc.');
  assert.equal(orders[0].modelName, 'Knight "Alpha"');
  assert.equal(orders[0].notes, 'Fragile, expedite');
  assert.equal(orders[0].printTimeMin, 25);
  assert.equal(orders[0].resinVolumeMl, 7.5);
});

test('esc escapes text for HTML rendering', () => {
  const { esc } = loadApp();

  assert.equal(esc(`<img src=x onerror='x'>`), '&lt;img src=x onerror=&#39;x&#39;&gt;');
});

test('escJsString escapes ids used inside inline click handlers', () => {
  const { escJsString } = loadApp();

  assert.equal(escJsString("bad'id\n"), 'bad\\&#39;id\\n');
});

test('syncCalculatorDefaultsFromSettings applies all calculator economic defaults', () => {
  const ids = [
    'calc-electricity',
    'calc-ipa-price',
    'calc-ipa-per-print',
    'calc-fep-cost',
    'calc-fep-lifespan',
    'calc-labor-rate',
    'calc-operating-hours',
    'calc-risk',
    'calc-margin',
    'calc-vat-rate'
  ];
  const elements = Object.fromEntries(ids.map(id => [id, { value: '' }]));
  const settings = {
    currency: 'EUR',
    electricityRate: 0.42,
    ipaPrice: 8,
    ipaPerPrint: 55,
    fepCost: 14,
    fepLifespan: 150,
    laborRate: 23,
    operatingHoursPerDay: 16,
    depreciationHoursPerDay: 10,
    schedulerOperatingHoursPerDay: 20,
    failedPrintRisk: 12,
    profitMargin: 37,
    vatRate: 21,
    resins: []
  };
  const { syncCalculatorDefaultsFromSettings } = loadApp({ settings, elements });

  syncCalculatorDefaultsFromSettings();

  assert.equal(elements['calc-electricity'].value, 0.42);
  assert.equal(elements['calc-ipa-price'].value, 8);
  assert.equal(elements['calc-ipa-per-print'].value, 55);
  assert.equal(elements['calc-fep-cost'].value, 14);
  assert.equal(elements['calc-fep-lifespan'].value, 150);
  assert.equal(elements['calc-labor-rate'].value, 23);
  assert.equal(elements['calc-operating-hours'].value, 10);
  assert.equal(elements['calc-risk'].value, 12);
  assert.equal(elements['calc-margin'].value, 37);
  assert.equal(elements['calc-vat-rate'].value, 21);
});

test('exportCurrentQueueCSV enriches batches with calculator cost estimates', () => {
  const exported = [];
  const batch = {
    printer: { wattage: 0, id: 'mini8k' },
    printTimeMin: 60,
    resinVolumeMl: 10,
    resinType: 'Standard Grey'
  };
  const settings = {
    currency: 'EUR',
    electricityRate: 0,
    ipaPrice: 0,
    ipaPerPrint: 0,
    fepCost: 0,
    fepLifespan: 1,
    laborRate: 0,
    depreciationHoursPerDay: 16,
    schedulerOperatingHoursPerDay: 8,
    failedPrintRisk: 0,
    profitMargin: 50,
    vatRate: 22,
    queueSupportPct: 0,
    queueLaborTimeMin: 0,
    queueOtherConsumables: 0,
    resins: [{ name: 'Standard Grey', price: 1000 }],
    printerDepreciation: { mini8k: { purchasePrice: 0, lifespanYears: 5 } }
  };
  const context = loadApp({ settings });
  context.exportQueueCSV = batches => exported.push(batches);

  context.exportCurrentQueueCSV([batch]);

  assert.equal(exported.length, 1);
  assert.equal(exported[0][0].productionCost, 10);
  assert.equal(exported[0][0].batchEstimate, 24.4);
  assert.equal(exported[0][0].currencySymbol, '€');
});

test('exportCurrentQueueCSV uses queue costing assumptions and amortization hours', () => {
  const exported = [];
  const batch = {
    printer: { wattage: 0, id: 'mini8k' },
    printTimeMin: 60,
    resinVolumeMl: 10,
    resinType: 'Standard Grey'
  };
  const settings = {
    currency: 'EUR',
    electricityRate: 0,
    ipaPrice: 0,
    ipaPerPrint: 0,
    fepCost: 0,
    fepLifespan: 1,
    laborRate: 60,
    depreciationHoursPerDay: 8,
    schedulerOperatingHoursPerDay: 20,
    failedPrintRisk: 0,
    profitMargin: 0,
    vatRate: 0,
    queueSupportPct: 50,
    queueLaborTimeMin: 15,
    queueOtherConsumables: 2,
    resins: [{ name: 'Standard Grey', price: 1000 }],
    printerDepreciation: { mini8k: { purchasePrice: 2920, lifespanYears: 1 } }
  };
  const context = loadApp({
    settings,
    printers: [{ id: 'mini8k', name: 'Mini 8K', wattage: 0 }]
  });
  context.exportQueueCSV = batches => exported.push(batches);

  context.exportCurrentQueueCSV([batch]);

  assert.equal(exported[0][0].productionCost, 33);
  assert.equal(exported[0][0].batchEstimate, 33);
});

test('calcRun renders margin-adjusted print, VAT, fulfillment and final price', () => {
  const values = {
    'calc-volume': 10,
    'calc-support-pct': 0,
    'calc-resin-price': 1000,
    'calc-wattage': 0,
    'calc-hours': 0,
    'calc-minutes': 0,
    'calc-electricity': 0,
    'calc-ipa-price': 0,
    'calc-ipa-per-print': 0,
    'calc-fep-cost': 0,
    'calc-fep-lifespan': 1,
    'calc-purchase-price': 0,
    'calc-lifespan': 5,
    'calc-operating-hours': 16,
    'calc-labor-time': 0,
    'calc-labor-rate': 0,
    'calc-other-consumables': 0,
    'calc-risk': 0,
    'calc-margin': 50,
    'calc-vat-rate': 22,
    'calc-box-materials': 2,
    'calc-labels-tape': 0,
    'calc-branding': 0,
    'calc-packing-time': 0,
    'calc-shipping-cost': 5
  };
  const outputs = [
    'out-resin',
    'out-electricity',
    'out-consumables',
    'out-depreciation',
    'out-labor',
    'out-packaging',
    'out-shipping',
    'out-total',
    'out-vat',
    'out-fulfillment',
    'out-sale-price',
    'out-price-breakdown',
    'out-per-cm3'
  ];
  const elements = {
    ...Object.fromEntries(Object.entries(values).map(([id, value]) => [id, { value }])),
    ...Object.fromEntries(outputs.map(id => [id, { textContent: '' }]))
  };
  const { calcRun } = loadApp({ elements });

  calcRun();

  assert.equal(elements['out-total'].textContent, '€20.00');
  assert.equal(elements['out-vat'].textContent, '€7.48');
  assert.equal(elements['out-fulfillment'].textContent, '€14.00');
  assert.equal(elements['out-sale-price'].textContent, '€41.48');
  assert.equal(elements['out-price-breakdown'].textContent, '€20.00 print + €7.48 VAT + €14.00 packaging & shipping');
});
