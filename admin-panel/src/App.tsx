import { Admin, Resource } from 'react-admin';
import { dataProvider } from './dataProvider';
import { authProvider } from './authProvider';
import { Dashboard } from './Dashboard';
import { UserList, UserShow } from './resources/users';
import { TransactionList } from './resources/transactions';
import { AuditList } from './resources/audit';

export default function App() {
  return (
    <Admin dataProvider={dataProvider} authProvider={authProvider} dashboard={Dashboard} title="OlomiPay Admin">
      <Resource name="users"        list={UserList} show={UserShow} />
      <Resource name="transactions" list={TransactionList} />
      <Resource name="audit"        list={AuditList} options={{ label: 'Audit log' }} />
    </Admin>
  );
}
