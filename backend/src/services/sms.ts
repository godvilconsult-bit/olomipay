/**
 * SMS service using Africa's Talking API.
 * Falls back to console.log in dev mode.
 */

import axios from 'axios';

const IS_DEV = !process.env.AFRICAS_TALKING_API_KEY ||
               process.env.AFRICAS_TALKING_USERNAME === 'sandbox';

export async function sendSms(to: string, message: string): Promise<boolean> {
  if (IS_DEV) {
    console.log(`[SMS mock] To: ${to}\nMessage: ${message}`);
    return true;
  }

  try {
    const res = await axios.post(
      'https://api.africastalking.com/version1/messaging',
      new URLSearchParams({
        username: process.env.AFRICAS_TALKING_USERNAME!,
        to,
        message,
        from: 'OlomiPay',
      }).toString(),
      {
        headers: {
          'apiKey':       process.env.AFRICAS_TALKING_API_KEY!,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept':       'application/json',
        },
        timeout: 10_000,
      },
    );
    return res.data.SMSMessageData?.Recipients?.[0]?.status === 'Success';
  } catch (e: any) {
    console.error('[SMS] Failed to send:', e.message);
    return false;
  }
}

export function claimSmsMessage(senderPhone: string, amountUsdc: number, claimUrl: string): string {
  const amountTzs = Math.round(amountUsdc * 2600).toLocaleString();
  return (
    `OlomiPay: ${senderPhone} amekutumia $${amountUsdc.toFixed(2)} USDC ` +
    `(~TZS ${amountTzs}). Dai pesa yako hapa / Claim here: ${claimUrl} ` +
    `(Inaisha baada ya masaa 72 / Expires in 72 hours)`
  );
}
