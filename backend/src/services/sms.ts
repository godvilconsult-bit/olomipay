/**
 * SMS fallback. Works without data/push so riders get job alerts and households
 * get their delivery code even on a feature phone or dead connection.
 *
 * Provider-pluggable via JIKO_SMS_PROVIDER. Defaults to a mock that logs, so
 * the flow is testable offline. Set JIKO_SMS_PROVIDER=beem (+ creds) to go live.
 */
import axios from 'axios';

const MODE = (process.env.JIKO_SMS_PROVIDER ?? 'mock').toLowerCase();

/** Normalise a Tanzanian number to MSISDN (255XXXXXXXXX). */
function msisdn(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.startsWith('255')) return d;
  if (d.startsWith('0')) return '255' + d.slice(1);
  if (d.length === 9) return '255' + d;
  return d;
}

export async function sendSms(phone: string, message: string): Promise<void> {
  const to = msisdn(phone);
  try {
    if (MODE === 'beem' && process.env.BEEM_API_KEY && process.env.BEEM_SECRET) {
      const auth = Buffer.from(`${process.env.BEEM_API_KEY}:${process.env.BEEM_SECRET}`).toString('base64');
      await axios.post('https://apisms.beem.africa/v1/send', {
        source_addr: process.env.BEEM_SENDER ?? 'JIKO',
        encoding: 0, schedule_time: '', message,
        recipients: [{ recipient_id: 1, dest_addr: to }],
      }, { headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' }, timeout: 10_000 });
      return;
    }
    if (MODE === 'africastalking' && process.env.AT_API_KEY && process.env.AT_USERNAME) {
      await axios.post('https://api.africastalking.com/version1/messaging',
        new URLSearchParams({ username: process.env.AT_USERNAME, to: '+' + to, message, from: process.env.AT_SENDER ?? '' }).toString(),
        { headers: { apiKey: process.env.AT_API_KEY, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, timeout: 10_000 });
      return;
    }
  } catch (e: any) {
    console.error('[sms] send failed:', e?.response?.data ?? e?.message);
    return; // never let SMS failure break the request flow
  }
  console.log(`[sms:mock] → ${to}: ${message}`);
}
