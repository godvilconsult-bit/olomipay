'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, JikoUser, getAccessToken } from '../../lib/api';
import { Spinner } from '../../components/ui';
import { HouseholdHome } from '../../components/home/HouseholdHome';
import { RiderHome } from '../../components/home/RiderHome';
import { SupplierHome } from '../../components/home/SupplierHome';
import { AdminHome } from '../../components/home/AdminHome';
import { DistributorHome } from '../../components/home/DistributorHome';
import { BrandHome } from '../../components/home/BrandHome';
import { LocationGate } from '../../components/LocationGate';
import { NotificationListener } from '../../components/NotificationListener';

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<JikoUser | null>(null);

  useEffect(() => {
    if (!getAccessToken()) { router.replace('/auth/login'); return; }
    auth.me().then((r) => setUser(r.user)).catch(() => router.replace('/auth/login'));
  }, [router]);

  if (!user) return <div className="min-h-screen bg-sand"><Spinner /></div>;

  const home = user.role === 'RIDER' ? <RiderHome user={user} />
    : user.role === 'SUPPLIER' ? <SupplierHome user={user} />
    : user.role === 'ADMIN' ? <AdminHome user={user} />
    : user.role === 'DISTRIBUTOR' ? <DistributorHome user={user} />
    : user.role === 'BRAND' ? <BrandHome user={user} />
    : <HouseholdHome user={user} />;

  // Admin/distributor/brand work without GPS; everyone else needs location for maps +
  // live tracking, so the gate takes over the screen until permission is granted.
  const noGate = user.role === 'ADMIN' || user.role === 'DISTRIBUTOR' || user.role === 'BRAND';
  return <>
    {noGate ? home : <LocationGate>{home}</LocationGate>}
    <NotificationListener />
  </>;
}
