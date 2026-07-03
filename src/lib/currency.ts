// Client-portal currency formatting.
//
// Every account has its own configured currency (clients.currency_code, ISO 4217).
// We NEVER default to USD when the account is unconfigured — the UI must show
// that the currency is not set instead of silently blending currencies.

export type CurrencyCode = string; // ISO 4217, e.g. "USD", "CAD", "EUR"

export interface FormattedMoney {
  /** Display string, e.g. "$1,752.99" or "CA$29.73" or "1,752.99". */
  text: string;
  /** True when currency was not configured on the account. */
  unset: boolean;
}

/** Format an amount using the account's configured currency. */
export function formatMoney(amount: number | null | undefined, currency: CurrencyCode | null | undefined): FormattedMoney {
  const n = typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
  if (!currency) {
    // No configured currency — render the number without a symbol so the client
    // doesn't see a value labelled with the wrong currency.
    return { text: n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), unset: true };
  }
  try {
    return {
      text: new Intl.NumberFormat(undefined, { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(n),
      unset: false,
    };
  } catch {
    return {
      text: `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      unset: false,
    };
  }
}

/** Format a whole-number amount (e.g. spend rounded) in the account's currency. */
export function formatMoneyInt(amount: number | null | undefined, currency: CurrencyCode | null | undefined): FormattedMoney {
  const n = typeof amount === "number" && Number.isFinite(amount) ? Math.round(amount) : 0;
  if (!currency) {
    return { text: n.toLocaleString(), unset: true };
  }
  try {
    return {
      text: new Intl.NumberFormat(undefined, {
        style: "currency", currency, currencyDisplay: "narrowSymbol",
        maximumFractionDigits: 0, minimumFractionDigits: 0,
      }).format(n),
      unset: false,
    };
  } catch {
    return { text: `${currency} ${n.toLocaleString()}`, unset: false };
  }
}
