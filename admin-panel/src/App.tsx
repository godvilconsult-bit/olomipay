import { Admin, Resource } from 'react-admin';
import { dataProvider } from './dataProvider';
import { authProvider } from './authProvider';
import { Dashboard } from './Dashboard';
import { UserList, UserShow } from './resources/users';
import { TransactionList } from './resources/transactions';
import { AuditList } from './resources/audit';
import { KycList } from './resources/kyc';
import { ApprovalsList } from './resources/approvals';
import { OpsList } from './resources/ops';
import { SupportList } from './resources/support';
import { TicketsList } from './resources/tickets';
import { SecurityList } from './resources/security';
import { WalletsList } from './resources/wallets';
import { StaffActivityList } from './resources/staff';
import LoginPage from './LoginPage';

export default function App() {
  return (
    <Admin dataProvider={dataProvider} authProvider={authProvider} dashboard={Dashboard} loginPage={LoginPage} title="OlomiPay Admin">
      <Resource name="support"      list={SupportList}   options={{ label: 'Support console' }} />
      <Resource name="tickets"      list={TicketsList}   options={{ label: 'Support tickets' }} />
      <Resource name="users"        list={UserList} show={UserShow} />
      <Resource name="transactions" list={TransactionList} />
      <Resource name="kyc"          list={KycList}       options={{ label: 'KYC review' }} />
      <Resource name="approvals"    list={ApprovalsList} options={{ label: 'Approvals' }} />
      <Resource name="ops"          list={OpsList}       options={{ label: 'Operations' }} />
      <Resource name="wallets"      list={WalletsList}   options={{ label: 'Wallets & gas' }} />
      <Resource name="audit"        list={AuditList}     options={{ label: 'Audit log' }} />
      <Resource name="staff-activity" list={StaffActivityList} options={{ label: 'Staff activity' }} />
      <Resource name="security"     list={SecurityList}  options={{ label: 'Security (2FA)' }} />
    </Admin>
  );
}
