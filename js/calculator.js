function calcResinCost(modelVolumeMl, supportPct, resinPricePerL) {
  const supportMultiplier = 1 + (supportPct / 100);
  const totalVolume = modelVolumeMl * supportMultiplier;
  return (totalVolume / 1000) * resinPricePerL;
}

function calcElectricityCost(printerWattage, printTimeMin, electricityRate) {
  const hours = printTimeMin / 60;
  // Add 30 min wash+cure at ~50W
  const washCureHours = 0.5;
  const washCureW = 50;
  const totalKwh = ((printerWattage * hours) + (washCureW * washCureHours)) / 1000;
  return totalKwh * electricityRate;
}

function calcConsumablesCost(ipaPrice, ipaPerPrintMl, fepCost, fepLifespan) {
  const ipaCost = (ipaPerPrintMl / 1000) * ipaPrice;
  const fepAmort = fepCost / fepLifespan;
  return ipaCost + fepAmort;
}

function calcDepreciation(purchasePrice, lifespanYears, printTimeMin) {
  const totalPrintMinutesLifespan = lifespanYears * 365 * 16 * 60; // ~16h/day
  return (purchasePrice / totalPrintMinutesLifespan) * printTimeMin;
}

function calcLaborCost(laborTimeMin, laborRatePerHour) {
  return (laborTimeMin / 60) * laborRatePerHour;
}

function calcPackagingCost(boxMaterials, labelsAndTape, brandingInserts, packingTimeMin, laborRate) {
  const packingLabor = (packingTimeMin / 60) * laborRate;
  return boxMaterials + labelsAndTape + brandingInserts + packingLabor;
}

function calcTotal(costs, failedPrintRisk) {
  // Risk buffer applies to production only (not packaging/shipping)
  const productionBase = costs.resin + costs.electricity + costs.consumables + costs.depreciation + costs.labor;
  const riskBuffer = productionBase * (failedPrintRisk / 100);
  return productionBase + riskBuffer + costs.packaging + costs.shipping;
}

function calcSalePrice(totalCost, profitMarginPct) {
  return totalCost / (1 - (profitMarginPct / 100));
}

function runCalculation(inputs) {
  const resin = calcResinCost(inputs.modelVolume, inputs.supportPct, inputs.resinPrice);
  const electricity = calcElectricityCost(inputs.printerWattage, inputs.printTime, inputs.electricityRate);
  const consumables = calcConsumablesCost(inputs.ipaPrice, inputs.ipaPerPrint, inputs.fepCost, inputs.fepLifespan);
  const depreciation = calcDepreciation(inputs.purchasePrice, inputs.lifespanYears, inputs.printTime);
  const labor = calcLaborCost(inputs.laborTime, inputs.laborRate);
  const packaging = calcPackagingCost(
    inputs.boxMaterials, inputs.labelsAndTape, inputs.brandingInserts,
    inputs.packingTime, inputs.laborRate
  );
  const shipping = inputs.shippingCost || 0;

  const costs = { resin, electricity, consumables, depreciation, labor, packaging, shipping };
  const total = calcTotal(costs, inputs.failedPrintRisk);
  const salePrice = calcSalePrice(total, inputs.profitMargin);
  const costPerCm3 = inputs.modelVolume > 0 ? total / (inputs.modelVolume / 1000) : 0;

  return { costs, total, salePrice, costPerCm3 };
}
