// Formatters shared by more than one view.
export const shortDate = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

const BYTE_UNITS = ["B", "kB", "MB", "GB"] as const;

// Decimal units (1000 steps), matching the free tier's decimal 10 GB.
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1000 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1000;
    unitIndex += 1;
  }
  // toPrecision then Number: three significant digits, no trailing zeros.
  return `${Number(value.toPrecision(3))} ${BYTE_UNITS[unitIndex] ?? "GB"}`;
}
