/**
 * useContacts — reads device contacts via Contact Picker API,
 * matches phone numbers against Tuma database, returns merged list
 * with the user's saved name shown instead of the registered name.
 *
 * Supported: Chrome Android 80+, Samsung Internet
 * Not supported: iOS Safari, Firefox, Desktop Chrome
 */

const API = process.env.NEXT_PUBLIC_API_URL;

export type TumaContact = {
  id:           string;      // OlomiPay user ID
  phone:        string;      // normalized E.164
  savedName:    string;      // name from phone's contacts
  kycName:      string | null;
  chatPublicKey: string | null;
  isOnline:     boolean;
  lastSeenAt:   string | null;
  isContact:    true;        // came from phonebook
};

function getToken() {
  return localStorage.getItem('olomipay_at') || localStorage.getItem('olomipay_rt') || '';
}

export function isContactPickerSupported(): boolean {
  return typeof navigator !== 'undefined' &&
    'contacts' in navigator &&
    'ContactsManager' in window;
}

/**
 * Open the native contact picker and return OlomiPay users
 * that match numbers in the user's phonebook.
 * Each result includes the contact's saved name.
 */
export async function pickAndMatchContacts(): Promise<TumaContact[]> {
  if (!isContactPickerSupported()) {
    throw new Error('Contact picker not supported on this device/browser');
  }

  // Ask for all contacts at once
  const raw = await (navigator as any).contacts.select(
    ['name', 'tel'],
    { multiple: true }
  ) as Array<{ name: string[]; tel: string[] }>;

  if (!raw || raw.length === 0) return [];

  // Build flat list of { savedName, phone }
  const entries: { savedName: string; phone: string }[] = [];
  for (const c of raw) {
    const savedName = c.name?.[0] ?? 'Unknown';
    for (const tel of c.tel ?? []) {
      entries.push({ savedName, phone: tel });
    }
  }

  const phones = entries.map(e => e.phone);

  // Ask backend which ones are registered on OlomiPay
  const res = await fetch(`${API}/api/invite/match-contacts`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body:    JSON.stringify({ phones }),
  });
  const data = await res.json();
  if (!data.success) return [];

  // Merge: for each matched user, find the saved name from contacts
  const normalize = (p: string) => {
    const c = p.replace(/[\s\-().+]/g, '');
    if (c.startsWith('0')   && c.length === 10) return '+255' + c.slice(1);
    if (c.startsWith('255') && c.length === 12) return '+' + c;
    if (c.startsWith('7')   && c.length === 9)  return '+255' + c;
    return '+' + c;
  };

  return (data.data.matches as any[]).map(user => {
    // Find the entry whose normalized phone matches this user's phone
    const entry = entries.find(e => normalize(e.phone) === user.phone);
    return {
      ...user,
      savedName: entry?.savedName ?? user.kycName ?? user.phone,
      isContact: true as const,
    };
  });
}

/**
 * Load ALL device contacts (no picker UI) and return Tuma matches.
 * Uses same Contact Picker API but selects all at once.
 */
export async function loadAllContacts(): Promise<TumaContact[]> {
  return pickAndMatchContacts();
}
