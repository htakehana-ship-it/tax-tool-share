const moneyInputIds = [
  "salePrice",
  "landPurchasePrice",
  "buildingPurchasePrice",
  "buildingImprovementCost",
  "purchaseBrokerFee",
  "purchaseStampTax",
  "purchaseRegistrationTax",
  "purchaseRealEstateTax",
  "purchaseOtherCost",
  "manualDepreciationTotal",
  "sellBrokerFee",
  "sellStampTax",
  "sellDemolitionCost",
  "sellSurveyCost",
  "sellOtherCost",
  "otherSpecialDeduction",
];

const ids = [
  ...moneyInputIds,
  "structureType",
  "depreciationRate",
  "depreciationBaseFactor",  "holdingMode",
  "acquisitionDate",
  "transferDate",
  "useHome3000",
  "useReducedRate",
];

const el = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

const out = {
  acquisitionCostTotal: document.getElementById("acquisitionCostTotal"),
  depreciationTotalUsed: document.getElementById("depreciationTotalUsed"),
  adjustedAcquisitionCost: document.getElementById("adjustedAcquisitionCost"),
  transferExpensesTotal: document.getElementById("transferExpensesTotal"),
  gainBeforeTax: document.getElementById("gainBeforeTax"),
  effectiveDeduction: document.getElementById("effectiveDeduction"),
  taxableGain: document.getElementById("taxableGain"),
  totalTax: document.getElementById("totalTax"),
  incomeTax: document.getElementById("incomeTax"),
  reconstructionTax: document.getElementById("reconstructionTax"),
  residentTax: document.getElementById("residentTax"),
  formula: document.getElementById("formula"),
  holdingResult: document.getElementById("holdingResult"),
  specialResult: document.getElementById("specialResult"),
  rateNote: document.getElementById("rateNote"),
  depreciationInfo: document.getElementById("depreciationInfo"),
  specialConditionNote: document.getElementById("specialConditionNote"),
};

const structureRates = {
  rc: 0.015,
  src: 0.015,
  steel: 0.02,
  light_steel: 0.025,
  wood: 0.031,
  wood_mortar: 0.034,
  brick_block_stone: 0.018,
};

const TAX = {
  longIncome: 0.15,
  longResident: 0.05,
  shortIncome: 0.3,
  shortResident: 0.09,
  reducedThreshold: 60000000,
  reducedIncomeUnder: 0.1,
  reducedIncomeOver: 0.15,
  reducedResidentUnder: 0.04,
  reducedResidentOver: 0.05,
  reconstruction: 0.021,
};

function getRadioValue(name) {
  const node = document.querySelector(`input[name="${name}"]:checked`);
  return node ? node.value : "";
}

function parseNumber(value) {
  if (String(value).trim() === "") return 0;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function formatWithComma(value) {
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 }).format(Math.round(value));
}

function yen(value) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function calcYearDiff(fromDate, toDate) {
  if (!fromDate || !toDate) return null;
  return (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24 * 365.2425);
}

function calcRoundedDepreciationYears(fromDate, toDate) {
  const years = calcYearDiff(fromDate, toDate);
  if (years == null || years <= 0) return 0;
  const wholeYears = Math.floor(years);
  const remainder = years - wholeYears;
  return wholeYears + (remainder >= 0.5 ? 1 : 0);
}

function moneyValue(id) {
  return Math.max(0, parseNumber(el[id].value));
}

function calcHolding() {
  const mode = el.holdingMode.value;
  const acquired = parseDate(el.acquisitionDate.value);
  const transferred = parseDate(el.transferDate.value);

  let yearsAtJan1 = null;
  let isOver10 = false;
  if (acquired && transferred) {
    const judgeDate = new Date(transferred.getFullYear(), 0, 1);
    yearsAtJan1 = calcYearDiff(acquired, judgeDate);
    isOver10 = yearsAtJan1 > 10;
  }

  if (mode === "long") return { isLong: true, yearsAtJan1, isOver10, label: "長期（5年超）を手動選択" };
  if (mode === "short") return { isLong: false, yearsAtJan1, isOver10, label: "短期（5年以下）を手動選択" };

  if (!acquired || !transferred) {
    return {
      isLong: true,
      yearsAtJan1: null,
      isOver10: false,
      label: "取得日または売却日が未入力のため、暫定で長期扱いで計算",
    };
  }

  const judgeDate = new Date(transferred.getFullYear(), 0, 1);
  const isLong = yearsAtJan1 > 5;

  return {
    isLong,
    yearsAtJan1,
    isOver10,
    label: `判定日 ${judgeDate.toLocaleDateString("ja-JP")} 時点: 約 ${yearsAtJan1.toFixed(2)} 年 / ${
      isLong ? "長期（5年超）" : "短期（5年以下）"
    } / ${isOver10 ? "10年超" : "10年以下"}`,
  };
}

function calcDepreciation() {
  const depKnown = getRadioValue("depreciationKnown") === "yes";
  if (depKnown) {
    const manualAmount = moneyValue("manualDepreciationTotal");
    return {
      amount: manualAmount,
      note: `手入力の減価償却累計額 ${yen(manualAmount)} を使用`,
      formula: `減価償却累計額 = 手入力 ${yen(manualAmount)}`,
    };
  }

  const buildingBase = moneyValue("buildingPurchasePrice") + moneyValue("buildingImprovementCost");
  const acquired = parseDate(el.acquisitionDate.value);
  const transferred = parseDate(el.transferDate.value);

  const years =
    calcRoundedDepreciationYears(acquired, transferred);

  const rate = Math.max(0, parseNumber(el.depreciationRate.value));
  const factorRaw = parseNumber(el.depreciationBaseFactor.value);
  const factor = Math.max(0, factorRaw || 0.9);

  const raw = buildingBase * factor * rate * years;
  const amount = Math.floor(Math.min(buildingBase, Math.max(0, raw)));

  return {
    amount,
    note: `自動計算: 建物取得価額 ${yen(buildingBase)} × 0.9 × 償却率 ${rate.toFixed(3)} × 経過年数 ${years}年`,
    formula: `減価償却累計額 = floor(min(建物取得価額, 建物取得価額 × 0.9 × 償却率 × 経過年数)) = ${yen(amount)}`,
  };
}

function calculate() {
  const salePrice = moneyValue("salePrice");
  const acquisitionCostKnown = getRadioValue("acquisitionCostKnown") === "yes";

  const acquisitionCostInputTotal =
    moneyValue("landPurchasePrice") +
    moneyValue("buildingPurchasePrice") +
    moneyValue("buildingImprovementCost") +
    moneyValue("purchaseBrokerFee") +
    moneyValue("purchaseStampTax") +
    moneyValue("purchaseRegistrationTax") +
    moneyValue("purchaseRealEstateTax") +
    moneyValue("purchaseOtherCost");

  const acquisitionCostTotal = acquisitionCostKnown ? acquisitionCostInputTotal : Math.floor(salePrice * 0.05);

  const transferExpensesTotal =
    moneyValue("sellBrokerFee") +
    moneyValue("sellStampTax") +
    moneyValue("sellDemolitionCost") +
    moneyValue("sellSurveyCost") +
    moneyValue("sellOtherCost");

  const depreciation = acquisitionCostKnown
    ? calcDepreciation()
    : {
        amount: 0,
        note: `概算取得費5%ルールを使用中のため、減価償却計算は行いません（取得費 = ${yen(acquisitionCostTotal)}）`,
        formula: `概算取得費 = 売却価格 ${yen(salePrice)} × 5% = ${yen(acquisitionCostTotal)}`,
      };
  const adjustedAcquisitionCost = Math.max(0, acquisitionCostTotal - depreciation.amount);
  const gainBeforeTax = salePrice - adjustedAcquisitionCost - transferExpensesTotal;

  const homeQ1Residence = getRadioValue("homeQ1_residence") === "yes";
  const homeQ2NotRelated = getRadioValue("homeQ2_not_related") === "yes";
  const homeQ3NoRecent = getRadioValue("homeQ3_no_recent") === "yes";
  const reducedQ1NoRecent = getRadioValue("reducedQ1_no_recent") === "yes";
  const useHome3000 = !!el.useHome3000.checked;
  const useReducedRate = !!el.useReducedRate.checked;

  const holding = calcHolding();
  out.holdingResult.textContent = holding.label;
  out.depreciationInfo.textContent = depreciation.note;

  const messages = [];
  if (!acquisitionCostKnown) {
    messages.push("取得費不明のため、概算取得費5%ルール（売却価格×5%）を適用しています。");
  }

  const homeEligible = homeQ1Residence && homeQ2NotRelated && homeQ3NoRecent;
  const home3000Deduction = homeEligible && useHome3000 ? 30000000 : 0;
  if (!homeEligible) {
    messages.push("居住用財産を譲渡した場合の3,000万円の特別控除の特例は、回答条件を満たさないため利用できません。");
  } else if (!useHome3000) {
    messages.push("居住用財産を譲渡した場合の3,000万円の特別控除の特例は、利用可能ですが使用しない設定です。");
  }

  const otherDeduction = moneyValue("otherSpecialDeduction");
  const effectiveDeduction = home3000Deduction + otherDeduction;
  const taxableGain = Math.max(0, gainBeforeTax - effectiveDeduction);

  let incomeTax = 0;
  let residentTax = 0;
  let rateNote = "";

  const reducedEligible = homeEligible && reducedQ1NoRecent && holding.isOver10;
  if (!reducedEligible && useReducedRate) {
    messages.push("居住用財産を譲渡した場合の軽減税率の特例を選択していますが、判定条件を満たさないため適用されません。");
  } else if (reducedEligible && !useReducedRate) {
    messages.push("居住用財産を譲渡した場合の軽減税率の特例は、利用可能ですが使用しない設定です。");
  }

  const canApplyReducedRate = reducedEligible && useReducedRate;

  if (canApplyReducedRate) {
    const lowerPart = Math.min(taxableGain, TAX.reducedThreshold);
    const upperPart = Math.max(0, taxableGain - TAX.reducedThreshold);
    incomeTax = lowerPart * TAX.reducedIncomeUnder + upperPart * TAX.reducedIncomeOver;
    residentTax = lowerPart * TAX.reducedResidentUnder + upperPart * TAX.reducedResidentOver;
    rateNote = `居住用財産を譲渡した場合の軽減税率の特例を適用: ${yen(TAX.reducedThreshold)} 以下は所得税10%・住民税4%、超過部分は所得税15%・住民税5%`;
  } else {
    const incomeRate = holding.isLong ? TAX.longIncome : TAX.shortIncome;
    const residentRate = holding.isLong ? TAX.longResident : TAX.shortResident;
    incomeTax = taxableGain * incomeRate;
    residentTax = taxableGain * residentRate;
    rateNote = `通常税率: 所得税 ${(incomeRate * 100).toFixed(1)}%・住民税 ${(residentRate * 100).toFixed(1)}%`;
  }

  out.specialResult.textContent = `特例判定: 居住用財産を譲渡した場合の3,000万円の特別控除の特例 ${
    homeEligible ? `利用可（${useHome3000 ? "使用する" : "使用しない"}）` : "利用不可"
  } / 居住用財産を譲渡した場合の軽減税率の特例 ${
    reducedEligible ? `利用可（${useReducedRate ? "使用する" : "使用しない"}）` : "利用不可"
  }`;

  const reconstructionTax = incomeTax * TAX.reconstruction;
  const totalTax = incomeTax + reconstructionTax + residentTax;

  out.acquisitionCostTotal.textContent = yen(acquisitionCostTotal);
  out.depreciationTotalUsed.textContent = yen(depreciation.amount);
  out.adjustedAcquisitionCost.textContent = yen(adjustedAcquisitionCost);
  out.transferExpensesTotal.textContent = yen(transferExpensesTotal);
  out.gainBeforeTax.textContent = yen(gainBeforeTax);
  out.effectiveDeduction.textContent = yen(effectiveDeduction);
  out.taxableGain.textContent = yen(taxableGain);
  out.totalTax.textContent = yen(totalTax);
  out.incomeTax.textContent = yen(incomeTax);
  out.reconstructionTax.textContent = yen(reconstructionTax);
  out.residentTax.textContent = yen(residentTax);
  out.rateNote.textContent = rateNote;
  out.specialConditionNote.textContent = messages.join(" ");

  out.formula.textContent = [
    acquisitionCostKnown
      ? `取得費合計（償却前） = ${yen(acquisitionCostTotal)}`
      : `取得費（概算5%） = ${yen(salePrice)} × 5% = ${yen(acquisitionCostTotal)}`,
    depreciation.formula,
    `取得費（償却後） = ${yen(acquisitionCostTotal)} - ${yen(depreciation.amount)} = ${yen(adjustedAcquisitionCost)}`,
    `譲渡費用合計 = ${yen(transferExpensesTotal)}`,
    `譲渡所得（課税前） = ${yen(salePrice)} - ${yen(adjustedAcquisitionCost)} - ${yen(transferExpensesTotal)} = ${yen(gainBeforeTax)}`,
    `控除合計 = 居住用財産を譲渡した場合の3,000万円の特別控除の特例 ${yen(home3000Deduction)} + その他特別控除 ${yen(otherDeduction)} = ${yen(effectiveDeduction)}`,
    `課税譲渡所得 = max(0, ${yen(gainBeforeTax)} - ${yen(effectiveDeduction)}) = ${yen(taxableGain)}`,
    `所得税 = ${yen(incomeTax)}`,
    `復興特別所得税 = 所得税 ${yen(incomeTax)} × 2.1% = ${yen(reconstructionTax)}`,
    `住民税 = ${yen(residentTax)}`,
    `合計税額 = ${yen(incomeTax)} + ${yen(reconstructionTax)} + ${yen(residentTax)} = ${yen(totalTax)}`,
  ].join("\n");

  updateRequiredHighlights();
}

function syncStructureRate() {
  const depKnownValue = getRadioValue("depreciationKnown");
  const rate = structureRates[el.structureType.value];
  if (depKnownValue === "no" && rate != null) {
    el.depreciationRate.value = rate.toFixed(3);
    el.depreciationBaseFactor.value = "0.9";
  } else if (el.structureType.value === "") {
    el.depreciationRate.value = "";
    if (depKnownValue === "no") el.depreciationBaseFactor.value = "0.9";
  }
}

function updateBranchingUI() {
  const acquisitionCostKnown = getRadioValue("acquisitionCostKnown") === "yes";
  document.getElementById("acquisitionDetailGroup").classList.toggle("hidden", !acquisitionCostKnown);
  document.getElementById("depreciationCard").classList.toggle("hidden", !acquisitionCostKnown);

  const depKnownValue = getRadioValue("depreciationKnown");
  document.getElementById("autoDepGroup").classList.toggle("hidden", depKnownValue !== "no");
  document.getElementById("manualDepGroup").classList.toggle("hidden", depKnownValue !== "yes");
  if (depKnownValue === "no" && String(el.depreciationBaseFactor.value).trim() === "") {
    el.depreciationBaseFactor.value = "0.9";
  }
  const homeQ1Residence = getRadioValue("homeQ1_residence") === "yes";
  const homeQ2NotRelated = getRadioValue("homeQ2_not_related") === "yes";
  const homeQ3NoRecent = getRadioValue("homeQ3_no_recent") === "yes";
  const reducedQ1NoRecent = getRadioValue("reducedQ1_no_recent") === "yes";
  const holding = calcHolding();

  const homeEligible = homeQ1Residence && homeQ2NotRelated && homeQ3NoRecent;
  const reducedEligible = homeEligible && reducedQ1NoRecent && holding.isOver10;

  el.useHome3000.disabled = !homeEligible;
  if (!homeEligible) el.useHome3000.checked = false;

  el.useReducedRate.disabled = !reducedEligible;
  if (!reducedEligible) el.useReducedRate.checked = false;
}

function updateRequiredHighlights() {
  const mustInputIds = ["salePrice", "holdingMode", "acquisitionDate", "transferDate"];
  for (const id of mustInputIds) {
    const node = el[id];
    if (!node) continue;
    const missing = String(node.value).trim() === "";
    node.classList.toggle("is-required-missing", missing);
  }

  const acquisitionCostKnown = getRadioValue("acquisitionCostKnown");
  const depreciationKnown = getRadioValue("depreciationKnown");

  for (const group of document.querySelectorAll(".required-group")) {
    const name = group.getAttribute("data-required-group");
    const radio = name ? getRadioValue(name) : "";
    let missing = radio === "";

    if (name === "depreciationKnown" && acquisitionCostKnown !== "yes") {
      missing = false;
    }

    group.classList.toggle("is-required-missing", missing);
  }

  const needsDepFields = acquisitionCostKnown === "yes" && depreciationKnown === "no";
  for (const id of ["structureType"]) {
    const node = el[id];
    if (!node) continue;
    const missing = needsDepFields && String(node.value).trim() === "";
    node.classList.toggle("is-required-missing", missing);
  }
}

function setupMoneyInputs() {
  for (const id of moneyInputIds) {
    const node = el[id];
    if (!node) continue;

    node.addEventListener("focus", () => {
      if (String(node.value).trim() === "") return;
      node.value = String(parseNumber(node.value));
    });

    node.addEventListener("blur", () => {
      if (String(node.value).trim() === "") {
        calculate();
        return;
      }
      node.value = formatWithComma(parseNumber(node.value));
      calculate();
    });

    if (String(node.value).trim() !== "") {
      node.value = formatWithComma(parseNumber(node.value));
    }
  }
}

function init() {
  setupMoneyInputs();
  syncStructureRate();
  updateBranchingUI();

  for (const id of ids) {
    const node = el[id];
    if (!node) continue;
    node.addEventListener("input", () => {
      if (id === "structureType") syncStructureRate();
      updateBranchingUI();
      calculate();
    });
    node.addEventListener("change", () => {
      if (id === "structureType") syncStructureRate();
      updateBranchingUI();
      calculate();
    });
  }

  document.querySelectorAll('input[type="radio"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      updateBranchingUI();
      calculate();
    });
  });

  calculate();
}

init();
