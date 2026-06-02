import {
  List, Datagrid, TextField, NumberField, DateField, FunctionField,
  useRecordContext, useRefresh, useNotify,
} from 'react-admin';
import { adminAction } from '../dataProvider';

function ResolveButton() {
  const record  = useRecordContext();
  const refresh = useRefresh();
  const notify  = useNotify();
  if (!record || record.status !== 'PENDING') return <span style={{ color: '#999' }}>—</span>;
  const run = async (status: 'CONFIRMED' | 'FAILED') => {
    try { await adminAction(`/transactions/${record.id}/resolve`, { status }); notify(`Marked ${status}`, { type: 'success' }); refresh(); }
    catch (e: any) { notify(e.message, { type: 'error' }); }
  };
  return (
    <span style={{ display: 'flex', gap: 4 }}>
      <button onClick={e => { e.stopPropagation(); run('CONFIRMED'); }}>✓</button>
      <button onClick={e => { e.stopPropagation(); run('FAILED'); }}>✕</button>
    </span>
  );
}

export const TransactionList = () => (
  <List perPage={50} sort={{ field: 'createdAt', order: 'DESC' }}>
    <Datagrid bulkActionButtons={false}>
      <DateField source="createdAt" label="Date" showTime />
      <TextField source="type" />
      <FunctionField label="Status" render={(r: any) => (
        <span style={{
          padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600,
          background: r.status === 'CONFIRMED' ? '#dcfce7' : r.status === 'FAILED' ? '#fee2e2' : '#fef9c3',
          color:      r.status === 'CONFIRMED' ? '#166534' : r.status === 'FAILED' ? '#991b1b' : '#854d0e',
        }}>{r.status}</span>
      )} />
      <NumberField source="amountUsdc" label="USD" options={{ minimumFractionDigits: 2 }} />
      <TextField source="memo" />
      <ResolveButton />
    </Datagrid>
  </List>
);
