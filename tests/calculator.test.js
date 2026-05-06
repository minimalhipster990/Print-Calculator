const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadCalculator() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'calculator.js'), 'utf8');
  const context = {};
  vm.createContext(context);
  vm.runInContext(code, context);
  return context;
}

test('cost per cm3 uses model volume in ml because 1 ml equals 1 cm3', () => {
  const { runCalculation } = loadCalculator();
  const result = runCalculation({
    modelVolume: 10,
    supportPct: 0,
    resinPrice: 1000,
    printerWattage: 0,
    printTime: 0,
    electricityRate: 0,
    ipaPrice: 0,
    ipaPerPrint: 0,
    fepCost: 0,
    fepLifespan: 1,
    purchasePrice: 0,
    lifespanYears: 5,
    laborTime: 0,
    laborRate: 0,
    otherConsumables: 0,
    failedPrintRisk: 0,
    profitMargin: 0,
    boxMaterials: 0,
    labelsAndTape: 0,
    brandingInserts: 0,
    packingTime: 0,
    shippingCost: 0
  });

  assert.equal(result.total, 10);
  assert.equal(result.costPerCm3, 1);
});

test('depreciation assumes a 16 hour production day', () => {
  const { calcDepreciation } = loadCalculator();

  assert.equal(calcDepreciation(5840, 1, 60), 1);
});

test('depreciation can use user-defined operating hours per day', () => {
  const { calcDepreciation } = loadCalculator();

  assert.equal(calcDepreciation(5840, 1, 60, 8), 2);
});

test('VAT is applied on top of the suggested price excluding VAT', () => {
  const { runCalculation } = loadCalculator();
  const result = runCalculation({
    modelVolume: 10,
    supportPct: 0,
    resinPrice: 1000,
    printerWattage: 0,
    printTime: 0,
    electricityRate: 0,
    ipaPrice: 0,
    ipaPerPrint: 0,
    fepCost: 0,
    fepLifespan: 1,
    purchasePrice: 0,
    lifespanYears: 5,
    operatingHoursPerDay: 16,
    laborTime: 0,
    laborRate: 0,
    otherConsumables: 0,
    failedPrintRisk: 0,
    profitMargin: 0,
    vatRate: 22,
    boxMaterials: 0,
    labelsAndTape: 0,
    brandingInserts: 0,
    packingTime: 0,
    shippingCost: 0
  });

  assert.equal(result.netSalePrice, 10);
  assert.equal(result.vatAmount, 2.2);
  assert.equal(result.salePrice, 12.2);
});

test('wash and cure time is configurable in electricity cost', () => {
  const { calcElectricityCost } = loadCalculator();
  const round = value => Number(value.toFixed(6));

  assert.equal(round(calcElectricityCost(0, 0, 0.20)), 0.005);
  assert.equal(round(calcElectricityCost(0, 0, 0.20, 0)), 0);
  assert.equal(round(calcElectricityCost(0, 0, 0.20, 60)), 0.01);
});

test('suggested and final prices show fulfillment separately while taxing the full subtotal', () => {
  const { runCalculation } = loadCalculator();
  const result = runCalculation({
    modelVolume: 10,
    supportPct: 0,
    resinPrice: 1000,
    printerWattage: 0,
    printTime: 0,
    electricityRate: 0,
    ipaPrice: 0,
    ipaPerPrint: 0,
    fepCost: 0,
    fepLifespan: 1,
    purchasePrice: 0,
    lifespanYears: 5,
    operatingHoursPerDay: 16,
    laborTime: 0,
    laborRate: 0,
    otherConsumables: 0,
    failedPrintRisk: 0,
    profitMargin: 0,
    vatRate: 22,
    boxMaterials: 2,
    labelsAndTape: 0,
    brandingInserts: 0,
    packingTime: 0,
    shippingCost: 5
  });

  assert.equal(result.fulfillmentCost, 7);
  assert.equal(result.fulfillmentPriceExVat, 7);
  assert.equal(result.suggestedPriceExVat, 10);
  assert.equal(result.taxableNet, 17);
  assert.equal(result.vatAmount, 3.74);
  assert.equal(Number(result.finalPriceInclVat.toFixed(2)), 20.74);
  assert.equal(result.costPerCm3, 1);
});

test('profit margin applies to both print production and fulfillment price components', () => {
  const { runCalculation } = loadCalculator();
  const result = runCalculation({
    modelVolume: 10,
    supportPct: 0,
    resinPrice: 1000,
    printerWattage: 0,
    printTime: 0,
    electricityRate: 0,
    ipaPrice: 0,
    ipaPerPrint: 0,
    fepCost: 0,
    fepLifespan: 1,
    purchasePrice: 0,
    lifespanYears: 5,
    operatingHoursPerDay: 16,
    laborTime: 0,
    laborRate: 0,
    otherConsumables: 0,
    failedPrintRisk: 0,
    profitMargin: 50,
    vatRate: 22,
    boxMaterials: 2,
    labelsAndTape: 0,
    brandingInserts: 0,
    packingTime: 0,
    shippingCost: 5
  });

  assert.equal(result.total, 17);
  assert.equal(result.suggestedPriceExVat, 20);
  assert.equal(result.fulfillmentCost, 7);
  assert.equal(result.fulfillmentPriceExVat, 14);
  assert.equal(result.taxableNet, 34);
  assert.equal(result.vatAmount, 7.48);
  assert.equal(Number(result.finalPriceInclVat.toFixed(2)), 41.48);
});

test('failure risk uses expected production multiplier', () => {
  const { calcTotal } = loadCalculator();

  const total = calcTotal({
    resin: 100,
    electricity: 0,
    consumables: 0,
    depreciation: 0,
    labor: 0,
    packaging: 0,
    shipping: 0
  }, 50);

  assert.equal(total, 200);
});

test('unsafe calculator inputs are clamped to finite daily-use values', () => {
  const { runCalculation } = loadCalculator();
  const result = runCalculation({
    modelVolume: -10,
    supportPct: -20,
    resinPrice: -35,
    printerWattage: -48,
    printTime: -60,
    electricityRate: -0.25,
    ipaPrice: -5,
    ipaPerPrint: -30,
    fepCost: 12,
    fepLifespan: 0,
    purchasePrice: -250,
    lifespanYears: 0,
    operatingHoursPerDay: 0,
    laborTime: -30,
    laborRate: -15,
    otherConsumables: -0.30,
    failedPrintRisk: 250,
    profitMargin: 100,
    vatRate: -22,
    boxMaterials: -1,
    labelsAndTape: -1,
    brandingInserts: -1,
    packingTime: -10,
    shippingCost: -5
  });

  assert.equal(Number.isFinite(result.total), true);
  assert.equal(Number.isFinite(result.salePrice), true);
  assert.equal(result.total >= 0, true);
  assert.equal(result.salePrice >= 0, true);
});
