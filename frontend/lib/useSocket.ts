'use client';

import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { getAccessToken } from './api';

// Singleton socket — survives component unmounts
let _socket: Socket | null = null;

export function useSocket(token: string | null) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!token) return;
    // Reuse the existing singleton even if it's mid-reconnect — it has its own
    // retry logic. Only creating a 2nd socket when one exists would leak it.
    if (_socket) { socketRef.current = _socket; return; }

    _socket = io(process.env.NEXT_PUBLIC_API_URL!, {
      // Provide the token via a callback so EVERY (re)connect uses the freshest
      // token from storage. A static value would keep retrying with a token that
      // may have been rotated/refreshed — so after a drop (common on Android when
      // backgrounded or switching networks) the socket would never re-authenticate.
      auth:                  (cb: (d: { token: string | null }) => void) => cb({ token: getAccessToken() ?? token }),
      // Start with HTTP long-polling (works through every proxy / Android
      // WebView / restrictive mobile network) then transparently UPGRADE to
      // WebSocket. websocket-first would silently fail to connect on networks
      // that block the WS handshake → "messages don't get delivered on Android".
      transports:            ['polling', 'websocket'],
      upgrade:               true,
      reconnection:          true,
      reconnectionAttempts:  Infinity,   // NEVER give up — reconnect whenever the network returns
      reconnectionDelay:     1_000,
      reconnectionDelayMax:  5_000,       // capped backoff
      timeout:               20_000,
    });
    socketRef.current = _socket;

    _socket.on('connect', () => console.log('[socket] connected'));
    _socket.on('disconnect', (r) => console.log('[socket] disconnected:', r));
    _socket.on('connect_error', (e) => console.error('[socket] error:', e.message));

    // Reconnect INSTANTLY when the user brings the app to the foreground or the
    // network returns — don't wait out the reconnection backoff. This is what
    // makes pulling the phone from a pocket feel instant and avoids a stale
    // "offline" state.
    const kick = () => { if (_socket && !_socket.connected) _socket.connect(); };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kick(); });
    window.addEventListener('online', kick);
    window.addEventListener('focus', kick);

    // Cleanup: don't disconnect — keep alive app-wide
    return () => {};
  }, [token]);

  const emit = useCallback((event: string, data?: any) => {
    socketRef.current?.emit(event, data);
  }, []);

  const on = useCallback((event: string, handler: (...args: any[]) => void) => {
    socketRef.current?.on(event, handler);
    return () => { socketRef.current?.off(event, handler); };
  }, []);

  const off = useCallback((event: string, handler?: (...args: any[]) => void) => {
    socketRef.current?.off(event, handler);
  }, []);

  return {
    emit,
    on,
    off,
    connected: socketRef.current?.connected ?? false,
    socket:    socketRef.current,
  };
}

export function disconnectSocket() {
  _socket?.disconnect();
  _socket = null;
}
