/** Input formatting + validation helpers shared by the onboarding steps. */

/** Types digits into a `DD/MM/YYYY` mask. */
export function formatDobInput(text: string): string {
  const digits = text.replace(/[^0-9]/g, '').slice(0, 8);
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);

  if (digits.length <= 2) {
    return day;
  }
  if (digits.length <= 4) {
    return `${day}/${month}`;
  }
  return `${day}/${month}/${year}`;
}

/**
 * `YYYY-MM-DD` (or a full ISO timestamp) → the `DD/MM/YYYY` mask; `''` when
 * there is nothing parseable. The date part is taken literally rather than
 * through `Date`, so a timestamp never shifts a birthday across a timezone.
 */
export function isoToDob(iso?: string | null): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso?.trim() ?? '');
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

/** `DD/MM/YYYY` → `YYYY-MM-DD`, or `undefined` when incomplete/invalid. */
export function dobToIso(masked: string): string | undefined {
  if (!isValidDob(masked)) {
    return undefined;
  }
  const [day, month, year] = masked.split('/');
  return `${year}-${month}-${day}`;
}

/** True for a complete, real, past date that makes the driver 18+. */
export function isValidDob(masked: string): boolean {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(masked);
  if (!match) {
    return false;
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  const date = new Date(year, month - 1, day);
  const isRealDate =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;
  if (!isRealDate) {
    return false;
  }

  const eighteenthBirthday = new Date(year + 18, month - 1, day);
  return eighteenthBirthday <= new Date();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/** Aadhaar is 12 digits. */
export function isValidAadhaar(value: string): boolean {
  return /^\d{12}$/.test(value.replace(/\s/g, ''));
}

/**
 * The trailing four digits of an Aadhaar the backend returns **masked**, e.g.
 * `XXXXXXXX9518`. `''` when there is no number, or none ending in four digits.
 *
 * Also correct for an unmasked number: the driver then re-types the first eight
 * and the last four still match.
 */
export function aadhaarLast4(value?: string | null): string {
  const match = /(\d{4})$/.exec(value?.trim() ?? '');
  return match ? match[1] : '';
}

/** e.g. `BR01AB1234` — 2 letters, 1-2 digits, 1-3 letters, 1-4 digits. */
export function isValidVehicleNumber(value: string): boolean {
  return /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}$/.test(
    value.replace(/[\s-]/g, '').toUpperCase(),
  );
}

export function isValidYear(value: string): boolean {
  const year = Number(value);
  return /^\d{4}$/.test(value) && year >= 1950 && year <= currentYear() + 1;
}

export function isValidExpiryYear(value: string): boolean {
  const year = Number(value);
  return (
    /^\d{4}$/.test(value) && year >= currentYear() && year <= currentYear() + 30
  );
}

export function isValidMonth(value: string): boolean {
  const month = Number(value);
  return /^\d{1,2}$/.test(value) && month >= 1 && month <= 12;
}

export function currentYear(): number {
  return new Date().getFullYear();
}
