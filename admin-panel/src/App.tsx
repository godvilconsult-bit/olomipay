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
import { StaffMgmtList } from './resources/staffmgmt';
import { MarketingList } from './resources/marketing';
import { HealthList } from './resources/health';
import { ReportsList } from './resources/reports';
import { AgentsList } from './resources/agents';
import LoginPage from './LoginPage';

// Each role/department only sees the menu items relevant to it.
export default function App() {
  return (
    <Admin dataProvider={dataProvider} authProvider={authProvider} dashboard={Dashboard} loginPage={LoginPage} title="OlomiPay Admin">
      {(permissions: string) => {
        const role    = String(permissions ?? '').toUpperCase();
        const isSuper = role === 'SUPER_ADMIN';
        const dept    = ['FINANCE', 'IT', 'SUPPORT', 'MARKETING'].find(d => role.startsWith(d + '_')) ?? '';
        const isHead  = /_HEAD$/.test(role);
        const can = (...depts: string[]) => isSuper || depts.includes(dept);

        return [
          // Support — support + finance(compliance)
          can('SUPPORT') && <Resource key="support"  name="support"  list={SupportList} options={{ label: 'Support console' }} />,
          can('SUPPORT') && <Resource key="tickets"  name="tickets"  list={TicketsList} options={{ label: 'Support tickets' }} />,
          can('SUPPORT') && <Resource key="agents"   name="agents"   list={AgentsList}  options={{ label: 'Cash agents' }} />,
          // Users / KYC — support + finance (PII-bearing; not marketing/IT)
          can('SUPPORT', 'FINANCE') && <Resource key="users" name="users" list={UserList} show={UserShow} />,
          can('SUPPORT', 'FINANCE') && <Resource key="kyc"   name="kyc"   list={KycList} options={{ label: 'KYC review' }} />,
          // Money — finance
          can('FINANCE') && <Resource key="transactions" name="transactions" list={TransactionList} />,
          can('FINANCE') && <Resource key="wallets"      name="wallets"      list={WalletsList} options={{ label: 'Wallets & gas' }} />,
          // Approvals — every admin (heads + super) can approve
          (isSuper || isHead) && <Resource key="approvals" name="approvals" list={ApprovalsList} options={{ label: 'Approvals' }} />,
          // Operations / system — finance + IT
          can('FINANCE', 'IT') && <Resource key="ops" name="ops" list={OpsList} options={{ label: 'Operations' }} />,
          // IT — audit + security
          can('IT') && <Resource key="audit"    name="audit"    list={AuditList}    options={{ label: 'Audit log' }} />,
          can('IT') && <Resource key="security" name="security" list={SecurityList} options={{ label: 'Security (2FA)' }} />,
          // Reports / exports — finance + super-admin
          can('FINANCE') && <Resource key="reports" name="reports" list={ReportsList} options={{ label: 'Reports & export' }} />,
          // Marketing — growth dashboard (no PII / money)
          can('MARKETING') && <Resource key="marketing" name="marketing" list={MarketingList} options={{ label: 'Marketing' }} />,
          // System health — visible to ALL staff
          <Resource key="health" name="health" list={HealthList} options={{ label: 'System health' }} />,
          // Staff accounts — super-admin + any head (heads manage their dept)
          (isSuper || isHead) && <Resource key="staff" name="staff" list={StaffMgmtList} options={{ label: 'Staff accounts' }} />,
          // Staff activity (internal-fraud lens) — super-admin only
          isSuper && <Resource key="staff-activity" name="staff-activity" list={StaffActivityList} options={{ label: 'Staff activity' }} />,
        ].filter(Boolean);
      }}
    </Admin>
  );
}
