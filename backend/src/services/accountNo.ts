/**
 * accountNo — the immutable public account number (OP-XXXX).
 *
 * Single source of truth for deriving the tag from a user's DB id, so the
 * value shown to users (BalanceCard), returned by /me, used by admin search,
 * and printed on reports is always identical.
 *
 * Deterministic: the same user id always yields the same OP-XXXX. The value is
 * also persisted to User.accountNo at registration (and backfilled on boot) so
 * it can be indexed/queried directly and never drifts.
 */
export function makeAccountNo(id: string): string {
  const clean = id.replace(/[^a-z0-9]/gi, '').toUpperCase();
  return `OP-${(clean.slice(-8) + clean.slice(0, 4)).slice(0, 8)}`;
}
