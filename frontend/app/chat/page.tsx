'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, MessageCircle, Users, Loader2, UserPlus, Share2, Phone, BookUser } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import { useSocket } from '../../lib/useSocket';
import { timeAgo } from '../../lib/utils';
import toast from 'react-hot-toast';
import { isContactPickerSupported, pickAndMatchContacts, type TumaContact } from '../../lib/useContacts';

const API = process.env.NEXT_PUBLIC_API_URL;

function getToken() {
  return localStorage.getItem('olomipay_at') || (localStorage.getItem('olomipay_at') || localStorage.getItem('olomipay_rt')) || '';
}
async function chatApi(path: string, method = 'GET', body?: any) {
  const r = await fetch(`${API}/api/chat${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}
async function inviteApi(path: string, method = 'GET', body?: any) {
  const r = await fetch(`${API}/api/invite${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
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
  const token  = typeof window !== 'undefined' ? getToken() : null;
  const { on } = useSocket(token);

  const [conversations,   setConversations]   = useState<any[]>([]);
  const [allUsers,        setAllUsers]        = useState<any[]>([]);
  const [searchResults,   setSearchResults]   = useState<any[]>([]);
  const [contacts,        setContacts]        = useState<TumaContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [contactsLoaded,  setContactsLoaded]  = useState(false);
  const [query,           setQuery]           = useState('');
  const [tab,             setTab]             = useState<'chats'|'people'>('chats');
  const [filter,          setFilter]          = useState<'all'|'unread'|'groups'>('all');
  const [loading,         setLoading]         = useState(true);
  const [searching,       setSearching]       = useState(false);
  const [inviteLink,      setInviteLink]      = useState('');
  const [phoneCheck,      setPhoneCheck]      = useState<{registered: boolean; user: any}|null>(null);
  const supportsContacts = typeof window !== 'undefined' && isContactPickerSupported();

  useEffect(() => {
    chatApi('/conversations').then(r => {
      if (r.success) setConversations(r.data.conversations ?? []);
      setLoading(false);
    });
    inviteApi('/link').then(r => { if (r.success) setInviteLink(r.data.link); });
  }, []);

  // Privacy: we no longer fetch the whole user directory. People are found by
  // searching name / phone / account number (handled by the query effect below).

  useEffect(() => {
    if (query.length === 0) { setSearchResults([]); setPhoneCheck(null); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      const cleanPhone = query.replace(/\s/g, '');
      const isPhone = /^\+?\d{7,15}$/.test(cleanPhone);
      if (isPhone) {
        let phone = cleanPhone;
        if (phone.startsWith('0')) phone = '+255' + phone.slice(1);
        if (!phone.startsWith('+')) phone = '+255' + phone;
        const r = await inviteApi(`/check/${encodeURIComponent(phone)}`);
        if (r.success) {
          setPhoneCheck(r.data);
          setSearchResults(r.data.user ? [r.data.user] : []);
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

  useEffect(() => {
    const u1 = on('new_message', (msg: any) => {
      setConversations(prev => {
        const idx = prev.findIndex(c => c.id === msg.conversationId);
        if (idx === -1) {
          // Unknown conversation — fetch it and prepend to list
          chatApi(`/conversations`).then(r => {
            if (r.success) setConversations(r.data.conversations ?? []);
          });
          return prev;
        }
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          lastMessageAt:      msg.createdAt,
          lastMessagePreview: msg.encryptedContent ?? '[Media]',
          unreadCount:        (updated[idx].unreadCount ?? 0) + 1,
        };
        const [item] = updated.splice(idx, 1);
        return [item, ...updated];
      });
    });

    // Someone started a new conversation with us — add it immediately
    const uNew = on('new_conversation', (conv: any) => {
      setConversations(prev => {
        if (prev.some(c => c.id === conv.id)) return prev; // already have it
        return [{ ...conv, unreadCount: 0 }, ...prev];
      });
    });

    // Global money events — show toasts even outside a chat window
    const u2 = on('money_received', ({ amount, from, asset }: any) => {
      toast.success(
        `💚 You received $${Number(amount).toFixed(2)} from ${from}`,
        { duration: 6000 }
      );
    });

    const u3 = on('deposit_confirmed', ({ amountUsdc, currency, amountLocal }: any) => {
      toast.success(`💚 Deposit confirmed! $${Number(amountUsdc).toFixed(2)}`, { duration: 6000 });
    });

    const u4 = on('money_sent', ({ amount, asset }: any) => {
      toast.success(
        `✅ Sent $${Number(amount).toFixed(2)}`,
        { duration: 4000 }
      );
    });

    return () => { u1(); uNew(); u2(); u3(); u4(); };
  }, [on]);

  async function startChat(userId: string, phone?: string) {
    const body = userId ? { toUserId: userId } : { toPhone: phone };
    const r = await chatApi('/conversations', 'POST', body);
    if (r.success) {
      const convId = r.data.conversation.id;
      // If new conversation, also add it to local list
      if (r.data.isNew) {
        setConversations(prev =>
          prev.some(c => c.id === convId) ? prev : [{ ...r.data.conversation, unreadCount: 0 }, ...prev]
        );
      }
      router.push(`/chat/${convId}`);
    } else {
      toast.error(r.error ?? 'Could not start chat');
    }
  }

  async function loadContacts() {
    if (!supportsContacts) { toast.error('Contact picker not supported on this browser.'); return; }
    setLoadingContacts(true);
    try {
      const matched = await pickAndMatchContacts();
      setContacts(matched);
      setContactsLoaded(true);
      if (matched.length === 0) toast('None of your contacts are on OlomiPay yet.', { icon: '📱' });
      else toast.success(`${matched.length} contacts found on OlomiPay!`);
    } catch (e: any) {
      toast.error('Could not load contacts. Try Chrome on Android.');
    } finally {
      setLoadingContacts(false);
    }
  }

  function shareInvite() {
    const msg = `Join me on OlomiPay — send money, chat, and do business instantly! ${inviteLink}`;
    if (navigator.share) navigator.share({ title: 'Join OlomiPay', text: msg, url: inviteLink });
    else { navigator.clipboard.writeText(msg); toast.success('Invite link copied!'); }
  }

  const displayedUsers = query.length >= 2 ? searchResults : [];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0a1120] pb-28">
      {/* Frosted translucent header — content scrolls behind it */}
      <div className="sticky top-0 z-40 bg-slate-50/80 dark:bg-[#0a1120]/75 backdrop-blur-2xl backdrop-saturate-150"
           style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        {/* Title row */}
        <div className="px-4 pt-2 pb-1 flex items-center gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight flex-1 text-slate-900 dark:text-white">
            {tab === 'chats' ? 'Chats' : 'People'}
          </h1>
          <button onClick={shareInvite}
            className="flex items-center gap-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 px-3 py-1.5 rounded-full text-xs font-semibold active:scale-95 transition-transform">
            <UserPlus size={14} /> Invite
          </button>
        </div>

        {/* Search bar — always visible, frosted */}
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 rounded-full bg-slate-200/70 dark:bg-white/10 px-4 py-2.5">
            <Search size={16} className="text-slate-400 flex-shrink-0" />
            <input value={query} onChange={e => setQuery(e.target.value)}
              placeholder={tab === 'chats' ? 'Search chats' : 'Search by name or phone'}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" />
            {query && <button onClick={() => setQuery('')}><X size={15} className="text-slate-400" /></button>}
          </div>
        </div>

        {/* Filter chips (chats tab) / tab toggle */}
        <div className="px-4 pb-2 flex items-center gap-2 overflow-x-auto thin-scroll">
          {tab === 'chats' ? (
            <>
              {([['all','All'],['unread','Unread'],['groups','Groups']] as const).map(([f, label]) => {
                const count = f === 'unread'
                  ? conversations.filter(c => (c.unreadCount ?? 0) > 0).length
                  : f === 'groups' ? conversations.filter(c => c.type === 'GROUP').length : 0;
                return (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                      filter === f ? 'bg-gradient-to-r from-blue-500 to-emerald-500 text-white' : 'bg-slate-200/70 dark:bg-white/10 text-slate-500 dark:text-slate-300'
                    }`}>
                    {label}{count > 0 ? ` ${count}` : ''}
                  </button>
                );
              })}
              <button onClick={() => setTab('people')}
                className="flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold bg-slate-200/70 dark:bg-white/10 text-slate-500 dark:text-slate-300 flex items-center gap-1">
                <Users size={13} /> People
              </button>
            </>
          ) : (
            <button onClick={() => setTab('chats')}
              className="flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold bg-gradient-to-r from-blue-500 to-emerald-500 text-white flex items-center gap-1">
              <MessageCircle size={13} /> Back to Chats
            </button>
          )}
        </div>
      </div>

      {/* ── CHATS TAB ── */}
      {tab === 'chats' && (
        loading ? (
          <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-slate-300" /></div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <MessageCircle size={36} className="text-primary" />
            </div>
            <h3 className="font-bold text-lg mb-2">No conversations yet</h3>
            <p className="text-slate-400 text-sm mb-6">Go to People tab to find OlomiPay users and start chatting</p>
            <button onClick={() => setTab('people')} className="btn-primary px-8">Find People</button>
            <button onClick={shareInvite} className="mt-3 flex items-center gap-2 text-sm text-primary">
              <Share2 size={14}/> Invite friends
            </button>
          </div>
        ) : (
          conversations.filter(conv => {
            // filter chip
            if (filter === 'unread' && (conv.unreadCount ?? 0) === 0) return false;
            if (filter === 'groups' && conv.type !== 'GROUP') return false;
            // search query
            if (query.trim()) {
              const o = conv.otherParticipants?.[0];
              const nm = (conv.groupName ?? o?.displayName ?? o?.kycName ?? o?.phoneMasked ?? '').toLowerCase();
              if (!nm.includes(query.toLowerCase())) return false;
            }
            return true;
          }).map(conv => {
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
                      {conv.lastMessagePreview ? '🔒 Encrypted message' : 'Tap to start chatting'}
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
        )
      )}

      {/* ── PEOPLE TAB ── */}
      {tab === 'people' && (
        <>
          {/* Phone not registered */}
          {phoneCheck && !phoneCheck.registered && (
            <div className="mx-4 mb-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <Phone size={18} className="text-amber-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm text-amber-800 mb-1">This number is not on OlomiPay</p>
                  <p className="text-xs text-amber-600 mb-3">Send them an invite link so they can join and chat with you</p>
                  <button onClick={() => {
                    const msg = `Hey! I'm inviting you to OlomiPay — send money and chat instantly. Join free: ${inviteLink}`;
                    if (navigator.share) navigator.share({ title: 'Join OlomiPay', text: msg, url: inviteLink });
                    else { navigator.clipboard.writeText(msg); toast.success('Invite message copied!'); }
                  }} className="flex items-center gap-2 bg-amber-500 text-white text-sm font-semibold px-4 py-2 rounded-xl">
                    <Share2 size={14}/> Send invite link
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Contacts section */}
          {!query && (
            <div className="mb-1">
              <div className="flex items-center justify-between px-4 py-2">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                  <BookUser size={12} /> Your Contacts
                </p>
                {supportsContacts && (
                  <button onClick={loadContacts} disabled={loadingContacts}
                    className="flex items-center gap-1.5 text-xs text-primary font-semibold">
                    {loadingContacts ? <><Loader2 size={12} className="animate-spin" /> Loading...</>
                      : contactsLoaded ? <><BookUser size={12} /> Refresh</>
                      : <><BookUser size={12} /> Sync contacts</>}
                  </button>
                )}
              </div>

              {!contactsLoaded && !loadingContacts && (
                <div className={`mx-4 mb-3 rounded-2xl p-4 ${supportsContacts ? 'bg-primary/5 border border-primary/10' : 'bg-slate-50 dark:bg-slate-800'}`}>
                  {supportsContacts ? (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                        <BookUser size={18} className="text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold">Find your contacts on OlomiPay</p>
                        <p className="text-xs text-slate-400 mt-0.5">See which of your saved contacts are already on OlomiPay</p>
                      </div>
                      <button onClick={loadContacts} className="bg-primary text-white text-xs font-bold px-3 py-2 rounded-xl flex-shrink-0">
                        Sync
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 text-center py-1">
                      📱 Open in Chrome on Android to sync contacts
                    </p>
                  )}
                </div>
              )}

              {contactsLoaded && contacts.length > 0 && (
                <>
                  <p className="px-4 pb-1 text-xs text-slate-400">{contacts.length} of your contacts are on OlomiPay</p>
                  {contacts.map(c => <ContactRow key={c.id} contact={c} onChat={() => startChat(c.id)} />)}
                  <div className="mx-4 my-2 border-b border-slate-100 dark:border-slate-800" />
                </>
              )}

              {contactsLoaded && contacts.length === 0 && (
                <div className="mx-4 mb-3 bg-slate-50 dark:bg-slate-800 rounded-2xl p-4 text-center">
                  <p className="text-sm text-slate-400">None of your contacts are on OlomiPay yet</p>
                  <button onClick={shareInvite} className="text-xs text-primary font-semibold mt-2">Invite them →</button>
                </div>
              )}
            </div>
          )}

          {/* All OlomiPay users */}
          {query.length < 2 ? (
            /* No directory browsing — prompt to search (privacy by design) */
            <div className="text-center py-12 px-8">
              <Search size={36} className="mx-auto mb-3 text-slate-200" />
              <p className="font-semibold text-slate-600 dark:text-slate-300">Find someone to pay or chat</p>
              <p className="text-sm text-slate-400 mt-1">Search by name, phone number, or their OlomiPay account number.</p>
            </div>
          ) : searching && displayedUsers.length === 0 ? (
            <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-slate-300" /></div>
          ) : displayedUsers.length === 0 ? (
            <div className="text-center py-10 px-8">
              <Users size={36} className="mx-auto mb-3 text-slate-200" />
              <p className="text-sm text-slate-400 mb-4">No user found for "{query}"</p>
              <button onClick={shareInvite} className="flex items-center gap-2 mx-auto text-sm text-primary font-semibold">
                <Share2 size={14}/> Invite them to OlomiPay
              </button>
            </div>
          ) : (
            <>
              {displayedUsers.map(user => {
                const name = user.displayName ?? user.kycName ?? user.phoneMasked;
                return (
                  <button key={user.id} onClick={() => startChat(user.id)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 text-left">
                    <Avatar name={name} isOnline={user.isOnline} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{name}</p>
                      <p className="text-xs text-slate-400">
                        {user.isOnline ? '🟢 Online now' : user.lastSeenAt ? `Last seen ${timeAgo(user.lastSeenAt)}` : 'OlomiPay user'}
                      </p>
                    </div>
                    <div className="bg-primary text-white text-xs font-semibold px-3 py-1.5 rounded-full flex-shrink-0">Chat</div>
                  </button>
                );
              })}
              {!query && (
                <div className="mx-4 my-4 bg-primary/5 rounded-2xl p-4 text-center">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Can't find someone?</p>
                  <p className="text-xs text-slate-400 mb-3">Invite them to join OlomiPay for free</p>
                  <button onClick={shareInvite}
                    className="flex items-center gap-2 mx-auto bg-primary text-white text-sm font-semibold px-5 py-2.5 rounded-xl">
                    <Share2 size={14}/> Share invite link
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

function ContactRow({ contact, onChat }: { contact: TumaContact; onChat: () => void }) {
  const colors = ['bg-primary','bg-purple-500','bg-teal-500','bg-orange-500','bg-pink-500','bg-indigo-500'];
  const color  = colors[contact.savedName.charCodeAt(0) % colors.length];
  return (
    <button onClick={onChat}
      className="w-full flex items-center gap-3 px-4 py-3 border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 text-left">
      <div className="relative flex-shrink-0">
        <div className={`w-12 h-12 rounded-full ${color} flex items-center justify-center text-white font-bold text-sm`}>
          {contact.savedName.slice(0, 2).toUpperCase()}
        </div>
        <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${contact.isOnline ? 'bg-green-500' : 'bg-slate-300'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate">{contact.savedName}</p>
        <p className="text-xs text-slate-400">
          {contact.kycName && contact.kycName !== contact.savedName ? `${contact.kycName} · ` : ''}
          {contact.isOnline ? '🟢 Online' : 'On OlomiPay'}
        </p>
      </div>
      <span className="bg-green-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full flex-shrink-0">Chat</span>
    </button>
  );
}
