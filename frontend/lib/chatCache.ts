/**
 * IndexedDB cache for chat — instant load before API.
 */
import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'tuma-chat';
const DB_VERSION = 1;

let _db: IDBPDatabase | null = null;

async function getDb(): Promise<IDBPDatabase> {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('conversations')) {
        db.createObjectStore('conversations', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('messages')) {
        const store = db.createObjectStore('messages', { keyPath: 'id' });
        store.createIndex('byConversation', 'conversationId');
      }
    },
  });
  return _db;
}

export async function cacheConversations(conversations: any[]) {
  const db = await getDb();
  const tx = db.transaction('conversations', 'readwrite');
  await Promise.all(conversations.slice(0, 20).map(c => tx.store.put(c)));
  await tx.done;
}

export async function getCachedConversations(): Promise<any[]> {
  try {
    const db = await getDb();
    return await db.getAll('conversations');
  } catch {
    return [];
  }
}

export async function cacheMessages(conversationId: string, messages: any[]) {
  const db = await getDb();
  const tx = db.transaction('messages', 'readwrite');
  await Promise.all(messages.slice(-50).map(m => tx.store.put(m)));
  await tx.done;
}

export async function getCachedMessages(conversationId: string): Promise<any[]> {
  try {
    const db = await getDb();
    const all = await db.getAllFromIndex('messages', 'byConversation', conversationId);
    return all.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  } catch {
    return [];
  }
}

export async function clearChatCache() {
  const db = await getDb();
  await db.clear('conversations');
  await db.clear('messages');
}
