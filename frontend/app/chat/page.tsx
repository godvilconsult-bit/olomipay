'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Plus, MessageCircle } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import { useSocket } from '../../lib/useSocket';
import { timeAgo } from '../../lib/utils';

async function chatApi(path: string, method = 'GET', body?: any) {
  const token = sessionStorage.getItem('olomipay_rt');
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chat${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

function OnlineDot({ isOnline }: { isOnline: boolean }) {
  return (
    <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${isOnline ? 'bg-success' : 'bg-slate-300'}`} />
  );
}

export default function ChatListPage() {
  const router  = useRouter();
  const token   = typeof window !== 'undefined' ? sessionStorage.getItem('olomipay_rt') : null;
  const { on }  = useSocket(token);
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading,  setLoading]   = useState(true);
  const [search,   setSearch]    = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  useEffect(() => {
    chatApi('/conversations').then(r => {
      if (r.success) setConversations(r.data.conversations);
      setLoading(false);
    });
  }, []);

  // Real-time: update conversation on new message
  useEffect(() => {
    const unsub = on('new_message', (msg: any) => {
      setConversations(prev => {
        const idx = prev.findIndex(c => c.id === msg.conversationId);
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          lastMessagePreview: msg.encryptedContent ?? '[Media]',
          lastMessageAt:      msg.createdAt,
          unreadCount:        (updated[idx].unreadCount ?? 0) + 1,
        };
        // Move to top
        const [item] = updated.splice(idx, 1);
        return [item, ...updated];
      });
    });
    return unsub;
  }, [on]);

  useEffect(() => {
    const unsub = on('user_online',  ({ userId }: any) => updatePresence(userId, true));
    const unsub2 = on('user_offline', ({ userId }: any) => updatePresence(userId, false));
    return () => { unsub(); unsub2(); };
  }, [on]);

  function updatePresence(userId: string, isOnline: boolean) {
    setConversations(prev => prev.map(c => ({
      ...c,
      otherParticipants: c.otherParticipants?.map((p: any) =>
        p.id === userId ? { ...p, isOnline } : p
      ),
    })));
  }

  async function handleSearch(q: string) {
    setSearch(q);
    if (q.length < 3) { setSearchResults([]); return; }
    const r = await chatApi(`/users/search?q=${encodeURIComponent(q)}`);
    if (r.success) setSearchResults(r.data.users);
  }

  async function startChat(toUserId: string) {
    const r = await chatApi('/conversations', 'POST', { toUserId });
    if (r.success) {
      router.push(`/chat/${r.data.conversation.id}`);
    }
  }

  const filtered = conversations.filter(c => {
    const name = c.groupName ?? c.otherParticipants?.[0]?.kycName ?? c.otherParticipants?.[0]?.phone ?? '';
    return name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-5 py-4 flex items-center gap-3">
        <h1 className="text-lg font-semibold flex-1">Mazungumzo</h1>
        <button onClick={() => setShowSearch(s => !s)}
          className="p-2 rounded-full hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <Search size={20} />
        </button>
        <button onClick={() => setShowSearch(true)}
          className="p-2 rounded-full hover:bg-slate-100 bg-primary/10 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <Plus size={20} className="text-primary" />
        </button>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="px-5 pt-3 pb-2 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
          <input type="text" placeholder="Tafuta kwa nambari au jina..." value={search}
            onChange={e => handleSearch(e.target.value)} autoFocus
            className="input text-sm" />
        </div>
      )}

      <div className="max-w-md mx-auto">
        {/* Search results */}
        {search.length >= 3 && searchResults.length > 0 && (
          <div className="bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">
            <p className="px-5 py-2 text-xs font-semibold text-slate-400 uppercase">Watumiaji</p>
            {searchResults.map(user => (
              <button key={user.id} onClick={() => startChat(user.id)}
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                    {(user.kycName ?? user.phone).slice(0, 1).toUpperCase()}
                  </div>
                  <OnlineDot isOnline={user.isOnline} />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-medium text-sm">{user.kycName ?? user.phone}</p>
                  <p className="text-xs text-slate-400">{user.phone}</p>
                </div>
                <span className="text-xs text-primary">Chat</span>
              </button>
            ))}
          </div>
        )}

        {/* Conversation list */}
        {loading ? (
          <div className="space-y-0">
            {[1,2,3,4].map(i => (
              <div key={i} className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse w-2/3" />
                  <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded animate-pulse w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <MessageCircle size={48} className="text-slate-200 dark:text-slate-700 mx-auto mb-4" />
            <p className="font-semibold text-slate-400">Hakuna mazungumzo bado</p>
            <p className="text-sm text-slate-400 mt-1 mb-6">Anza mazungumzo na mtu</p>
            <button onClick={() => setShowSearch(true)} className="btn-primary px-6">
              Zungumza na mtu
            </button>
          </div>
        ) : (
          filtered.map(conv => {
            const other = conv.otherParticipants?.[0];
            const name  = conv.groupName ?? other?.kycName ?? other?.phone ?? 'Unknown';
            const initials = name.slice(0, 2).toUpperCase();
            const isOnline = other?.isOnline ?? false;
            const hasUnread = (conv.unreadCount ?? 0) > 0;

            return (
              <button key={conv.id} onClick={() => router.push(`/chat/${conv.id}`)}
                className="w-full flex items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left">
                <div className="relative flex-shrink-0">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                    conv.type === 'GROUP' ? 'bg-purple-500' : 'bg-primary'
                  }`}>
                    {initials}
                  </div>
                  {conv.type === 'DIRECT' && <OnlineDot isOnline={isOnline} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className={`text-sm truncate ${hasUnread ? 'font-bold' : 'font-medium'}`}>{name}</p>
                    <p className="text-xs text-slate-400 flex-shrink-0 ml-2">
                      {conv.lastMessageAt ? timeAgo(conv.lastMessageAt) : ''}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-400 truncate">
                      {conv.lastMessagePreview ? '🔒 Ujumbe wa siri' : 'Anza mazungumzo'}
                    </p>
                    {hasUnread && (
                      <span className="flex-shrink-0 ml-2 bg-primary text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                        {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
      <BottomNav />
    </div>
  );
}
