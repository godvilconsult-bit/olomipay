'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, MessageCircle, Users, Loader2 } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import { useSocket } from '../../lib/useSocket';
import { timeAgo } from '../../lib/utils';

const API = process.env.NEXT_PUBLIC_API_URL;

async function chatApi(path: string, method = 'GET', body?: any) {
  const token = sessionStorage.getItem('olomipay_rt');
  const res = await fetch(`${API}/api/chat${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

function Avatar({ name, isOnline, size = 12 }: { name: string; isOnline?: boolean; size?: number }) {
  const initials = (name ?? '?').slice(0, 2).toUpperCase();
  const colors = ['bg-primary', 'bg-purple-500', 'bg-teal-500', 'bg-orange-500', 'bg-pink-500'];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div className="relative flex-shrink-0">
      <div className={`w-${size} h-${size} rounded-full ${color} flex items-center justify-center text-white font-bold text-sm`}>
        {initials}
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

  const [conversations,  setConversations]  = useState<any[]>([]);
  const [allUsers,       setAllUsers]       = useState<any[]>([]);
  const [searchResults,  setSearchResults]  = useState<any[]>([]);
  const [query,          setQuery]          = useState('');
  const [tab,            setTab]            = useState<'chats'|'people'>('chats');
  const [loading,        setLoading]        = useState(true);
  const [searching,      setSearching]      = useState(false);
  const [showSearch,     setShowSearch]     = useState(false);

  // Load conversations
  useEffect(() => {
    chatApi('/conversations').then(r => {
      if (r.success) setConversations(r.data.conversations ?? []);
      setLoading(false);
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

  // Search users
  useEffect(() => {
    if (!showSearch && tab !== 'people') return;
    const t = setTimeout(async () => {
      if (query.length === 0) {
        setSearchResults([]);
        return;
      }
      setSearching(true);
      const r = await chatApi(`/users/search?q=${encodeURIComponent(query)}`);
      if (r.success) setSearchResults(r.data.users ?? []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  // Real-time new messages
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
  }

  const displayedUsers = query.length >= 2 ? searchResults : allUsers;

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
        <div className="px-4 py-3 flex items-center gap-3">
          <h1 className="text-xl font-bold flex-1">Tuma Chat</h1>
          <button onClick={() => setShowSearch(s => !s)}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
            {showSearch ? <X size={20} /> : <Search size={20} />}
          </button>
        </div>

        {/* Search bar */}
        {showSearch && (
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 rounded-2xl px-4 py-2.5">
              <Search size={16} className="text-slate-400 flex-shrink-0" />
              <input autoFocus type="text" placeholder="Tafuta kwa jina au nambari..."
                value={query} onChange={e => setQuery(e.target.value)}
                className="bg-transparent flex-1 text-sm outline-none" />
              {query && <button onClick={() => setQuery('')}><X size={14} className="text-slate-400" /></button>}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-slate-100 dark:border-slate-800">
          {(['chats', 'people'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors border-b-2 ${
                tab === t
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}>
              {t === 'chats' ? <><MessageCircle size={16} /> Mazungumzo</> : <><Users size={16} /> Watu</>}
            </button>
          ))}
        </div>
      </div>

      {/* Search results overlay */}
      {showSearch && query.length >= 2 && (
        <div className="bg-white dark:bg-slate-900">
          {searching ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-slate-400" />
            </div>
          ) : searchResults.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">Hakuna mtumiaji aliyepatikana</div>
          ) : (
            searchResults.map(user => (
              <UserRow key={user.id} user={user} onChat={() => { setShowSearch(false); startChat(user.id); }} />
            ))
          )}
        </div>
      )}

      {/* Chats tab */}
      {(!showSearch || query.length < 2) && tab === 'chats' && (
        <>
          {loading ? (
            <div className="space-y-0">
              {[1,2,3,4,5].map(i => <ConvSkeleton key={i} />)}
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <MessageCircle size={36} className="text-primary" />
              </div>
              <h3 className="font-bold text-lg mb-2">Hakuna mazungumzo bado</h3>
              <p className="text-slate-400 text-sm mb-6">Bonyeza "Watu" kuona watu wote kwenye Tuma na uanze mazungumzo</p>
              <button onClick={() => setTab('people')} className="btn-primary px-8">
                Tafuta watu
              </button>
            </div>
          ) : (
            conversations.map(conv => {
              const other = conv.otherParticipants?.[0];
              const name  = conv.groupName ?? other?.displayName ?? other?.kycName ?? other?.phoneMasked ?? 'Unknown';
              const unread = conv.unreadCount ?? 0;
              return (
                <button key={conv.id} onClick={() => router.push(`/chat/${conv.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-left">
                  <Avatar name={name} isOnline={other?.isOnline} size={12} />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-0.5">
                      <p className={`text-sm truncate ${unread > 0 ? 'font-bold' : 'font-medium'}`}>{name}</p>
                      <p className="text-xs text-slate-400 flex-shrink-0 ml-2">
                        {conv.lastMessageAt ? timeAgo(conv.lastMessageAt) : ''}
                      </p>
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

      {/* People tab */}
      {(!showSearch || query.length < 2) && tab === 'people' && (
        <>
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 rounded-2xl px-4 py-2.5">
              <Search size={16} className="text-slate-400 flex-shrink-0" />
              <input type="text" placeholder="Tafuta kwa jina au nambari..."
                value={query} onChange={e => setQuery(e.target.value)}
                className="bg-transparent flex-1 text-sm outline-none" />
              {query && <button onClick={() => setQuery('')}><X size={14} className="text-slate-400" /></button>}
            </div>
          </div>

          {searching ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-slate-400" />
            </div>
          ) : displayedUsers.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Users size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Hakuna mtumiaji aliyepatikana</p>
            </div>
          ) : (
            <>
              {!query && (
                <p className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Watumiaji wote ({displayedUsers.length})
                </p>
              )}
              {displayedUsers.map(user => (
                <UserRow key={user.id} user={user} onChat={() => startChat(user.id)} />
              ))}
            </>
          )}
        </>
      )}

      <BottomNav />
    </div>
  );
}

function UserRow({ user, onChat }: { user: any; onChat: () => void }) {
  const name = user.displayName ?? user.kycName ?? user.phoneMasked;
  return (
    <button onClick={onChat}
      className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-left">
      <div className="relative flex-shrink-0">
        <div className={`w-12 h-12 rounded-full bg-primary flex items-center justify-center text-white font-bold`}>
          {name.slice(0, 2).toUpperCase()}
        </div>
        <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${user.isOnline ? 'bg-green-500' : 'bg-slate-300'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{name}</p>
        <p className="text-xs text-slate-400">{user.isOnline ? '🟢 Mtandaoni' : user.lastSeenAt ? `Alionekana ${timeAgo(user.lastSeenAt)}` : 'Mtumiaji wa Tuma'}</p>
      </div>
      <div className="bg-primary/10 text-primary text-xs font-semibold px-3 py-1.5 rounded-full">
        Chat
      </div>
    </button>
  );
}

function ConvSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-50">
      <div className="w-12 h-12 rounded-full bg-slate-100 animate-pulse flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-slate-100 rounded animate-pulse w-2/3" />
        <div className="h-3 bg-slate-100 rounded animate-pulse w-1/2" />
      </div>
    </div>
  );
}
