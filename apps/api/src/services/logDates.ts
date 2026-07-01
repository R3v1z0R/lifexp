/** The effective date of a log: the passed occurredAt, or now. */
export function logDate(occurredAt?: Date): Date {
  return occurredAt ?? new Date();
}

/** UTC midnight of `d` as ISO, used for the daily-cap date bucket. */
export function dayStartIso(d: Date): string {
  const c = new Date(d);
  c.setUTCHours(0, 0, 0, 0);
  return c.toISOString();
}

/** The calendar day before a YYYY-MM-DD string, as YYYY-MM-DD. */
export function previousDateStr(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split("T")[0];
}

/** YYYY-MM-DD of a date (UTC). */
export function dateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}
