'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, MessageCircle, Users, Loader2, UserPlus, Share2, Phone } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import { useSocket } from '../../lib/useSocket';
import { timeAgo } from '../../lib/utils';
import toast from 'react-hot-toast';

const API = process.env.NEXT_PUBLIC_API_URL;

function getToken() {
  return sessionStorage.getItem('olomipay_at') || sessionStorage.getItem('olomipay_rt') || '';
}

async function chatApi(path: string, method = 'GET', body?: any) {
  const res = await fetch(`${API}/api/chat${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function inviteApi(path: string) {
  const res = await fetch(`${API}/api/invite${path}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  return res.json();
}

function Avatar({ name, isOnline }: { name: string; isOnline?: boolean }) {
  const colors = ['bg-primary','bg-purple-500','bg-teal-500','bg-orange-500','bg-pink-500','bg-indigo-500'];
  const color  = colors[(name?.charCodeAt(0) ?? 0) % colors.length];
  return (
    <div className="relative flex-shrink-0">
      <div className={`w-12 h-12 rounded-full ${color} flex items-center justify-center text-white font-bold text-sm`}>
        {(name ?? '?').slice(0,2).toUpperCase()}
      </div>
      {isOnline !== undefined && (
        <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${isOnline ? 'bg-green-500' : 'bg-slate-300'}`} />
      )}
    </div>
  );
}

export default function ChatPage() {
  const router = useRouter();
  const token  = typeof window !== 'undefined' ? sessionStorage.getItem('olomipay_rt') : null;
  const { on } = useSocket(token);

  const [conversations, setConversations] = useState<any[]>([]);
  const [allUsers,      setAllUsers]      = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [query,         setQuery]         = useState('');
  const [tab,           setTab]           = useState<'chats'|'people'>('chats');
  const [loading,       setLoading]       = useState(true);
  const [searching,     setSearching]     = useState(false);
  const [inviteLink,    setInviteLink]    = useState('');
  const [phoneCheck,    setPhoneCheck]    = useState<{registered: boolean; user: any}|null>(null);
  const [checkingPhone, setCheckingPhone] = useState(false);

  useEffect(() => {
    chatApi('/conversations').then(r => {
      if (r.success) setConversations(r.data.conversations ?? []);
      setLoading(false);
    });
    // Pre-load invite link
    inviteApi('/link').then(r => {
      if (r.success) setInviteLink(r.data.link);
    });
  }, []);

  // Load all users when People tab opens
  useEffect(() => {
    if (tab === 'people' && allUsers.length === 0) {
      setSearching(true);
      chatApi('/users/search').then(r => {
        if (r.success) setAllUsers(r.data.users ?? []);
        setSearching(false);
      });
    }
  }, [tab]);

  // Search / phone check
  useEffect(() => {
    if (query.length === 0) { setSearchResults([]); setPhoneCheck(null); return; }

    const t = setTimeout(async () => {
      setSearching(true);

      // If looks like a phone number, check if registered
      const cleanPhone = query.replace(/\s/g, '');
      const isPhone = /^\+?\d{7,15}$/.test(cleanPhone);

      if (isPhone) {
        let phone = cleanPhone;
        if (phone.startsWith('0')) phone = '+255' + phone.slice(1);
        if (!phone.startsWith('+')) phone = '+255' + phone;

        setCheckingPhone(true);
        const r = await inviteApi(`/check/${encodeURIComponent(phone)}`);
        setCheckingPhone(false);
        if (r.success) {
          setPhoneCheck(r.data);
          if (r.data.user) setSearchResults([r.data.user]);
          else setSearchResults([]);
        }
      } else {
        setPhoneCheck(null);
        const r = await chatApi(`/users/search?q=${encodeURIComponent(query)}`);
        if (r.success) setSearchResults(r.data.users ?? []);
      }
      setSearching(false);
    }, 400);
    return () => clearTimeout(t);
  }, [query]);

  // Real-time updates
  useEffect(() => {
    return on('new_message', (msg: any) => {
      setConversations(prev => {
        const idx = prev.findIndex(c => c.id === msg.conversationId);
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = { ...updated[idx], lastMessageAt: msg.createdAt, unreadCount: (updated[idx].unreadCount ?? 0) + 1 };
        const [item] = updated.splice(idx, 1);
        return [item, ...updated];
      });
    });
  }, [on]);

  async function startChat(userId: string) {
    const r = await chatApi('/conversations', 'POST', { toUserId: userId });
    if (r.success) router.push(`/chat/${r.data.conversation.id}`);
    else toast.error(r.error ?? 'Failed to start chat');
  }

  function shareInvite() {
    const shareData = {
      title: 'Jiunge Tuma',
      text:  `Jiunge nami kwenye Tuma — tumia pesa haraka na kuzungumza! ${inviteLink}`,
      url:   inviteLink,
    };
    if (navigator.share) {
      navigator.share(shareData).catch(() => {});
    } else {
      navigator.clipboard.writeText(inviteLink);
      toast.success('Kiungo kimekopwa! Shiriki na marafiki.');
    }
  }

  const displayedUsers = query.length >= 2 ? searchResults : allUsers;

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
        <div className="px-4 py-3 flex items-center gap-3">
          <h1 className="text-xl font-bold flex-1">Tuma Chat</h1>
          <button onClick={shareInvite}
            className="flex items-center gap-1.5 bg-primary/10 text-primary px-3 py-1.5 rounded-full text-xs font-semibold">
            <UserPlus size={14} /> Alika
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 dark:border-slate-800">
          {(['chats','people'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 border-b-2 transition-colors ${
                tab === t ? 'border-primary text-primary' : 'border-transparent text-slate-400'
              }`}>
              {t === 'chats'
                ? <><MessageCircle size={15}/> Mazungumzo {conversations.filter(c => (c.unreadCount??0)>0).length > 0 && <span className="bg-primary text-white text-[9px] px-1.5 rounded-full">{conversations.reduce((s,c)=>s+(c.unreadCount??0),0)}</span>}</>
                : <><Users size={15}/> Watu ({allUsers.length})</>
              }
            </button>
          ))}
        </div>
      </div>

      {/* ── CHATS TAB ── */}
      {tab === 'chats' && (
        <>
          {loading ? (
            <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-slate-300" /></div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <MessageCircle size={36} className="text-primary" />
              </div>
              <h3 className="font-bold text-lg mb-2">Hakuna mazungumzo bado</h3>
              <p className="text-slate-400 text-sm mb-6">Nenda kwa "Watu" kuona watu wote kwenye Tuma</p>
              <button onClick={() => setTab('people')} className="btn-primary px-8">Tafuta watu</button>
              <button onClick={shareInvite} className="mt-3 flex items-center gap-2 text-sm text-primary">
                <Share2 size={14}/> Alika marafiki
              </button>
            </div>
          ) : (
            conversations.map(conv => {
              const other  = conv.otherParticipants?.[0];
              const name   = conv.groupName ?? other?.displayName ?? other?.kycName ?? other?.phoneMasked ?? 'Unknown';
              const unread = conv.unreadCount ?? 0;
              return (
                <button key={conv.id} onClick={() => router.push(`/chat/${conv.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 text-left">
                  <Avatar name={name} isOnline={other?.isOnline} />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-0.5">
                      <p className={`text-sm truncate ${unread > 0 ? 'font-bold' : 'font-medium'}`}>{name}</p>
                      <p className="text-xs text-slate-400 ml-2 flex-shrink-0">{conv.lastMessageAt ? timeAgo(conv.lastMessageAt) : ''}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-400 truncate">
                        {conv.lastMessagePreview ? '🔒 Ujumbe wa siri' : 'Gonga kuanza mazungumzo'}
                      </p>
                      {unread > 0 && (
                        <span className="flex-shrink-0 ml-2 bg-primary text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </>
      )}

      {/* ── PEOPLE TAB ── */}
      {tab === 'people' && (
        <>
          {/* Search bar */}
          <div className="px-4 py-3 sticky top-[105px] bg-white dark:bg-slate-900 z-30">
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 rounded-2xl px-4 py-2.5">
              <Search size={16} className="text-slate-400 flex-shrink-0" />
              <input type="text" placeholder="Tafuta jina au nambari ya simu..."
                value={query} onChange={e => setQuery(e.target.value)}
                className="bg-transparent flex-1 text-sm outline-none" />
              {searching && <Loader2 size={14} className="animate-spin text-slate-400 flex-shrink-0" />}
              {query && !searching && <button onClick={() => { setQuery(''); setPhoneCheck(null); }}><X size={14} className="text-slate-400" /></button>}
            </div>
          </div>

          {/* Phone not registered — show invite */}
          {phoneCheck && !phoneCheck.registered && (
            <div className="mx-4 mb-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <Phone size={18} className="text-amber-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm text-amber-800 dark:text-amber-400 mb-1">
                    Nambari hii haijajiandikisha Tuma
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-500 mb-3">
                    Tuma kiungo cha usajili ili waweze kujiunga na kuzungumza nawe
                  </p>
                  <button onClick={() => {
                    const msg = `Habari! Nikualike Tuma — app ya kutuma pesa na kuzungumza haraka. Jiunge bure: ${inviteLink}`;
                    if (navigator.share) navigator.share({ title: 'Jiunge Tuma', text: msg, url: inviteLink });
                    else { navigator.clipboard.writeText(msg); toast.success('Ujumbe wa mwaliko umekopwa!'); }
                  }}
                    className="flex items-center gap-2 bg-amber-500 text-white text-sm font-semibold px-4 py-2 rounded-xl">
                    <Share2 size={14}/> Tuma kiungo cha usajili
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Users list */}
          {searching && displayedUsers.length === 0 ? (
            <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-slate-300" /></div>
          ) : displayedUsers.length === 0 && query.length >= 2 ? (
            <div className="text-center py-10 px-8">
              <Users size={36} className="mx-auto mb-3 text-slate-200" />
              <p className="text-sm text-slate-400 mb-4">Hakuna mtumiaji "{query}" aliyepatikana</p>
              <button onClick={shareInvite}
                className="flex items-center gap-2 mx-auto text-sm text-primary font-semibold">
                <Share2 size={14}/> Alika {query} Tuma
              </button>
            </div>
          ) : (
            <>
              {!query && displayedUsers.length > 0 && (
                <p className="px-4 pt-1 pb-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Watumiaji {displayedUsers.length} wa Tuma
                </p>
              )}
              {displayedUsers.map(user => {
                const name = user.displayName ?? user.kycName ?? user.phoneMasked;
                return (
                  <button key={user.id} onClick={() => startChat(user.id)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-left">
                    <Avatar name={name} isOnline={user.isOnline} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{name}</p>
                      <p className="text-xs text-slate-400">
                        {user.isOnline ? '🟢 Mtandaoni sasa' : user.lastSeenAt ? `Alionekana ${timeAgo(user.lastSeenAt)}` : 'Mtumiaji wa Tuma'}
                      </p>
                    </div>
                    <div className="bg-primary text-white text-xs font-semibold px-3 py-1.5 rounded-full flex-shrink-0">
                      Chat
                    </div>
                  </button>
                );
              })}

              {/* Invite section at bottom */}
              {!query && (
                <div className="mx-4 my-4 bg-primary/5 rounded-2xl p-4 text-center">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Rafiki yako hayupo hapa?</p>
                  <p className="text-xs text-slate-400 mb-3">Walika wajiunga Tuma bure</p>
                  <button onClick={shareInvite}
                    className="flex items-center gap-2 mx-auto bg-primary text-white text-sm font-semibold px-5 py-2.5 rounded-xl">
                    <Share2 size={14}/> Shiriki kiungo cha mwaliko
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      <BottomNav />
    </div>
  );
}
