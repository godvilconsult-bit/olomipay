import { List, Datagrid, TextField, DateField } from 'react-admin';

export const AuditList = () => (
  <List perPage={100} sort={{ field: 'createdAt', order: 'DESC' }} title="Audit log">
    <Datagrid bulkActionButtons={false} rowClick={false}>
      <DateField source="createdAt" label="When" showTime />
      <TextField source="adminPhone" label="Admin" />
      <TextField source="action" />
      <TextField source="targetType" label="Target" />
      <TextField source="targetId" label="Target ID" />
      <TextField source="detail" />
      <TextField source="ip" />
    </Datagrid>
  </List>
);
