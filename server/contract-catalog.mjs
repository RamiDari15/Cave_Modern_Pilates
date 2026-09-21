// Field definitions: Mindbody Public API v6 Contract and AutopaySchedule models.
// https://github.com/mindbody/Mindbody-API-SDKs/tree/main/PublicAPI
const AMOUNT_FIELDS = [
  "FirstPaymentAmountSubtotal", "FirstPaymentAmountTax", "FirstPaymentAmountTotal",
  "RecurringPaymentAmountSubtotal", "RecurringPaymentAmountTax", "RecurringPaymentAmountTotal",
  "TotalContractAmountSubtotal", "TotalContractAmountTax", "TotalContractAmountTotal",
  "PromoPaymentAmountSubtotal", "PromoPaymentAmountTax", "PromoPaymentAmountTotal",
  "DepositAmount", "DiscountAmount"
];

function amount(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function count(value, allowZero = false) {
  const number = amount(value);
  return Number.isSafeInteger(number) && number >= (allowZero ? 0 : 1) ? number : null;
}

function text(value) {
  return typeof value === "string" && value.trim() ? value : null;
}

function boolean(value) {
  return typeof value === "boolean" ? value : null;
}

export function normalizeMindbodyContract(contract) {
  const autopayEnabled = boolean(contract.AutopayEnabled);
  const autopayTriggerType = text(contract.AutopayTriggerType);
  const schedule = contract.AutopaySchedule;
  const autopaySchedule = schedule && typeof schedule === "object" && !Array.isArray(schedule)
    ? {
      frequencyType: text(schedule.FrequencyType),
      frequencyValue: count(schedule.FrequencyValue),
      frequencyTimeUnit: text(schedule.FrequencyTimeUnit)
    }
    : null;
  const numberOfAutopays = count(contract.NumberOfAutopays);
  let billingPeriod = null;
  let billingInterval = null;
  let commitmentMonths = null;

  if (autopayEnabled === true && autopayTriggerType === "OnSetSchedule") {
    if (autopaySchedule?.frequencyType === "MonthToMonth") {
      // Mindbody leaves FrequencyValue and FrequencyTimeUnit null in this mode.
      billingPeriod = "month";
      billingInterval = 1;
    } else if (autopaySchedule?.frequencyType === "SetNumberOfAutopays" && autopaySchedule.frequencyValue) {
      billingPeriod = { Weekly: "week", Monthly: "month", Yearly: "year" }[autopaySchedule.frequencyTimeUnit] || null;
      billingInterval = billingPeriod ? autopaySchedule.frequencyValue : null;
      // NumberOfAutopays counts payments; it cannot independently establish months.
      if (billingPeriod === "month" && numberOfAutopays) {
        const months = numberOfAutopays * billingInterval;
        commitmentMonths = Number.isSafeInteger(months) ? months : null;
      }
    }
  }

  const amounts = Object.fromEntries(AMOUNT_FIELDS.map((key) => [
    key[0].toLowerCase() + key.slice(1), amount(contract[key])
  ]));
  const displayAmount = autopayEnabled === true
    ? amounts.recurringPaymentAmountTotal
    : autopayEnabled === false ? amounts.firstPaymentAmountTotal : null;

  return {
    id: String(contract.Id ?? contract.ContractId ?? ""),
    kind: "contract",
    name: text(contract.Name) || text(contract.ContractName) || "",
    price: displayAmount === null ? "" : `$${displayAmount.toFixed(2)}`,
    description: text(contract.Description) || "",
    contractDetailsSource: "mindbody",
    // Preserve the business's exact terms. Never substitute cached or generated text.
    agreementTerms: typeof contract.AgreementTerms === "string" ? contract.AgreementTerms : "",
    requiresElectronicConfirmation: boolean(contract.RequiresElectronicConfirmation),
    autopayEnabled,
    autopaySchedule,
    autopayTriggerType,
    numberOfAutopays,
    billingPeriod,
    billingInterval,
    commitmentMonths,
    actionUponCompletionOfAutopays: text(contract.ActionUponCompletionOfAutopays),
    clientsChargedOn: text(contract.ClientsChargedOn),
    clientsChargedOnSpecificDate: text(contract.ClientsChargedOnSpecificDate),
    firstAutopayFree: boolean(contract.FirstAutopayFree),
    lastAutopayFree: boolean(contract.LastAutopayFree),
    numberOfPromoAutopays: count(contract.NumberOfPromoAutopays, true),
    ...amounts,
    sellOnline: true,
    requiresWaiver: true,
    requiresTerms: true
  };
}

// A checkout quote describes the exact supported schedule shown to the client.
// It is never used to override the provider's charge amount.
export function supportedMembershipQuote(contract) {
  if (!contract || typeof contract !== "object") return null;
  const soldOnline = contract.SellOnline ?? contract.SoldOnline ?? contract.IsSoldOnline ?? contract.AvailableOnline ?? contract.SellOnlineFlag;
  if (![true, "true", 1, "1"].includes(soldOnline)) return null;
  const item = normalizeMindbodyContract(contract);
  if (!item.agreementTerms.trim() || item.autopayEnabled !== true ||
      item.autopayTriggerType !== "OnSetSchedule" || item.billingPeriod !== "month" || item.billingInterval !== 1 ||
      item.autopaySchedule?.frequencyType !== "SetNumberOfAutopays" ||
      item.autopaySchedule?.frequencyValue !== 1 || item.autopaySchedule?.frequencyTimeUnit !== "Monthly" ||
      item.clientsChargedOn !== "OnSaleDate" ||
      !["ContractExpires", "ContractAutomaticallyRenews"].includes(item.actionUponCompletionOfAutopays)) return null;
  const months = item.commitmentMonths;
  if (!Number.isSafeInteger(months) || months < 1 || months >= 9999 || item.numberOfAutopays !== months ||
      item.depositAmount !== 0 || item.discountAmount !== 0 ||
      item.firstAutopayFree !== false || item.lastAutopayFree !== false) return null;

  const promoFields = ["PromoPaymentAmountSubtotal", "PromoPaymentAmountTax", "PromoPaymentAmountTotal"];
  const noPromoCount = contract.NumberOfPromoAutopays == null || count(contract.NumberOfPromoAutopays, true) === 0;
  const noPromoFields = promoFields.every((field) => contract[field] == null);
  const zeroPromo = promoFields.every((field) => amount(contract[field]) === 0);
  // Mindbody's optional promotional fields are absent on Cave's flat contracts.
  // Accept that shape only with zero fees/free payments and exact totals below.
  // Check raw fields so malformed values normalized to null cannot pass.
  if (!noPromoCount || (!noPromoFields && !zeroPromo)) return null;

  const totals = [item.firstPaymentAmountTotal, item.recurringPaymentAmountTotal, item.totalContractAmountTotal];
  const cents = (value) => Math.round(value * 100);
  if (!totals.every((value) => typeof value === "number" && Number.isFinite(value) && value > 0 &&
      Number.isSafeInteger(cents(value)) && Math.abs(value * 100 - cents(value)) < 0.000001) ||
      cents(totals[0]) !== cents(totals[1]) || cents(totals[2]) !== cents(totals[1]) * months) return null;

  return {
    agreementTerms: item.agreementTerms,
    firstPaymentAmountTotal: totals[0],
    recurringPaymentAmountTotal: totals[1],
    totalContractAmountTotal: totals[2],
    numberOfAutopays: item.numberOfAutopays,
    billingPeriod: item.billingPeriod,
    billingInterval: item.billingInterval,
    commitmentMonths: months,
    actionUponCompletionOfAutopays: item.actionUponCompletionOfAutopays
  };
}

export function membershipQuoteMatches(contract, submittedQuote) {
  const current = supportedMembershipQuote(contract);
  return Boolean(current && submittedQuote && typeof submittedQuote === "object" && !Array.isArray(submittedQuote) &&
    Object.entries(current).every(([key, value]) => submittedQuote[key] === value));
}
