type Status = 'PENDING' | 'CONFIRMED' | 'FAILED' | 'APPROVED' | 'REJECTED';

const MAP: Record<Status, { label: string; cls: string }> = {
  PENDING:   { label: 'Pending',   cls: 'badge-pending'   },
  CONFIRMED: { label: 'Confirmed', cls: 'badge-confirmed' },
  FAILED:    { label: 'Failed',    cls: 'badge-failed'    },
  APPROVED:  { label: 'Approved',  cls: 'badge-confirmed' },
  REJECTED:  { label: 'Rejected',  cls: 'badge-failed'    },
};

export default function StatusBadge({ status }: { status: Status }) {
  const { label, cls } = MAP[status] ?? { label: status, cls: 'badge-pending' };
  return <span className={cls}>{label}</span>;
}
