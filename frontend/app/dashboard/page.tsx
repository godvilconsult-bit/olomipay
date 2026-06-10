'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, JikoUser, getAccessToken } from '../../lib/api';
import { Spinner } from '../../components/ui';
import { HouseholdHome } from '../../components/home/HouseholdHome';
import { RiderHome } from '../../components/home/RiderHome';
import { SupplierHome } from '../../components/home/SupplierHome';
import { AdminHome } from '../../components/home/AdminHome';

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<JikoUser | null>(null);

  useEffect(() => {
    if (!getAccessToken()) { router.replace('/auth/login'); return; }
    auth.me().then((r) => setUser(r.user)).catch(() => router.replace('/auth/login'));
  }, [router]);

  if (!user) return <div className="min-h-screen bg-sand dark:bg-background-dark"><Spinner /></div>;

  switch (user.role) {
    case 'HOUSEHOLD': return <HouseholdHome user={user} />;
    case 'RIDER':     return <RiderHome user={user} />;
    case 'SUPPLIER':  return <SupplierHome user={user} />;
    case 'ADMIN':     return <AdminHome user={user} />;
    default:          return <HouseholdHome user={user} />;
  }
}
