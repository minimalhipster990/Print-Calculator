const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadOptimizer() {
  const printersCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'printers.js'), 'utf8');
  const optimizerCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'optimizer.js'), 'utf8');
  const context = {};
  vm.createContext(context);
  vm.runInContext(printersCode, context);
  vm.runInContext(optimizerCode, context);
  return context;
}

test('recommendPrinter retries clean item state and chooses a larger fitting printer', () => {
  const { recommendPrinter } = loadOptimizer();
  const items = [{ id: 'item_1', w: 100, d: 100, h: 10, label: 'Large base' }];
  const printers = [
    { id: 'small', name: 'Small', plateW: 50, plateD: 50, plateZ: 50, wattage: 10 },
    { id: 'large', name: 'Large', plateW: 150, plateD: 150, plateZ: 50, wattage: 20 }
  ];

  const { printer, packResult } = recommendPrinter(items, {}, printers);

  assert.equal(printer.id, 'large');
  assert.equal(packResult.doesNotFitCount, 0);
  assert.equal(items[0].doesNotFit, undefined);
});

test('packItemsOnPlate rejects models taller than printer Z', () => {
  const { packItemsOnPlate } = loadOptimizer();
  const result = packItemsOnPlate(
    [{ id: 'tall', w: 40, d: 40, h: 75, label: 'Tall model' }],
    100,
    100,
    50
  );

  assert.equal(result.doesNotFitCount, 1);
  assert.equal(result.items[0].doesNotFit, true);
});

test('packItemsOnPlate rotates items when rotated footprint is the only fit', () => {
  const { packItemsOnPlate } = loadOptimizer();
  const result = packItemsOnPlate(
    [{ id: 'rot', w: 110, d: 80, h: 40, label: 'Rotatable model' }],
    100,
    120,
    50
  );

  assert.equal(result.doesNotFitCount, 0);
  assert.equal(result.items[0].rotated, true);
});

test('findPrinterForPlate rejects full plates that exceed printer Z height', () => {
  const { findPrinterForPlate } = loadOptimizer();
  const shortPrinter = { id: 'short', name: 'Short Z', plateW: 100, plateD: 100, plateZ: 50, wattage: 10 };

  const printer = findPrinterForPlate(80, 80, 60, [shortPrinter], {});

  assert.equal(printer, null);
});

test('recommendPrinter prefers fewer plate runs before plate utilization', () => {
  const { recommendPrinter } = loadOptimizer();
  const items = Array.from({ length: 8 }, (_, i) => ({
    id: `item_${i}`,
    w: 80,
    d: 60,
    h: 50,
    label: 'Medium block'
  }));
  const printers = [
    { id: 'small', name: 'Small', plateW: 165, plateD: 72, plateZ: 180, wattage: 48 },
    { id: 'large', name: 'Large', plateW: 222, plateD: 130, plateZ: 240, wattage: 120 }
  ];

  const { printer, packResult } = recommendPrinter(items, {}, printers);

  assert.equal(printer.id, 'large');
  assert.equal(packResult.plates, 2);
});
