import { io, Socket } from 'socket.io-client';
import type { PlaybackState } from '@/types';

type StateCallback = (state: PlaybackState) => void;
type MetadataCallback = (data: { player: number; position: number }) => void;

class SocketClient {
  private socket: Socket | null = null;
  private stateCallbacks: Set<StateCallback> = new Set();
  private metadataCallbacks: Set<MetadataCallback> = new Set();

  connect() {
    if (this.socket?.connected) return;

    // In dev, Vite proxies /socket.io to backend
    // In prod, same origin
    this.socket = io({
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      console.log('Socket connected');
      this.socket?.emit('subscribe');
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    this.socket.on('state', (state: PlaybackState) => {
      console.log('Socket received state:', state);
      this.stateCallbacks.forEach((cb) => cb(state));
    });

    this.socket.on('metadata_updated', (data: { player: number; position: number }) => {
      this.metadataCallbacks.forEach((cb) => cb(data));
    });
  }

  disconnect() {
    this.socket?.emit('unsubscribe');
    this.socket?.disconnect();
    this.socket = null;
  }

  onStateChange(callback: StateCallback) {
    this.stateCallbacks.add(callback);
    return () => {
      this.stateCallbacks.delete(callback);
    };
  }

  onMetadataUpdate(callback: MetadataCallback) {
    this.metadataCallbacks.add(callback);
    return () => {
      this.metadataCallbacks.delete(callback);
    };
  }
}

export const socketClient = new SocketClient();
