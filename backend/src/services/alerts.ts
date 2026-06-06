/**
 * Ops alerting — one place to raise operational alarms (gas low, reconciliation
 * shortfall, etc). Delivers to a Slack/Discord-compatible webhook and pushes to
 * the super-admin's device. Throttled per-key so it never spams.
 *
 * Configure (all optional): SLACK_ALERT_WEBHOOK (or OPS_ALERT_WEBHOOK).
 * No-op if nothing is configured — just logs.
 */
import { prisma } from '../lib/prisma';

const lastSent: Record<string, number> = {};
const COOLDOWN_MS = 3 * 60 * 60 * 1000; // re-alert the same issue at most every 3h

export async function sendOpsAlert(opts: {
  key: string;                 // throttle key, e.g. 'gas_low'
  title: string;
  message: string;
  severity?: 'info' | 'warn' | 'critical';
}): Promise<void> {
  const { key, title, message, severity = 'warn' } = opts;
  const now = Date.now();
  if (lastSent[key] && now - lastSent[key] < COOLDOWN_MS) return; // throttled
  lastSent[key] = now;

  const line = `[${severity.toUpperCase()}] ${title} — ${message}`;
  console.error('[ops-alert]', line);

  // 1) Slack / Discord-compatible incoming webhook
  const url = process.env.SLACK_ALERT_WEBHOOK || process.env.OPS_ALERT_WEBHOOK;
  if (url) {
    try {
      await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `🚨 OlomiPay ${line}` }),
      });
    } catch (e: any) { console.warn('[ops-alert] webhook failed:', e?.message); }
  }

  // 2) Push to the super-admin's device(s)
  try {
    const adminPhone = process.env.ADMIN_PHONE ?? '+255752401012';
    const variants = [adminPhone, adminPhone.replace(/^\+255/, '0'), '0' + adminPhone.replace(/^\+255/, '')];
    const admin = await prisma.user.findFirst({ where: { phone: { in: variants } }, select: { id: true } });
    if (admin) {
      const { sendPushToUser } = await import('./notifications');
      await sendPushToUser(admin.id, { title: `⚠️ ${title}`, body: message, type: 'ops_alert', data: { severity } });
    }
  } catch { /* best-effort */ }
}
