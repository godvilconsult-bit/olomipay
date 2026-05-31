/** Format USDC amount to 2 decimal places with $ sign. */
export function formatUsdc(amount: number | string): string {
  return `$${Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Format TZS amount with comma separators. */
export function formatTzs(amount: number | string): string {
  return `TZS ${Number(amount).toLocaleString('en-TZ', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

/** Format XLM amount to 4 decimal places. */
export function formatXlm(amount: number | string): string {
  return `${Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })} XLM`;
}

/** Truncate a Stellar address for display: GABCD...WXYZ */
export function truncateAddress(address: string, chars = 4): string {
  if (address.length < chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/** Format Tanzania phone number for display: +255 712 345 678 */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('255') && digits.length === 12) {
    return `+${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  return phone;
}

/** Return how long ago a date was as a human-readable string. */
export function timeAgo(date: string | Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60)  return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/** Validate Tanzania phone number format. */
export function isValidTanzaniaPhone(phone: string): boolean {
  return /^\+255\d{9}$/.test(phone);
}

/** Validate Stellar address (G... 56 chars). */
export function isValidStellarAddress(addr: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(addr);
}

/** Determine if a string is a phone number or Stellar address. */
export function parseRecipient(input: string): 'phone' | 'stellar' | 'unknown' {
  if (isValidTanzaniaPhone(input)) return 'phone';
  if (isValidStellarAddress(input)) return 'stellar';
  return 'unknown';
}

/** Safe number parser — returns 0 on NaN/empty. */
export function parseAmount(value: string): number {
  const n = parseFloat(value.replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

/** Calculate 1% platform fee. */
export function calcFee(amount: number): { fee: number; net: number } {
  const fee = amount * 0.01;
  return { fee: +fee.toFixed(7), net: +(amount - fee).toFixed(7) };
}

/** Clamp a number between min and max. */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}
