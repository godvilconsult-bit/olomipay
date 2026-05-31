'use client';

import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

// Singleton socket — survives component unmounts
let _socket: Socket | null = null;

export function useSocket(token: string | null) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!token) return;
    if (_socket?.connected) { socketRef.current = _socket; return; }

    _socket = io(process.env.NEXT_PUBLIC_API_URL!, {
      auth:                { token },
      transports:          ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay:   1_000,
    });
    socketRef.current = _socket;

    _socket.on('connect', () => console.log('[socket] connected'));
    _socket.on('disconnect', (r) => console.log('[socket] disconnected:', r));
    _socket.on('connect_error', (e) => console.error('[socket] error:', e.message));

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
