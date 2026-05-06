// Tiny Legions — Production Helper
// Copyright (c) 2026 minimalhipster990. All rights reserved.

function finiteNumber(value, fallback = 0) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampNumber(value, fallback = 0, min = -Infinity, max = Infinity) {
  return Math.min(Math.max(finiteNumber(value, fallback), min), max);
}

function calcResinCost(modelVolumeMl, supportPct, resinPricePerL) {
  const volume = clampNumber(modelVolumeMl, 0, 0);
  const supportMultiplier = 1 + (clampNumber(supportPct, 0, 0, 300) / 100);
  const totalVolume = volume * supportMultiplier;
  return (totalVolume / 1000) * clampNumber(resinPricePerL, 0, 0);
}

function calcElectricityCost(printerWattage, printTimeMin, electricityRate) {
  const hours = clampNumber(printTimeMin, 0, 0) / 60;
  // Add 30 min wash+cure at ~50W
  const washCureHours = 0.5;
  const washCureW = 50;
  const totalKwh = ((clampNumber(printerWattage, 0, 0) * hours) + (washCureW * washCureHours)) / 1000;
  return totalKwh * clampNumber(electricityRate, 0, 0);
}

function calcConsumablesCost(ipaPrice, ipaPerPrintMl, fepCost, fepLifespan, otherConsumables) {
  const ipaCost = (clampNumber(ipaPerPrintMl, 0, 0) / 1000) * clampNumber(ipaPrice, 0, 0);
  const fepAmort = clampNumber(fepCost, 0, 0) / clampNumber(fepLifespan, 1, 1);
  return ipaCost + fepAmort + clampNumber(otherConsumables, 0, 0);
}

function calcDepreciation(purchasePrice, lifespanYears, printTimeMin, operatingHoursPerDay) {
  const hoursPerDay = clampNumber(operatingHoursPerDay, 16, 1, 24);
  const years = clampNumber(lifespanYears, 1, 1);
  const totalPrintMinutesLifespan = years * 365 * hoursPerDay * 60;
  return (clampNumber(purchasePrice, 0, 0) / totalPrintMinutesLifespan) * clampNumber(printTimeMin, 0, 0);
}

function calcLaborCost(laborTimeMin, laborRatePerHour) {
  return (clampNumber(laborTimeMin, 0, 0) / 60) * clampNumber(laborRatePerHour, 0, 0);
}

function calcPackagingCost(boxMaterials, labelsAndTape, brandingInserts, packingTimeMin, laborRate) {
  const packingLabor = (clampNumber(packingTimeMin, 0, 0) / 60) * clampNumber(laborRate, 0, 0);
  return clampNumber(boxMaterials, 0, 0)
    + clampNumber(labelsAndTape, 0, 0)
    + clampNumber(brandingInserts, 0, 0)
    + packingLabor;
}

function calcExpectedProductionCost(costs, failedPrintRisk) {
  // Failure risk applies to production only. Use expected cost: p=50% means
  // two expected attempts, not just a 50% markup.
  const productionBase = costs.resin + costs.electricity + costs.consumables + costs.depreciation + costs.labor;
  const failureProbability = clampNumber(failedPrintRisk, 0, 0, 95) / 100;
  return productionBase / (1 - failureProbability);
}

function calcTotal(costs, failedPrintRisk) {
  return calcExpectedProductionCost(costs, failedPrintRisk) + costs.packaging + costs.shipping;
}

function calcSalePrice(totalCost, profitMarginPct) {
  const margin = clampNumber(profitMarginPct, 0, 0, 99);
  return clampNumber(totalCost, 0, 0) / (1 - (margin / 100));
}

function calcVatAmount(netSalePrice, vatRatePct) {
  return clampNumber(netSalePrice, 0, 0) * (clampNumber(vatRatePct, 0, 0, 100) / 100);
}

function runCalculation(inputs) {
  const resin = calcResinCost(inputs.modelVolume, inputs.supportPct, inputs.resinPrice);
  const electricity = calcElectricityCost(inputs.printerWattage, inputs.printTime, inputs.electricityRate);
  const consumables = calcConsumablesCost(inputs.ipaPrice, inputs.ipaPerPrint, inputs.fepCost, inputs.fepLifespan, inputs.otherConsumables);
  const depreciation = calcDepreciation(inputs.purchasePrice, inputs.lifespanYears, inputs.printTime, inputs.operatingHoursPerDay);
  const labor = calcLaborCost(inputs.laborTime, inputs.laborRate);
  const packaging = calcPackagingCost(
    inputs.boxMaterials, inputs.labelsAndTape, inputs.brandingInserts,
    inputs.packingTime, inputs.laborRate
  );
  const shipping = clampNumber(inputs.shippingCost, 0, 0);

  const costs = { resin, electricity, consumables, depreciation, labor, packaging, shipping };
  const fulfillmentCost = packaging + shipping;
  const expectedProductionCost = calcExpectedProductionCost(costs, inputs.failedPrintRisk);
  const total = expectedProductionCost + fulfillmentCost;
  const printPriceExVat = calcSalePrice(expectedProductionCost, inputs.profitMargin);
  const fulfillmentPriceExVat = calcSalePrice(fulfillmentCost, inputs.profitMargin);
  const taxableNet = printPriceExVat + fulfillmentPriceExVat;
  const vatAmount = calcVatAmount(taxableNet, inputs.vatRate);
  const salePrice = taxableNet + vatAmount;
  const costPerCm3 = inputs.modelVolume > 0 ? expectedProductionCost / inputs.modelVolume : 0;

  return {
    costs,
    expectedProductionCost,
    total,
    fulfillmentCost,
    fulfillmentPriceExVat,
    taxableNet,
    netSalePrice: printPriceExVat,
    suggestedPriceExVat: printPriceExVat,
    vatAmount,
    salePrice,
    finalPriceInclVat: salePrice,
    costPerCm3
  };
}
