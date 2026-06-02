import {
  List, Datagrid, TextField, BooleanField, DateField, Show, SimpleShowLayout,
  FunctionField, SearchInput, useRecordContext, useRefresh, useNotify, TopToolbar,
} from 'react-admin';
import { useState } from 'react';
import { adminAction } from '../dataProvider';

const userFilters = [<SearchInput key="q" source="q" alwaysOn placeholder="Phone or name" />];

export const UserList = () => (
  <List filters={userFilters} perPage={25} sort={{ field: 'createdAt', order: 'DESC' }}>
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <TextField source="kycName" label="Name" />
      <TextField source="phone" />
      <TextField source="kycStatus" label="KYC" />
      <BooleanField source="isAdmin" label="Admin" />
      <DateField source="createdAt" label="Joined" />
    </Datagrid>
  </List>
);

// ── Support action buttons (Customer 360) ──────────────────────────────────────
function SupportActions() {
  const record  = useRecordContext();
  const refresh = useRefresh();
  const notify  = useNotify();
  const [pin, setPin] = useState('');
  if (!record) return null;

  const run = async (fn: () => Promise<any>, ok: string) => {
    try { await fn(); notify(ok, { type: 'success' }); refresh(); }
    catch (e: any) { notify(e.message ?? 'Failed', { type: 'error' }); }
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '8px 0' }}>
      <button onClick={() => run(() => adminAction(`/users/${record.id}/role`, { isAdmin: !record.isAdmin }), 'Role updated')}>
        {record.isAdmin ? 'Revoke admin' : 'Make admin'}
      </button>
      <button onClick={() => run(() => adminAction(`/users/${record.id}/block`), 'Account frozen')}>Freeze</button>
      <button onClick={() => run(() => adminAction(`/users/${record.id}/unblock`), 'Account unfrozen')}>Unfreeze</button>
      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
        <input placeholder="New 6-digit PIN" value={pin} maxLength={6}
          onChange={e => setPin(e.target.value.replace(/\D/g, ''))} style={{ width: 120 }} />
        <button disabled={pin.length !== 6}
          onClick={() => run(async () => { await adminAction(`/users/${record.id}/reset-pin`, { newPin: pin }); setPin(''); }, 'PIN reset — wallet preserved')}>
          Reset PIN
        </button>
      </span>
    </div>
  );
}

export const UserShow = () => (
  <Show actions={<TopToolbar><SupportActions /></TopToolbar>}>
    <SimpleShowLayout>
      <TextField source="kycName" label="Name" />
      <TextField source="phone" />
      <TextField source="kycStatus" label="KYC status" />
      <BooleanField source="isAdmin" />
      <BooleanField source="isFeeCollector" />
      <BooleanField source="activationFeePaid" label="Activation paid" />
      <TextField source="stellarPubKey" label="Wallet address" />
      <FunctionField label="Wallet recoverable" render={(r: any) => r._full?.walletDeterministic ? '✓ deterministic (recoverable)' : '⚠ legacy address'} />
      <FunctionField label="Balance" render={(r: any) => r._full ? `$${parseFloat(r._full.balance?.usdc ?? 0).toFixed(2)} · ${parseFloat(r._full.balance?.xlm ?? 0).toFixed(2)} XLM` : '—'} />
      <DateField source="createdAt" label="Joined" showTime />
    </SimpleShowLayout>
  </Show>
);
