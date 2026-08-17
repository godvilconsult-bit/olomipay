'use client';

/**
 * Chrome for signed-in pages: header on top, role tabs at the bottom.
 *
 * The app's older screens each import AppHeader and RoleNav and hardcode the
 * role (`role="HOUSEHOLD"`), which only works when a page belongs to exactly one
 * role. The marketplace pages — Sell, Messages, Freight — are used by several,
 * so the role is resolved from the session instead.
 *
 * Without this, those three pages rendered with no nav at all: a user landing
 * on them had no way out except the browser's back button.
 */
import { ReactNode, useEffect, useState } from 'react';
import { auth, getAccessToken, type Role } from '../lib/api';
import { AppHeader } from './AppHeader';
import { RoleNav } from './RoleNav';

export default function AppShell(
  { title, subtitle, right, children }:
  { title: string; subtitle?: string; right?: ReactNode; children: ReactNode },
) {
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    if (!getAccessToken()) return;
    // Best-effort: if this fails the page still works, just without the tabs.
    auth.me().then(r => setRole(r.user?.role ?? null)).catch(() => {});
  }, []);

  return (
    <>
      <AppHeader title={title} subtitle={subtitle} right={right} />
      {children}
      {/* Only rendered once the role is known — a nav showing the wrong role's
          tabs is worse than a brief absence. */}
      {role && <RoleNav role={role} />}
    </>
  );
}
