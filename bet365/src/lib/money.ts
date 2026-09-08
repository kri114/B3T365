const fmt = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format integer euro-cent amounts as a display string, e.g. €1,234.56 */
export function formatEuro(cents: number): string {
  return fmt.format(cents / 100);
}

/** Parse a user-entered euro amount ("12.50", "12,50") into cents. Returns null if invalid. */
export function parseEuroToCents(input: string): number | null {
  const cleaned = input.trim().replace(/[€\s]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(parseFloat(cleaned) * 100);
  if (!Number.isFinite(cents)) return null;
  return cents;
}

export const MIN_STAKE_CENTS = 10; // €0.10
export const MAX_STAKE_CENTS = 1_000_000_00; // €1,000,000
