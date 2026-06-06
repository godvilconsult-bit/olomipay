'use client';

/* Settings — WhatsApp-style hub of all account/app controls.
   Compact rows that link to existing functionality (nothing here changes
   money logic). The Appearance switcher is inline; the rest route to pages. */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, User, Shield, Bell, Lock, HelpCircle, FileText, Info,
  Briefcase, History, CreditCard, Globe, ChevronRight, LogOut, Smartphone,
} from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import ThemeToggle from '../../components/ThemeToggle';
import { auth } from '../../lib/api';

type Row = { icon: any; label: string; sub?: string; href?: string; danger?: boolean; onClick?: () => void };

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    auth.me().then(r => setUser(r?.user)).catch(() => router.replace('/auth/login'));
  }, []);

  function logout() {
    localStorage.clear();
    document.cookie = 'olomipay_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
    router.push('/');
  }

  const sections: { title: string; rows: Row[] }[] = [
    {
      title: 'Account',
      rows: [
        { icon: User,   label: 'Profile',          sub: 'Name, photo & wallet ID', href: '/profile' },
        { icon: Shield, label: 'KYC verification',  sub: 'Verify identity for higher limits', href: '/kyc' },
        { icon: Lock,   label: 'Security & PIN',    sub: 'Change PIN, account safety', href: '/profile' },
      ],
    },
    {
      title: 'Preferences',
      rows: [
        { icon: Bell,  label: 'Notifications', sub: 'Money & chat alerts', href: '/notifications' },
        { icon: Globe, label: 'Language',      sub: 'English', href: undefined },
      ],
    },
    {
      title: 'Money',
      rows: [
        { icon: History,    label: 'Transaction history', sub: 'Payments & transfers', href: '/history' },
        { icon: CreditCard, label: 'Deposit & withdraw',  sub: 'Add or cash out money', href: '/deposit' },
        { icon: Briefcase,  label: 'Business tools',       sub: 'Merchant & payroll', href: '/business' },
      ],
    },
    {
      title: 'Help',
      rows: [
        { icon: HelpCircle, label: 'Help & support', sub: 'Report a problem', href: '/support' },
        { icon: FileText,   label: 'Terms & privacy', sub: 'How we handle your data', href: undefined },
        { icon: Info,       label: 'About OlomiPay',  sub: 'Version & info', href: undefined },
      ],
    },
  ];

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-slate-100 dark:border-slate-800 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-1.5 -ml-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold">Settings</h1>
      </div>

      <div className="px-4 max-w-md mx-auto space-y-4 mt-3">
        {/* Identity card */}
        <button onClick={() => router.push('/profile')}
          className="w-full flex items-center gap-3 bg-white dark:bg-slate-800 rounded-2xl p-3 text-left">
          <div className="w-12 h-12 rounded-full bg-grad-brand flex items-center justify-center text-white font-bold">
            {(user?.kycName ?? 'O').slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{user?.kycName || 'OlomiPay User'}</p>
            <p className="text-xs text-slate-400 truncate">{user?.accountNo ?? user?.userTag ?? ''}</p>
          </div>
          <ChevronRight size={18} className="text-slate-400" />
        </button>

        {/* Appearance (inline) */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Appearance</p>
          <ThemeToggle />
        </div>

        {/* Sections */}
        {sections.map(sec => (
          <div key={sec.title}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-1 mb-1.5">{sec.title}</p>
            <div className="bg-white dark:bg-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-700">
              {sec.rows.map(row => {
                const Icon = row.icon;
                return (
                  <button key={row.label} onClick={() => row.onClick ? row.onClick() : row.href && router.push(row.href)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 active:scale-[0.99] transition">
                    <Icon size={18} className="text-primary flex-shrink-0" />
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-medium truncate">{row.label}</p>
                      {row.sub && <p className="text-xs text-slate-400 truncate">{row.sub}</p>}
                    </div>
                    {row.href && <ChevronRight size={16} className="text-slate-300 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Sign out */}
        <button onClick={logout}
          className="w-full flex items-center justify-center gap-2 bg-white dark:bg-slate-800 rounded-2xl py-3.5 text-danger font-medium">
          <LogOut size={18} /> Sign out
        </button>

        <p className="text-center text-[11px] text-slate-400 pt-1">OlomiPay · Money made simple</p>
      </div>

      <BottomNav />
    </div>
  );
}
