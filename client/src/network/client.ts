import { CONFIG } from '@/config';
import { protocol } from './protocol';
import { MessageType, NetworkPlayerData } from '@/types';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

export interface NetworkCallbacks {
  onConnect: () => void;
  onDisconnect: () => void;
  onStateUpdate: (tick: number, players: NetworkPlayerData[]) => void;
  onPlayerJoin: (id: number, name: string, color: number) => void;
  onPlayerLeave: (id: number) => void;
  onRoomInfo: (roomId: string, playerCount: number, maxPlayers: number, yourId: number) => void;
  onError: (code: number, message: string) => void;
  onLatencyUpdate: (latency: number) => void;
}

export class NetworkClient {
  private ws: WebSocket | null = null;
  private callbacks: NetworkCallbacks;
  private state: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pingInterval: number | null = null;
  private lastLatency = 0;

  constructor(callbacks: NetworkCallbacks) {
    this.callbacks = callbacks;
  }

  get connectionState(): ConnectionState {
    return this.state;
  }

  get latency(): number {
    return this.lastLatency;
  }

  connect(): void {
    if (this.state !== 'disconnected') {
      return;
    }

    this.state = 'connecting';
    console.log('Connecting to', CONFIG.SERVER_URL);

    try {
      this.ws = new WebSocket(CONFIG.SERVER_URL);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
    } catch (error) {
      console.error('Failed to connect:', error);
      this.state = 'disconnected';
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.stopPingInterval();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.state = 'disconnected';
  }

  joinRoom(name: string, colorIndex: number): void {
    console.log('joinRoom called:', { name, colorIndex, state: this.state, ws: !!this.ws });
    if (this.state !== 'connected' || !this.ws) {
      console.warn('Cannot join room: not connected');
      return;
    }

    const message = protocol.encodeJoin(name, colorIndex);
    console.log('Sending join message, bytes:', new Uint8Array(message));
    this.ws.send(message);
  }

  sendInput(
    keys: { ArrowUp: boolean; ArrowDown: boolean; ArrowLeft: boolean; ArrowRight: boolean },
    steering: number,
    throttle: number
  ): void {
    if (this.state !== 'connected' || !this.ws) {
      return;
    }

    const message = protocol.encodeInput(keys, steering, throttle);
    this.ws.send(message);
  }

  leaveRoom(): void {
    if (this.state !== 'connected' || !this.ws) {
      return;
    }

    const message = protocol.encodeLeave();
    this.ws.send(message);
  }

  private handleOpen(): void {
    console.log('Connected to server');
    this.state = 'connected';
    this.reconnectAttempts = 0;
    this.startPingInterval();
    this.callbacks.onConnect();
  }

  private handleClose(event: CloseEvent): void {
    console.log('Disconnected from server:', event.code, event.reason);
    this.stopPingInterval();
    this.state = 'disconnected';
    this.ws = null;
    this.callbacks.onDisconnect();
    this.scheduleReconnect();
  }

  private handleError(event: Event): void {
    console.error('WebSocket error:', event);
  }

  private handleMessage(event: MessageEvent): void {
    const data = event.data as ArrayBuffer;
    const msgType = protocol.getMessageType(data);

    switch (msgType) {
      case MessageType.StateUpdate: {
        const { tick, players } = protocol.decodeStateUpdate(data);
        this.callbacks.onStateUpdate(tick, players);
        break;
      }

      case MessageType.PlayerJoin: {
        const { id, name, color } = protocol.decodePlayerJoin(data);
        this.callbacks.onPlayerJoin(id, name, color);
        break;
      }

      case MessageType.PlayerLeave: {
        const { id } = protocol.decodePlayerLeave(data);
        this.callbacks.onPlayerLeave(id);
        break;
      }

      case MessageType.RoomInfo: {
        const { roomId, playerCount, maxPlayers, yourId } = protocol.decodeRoomInfo(data);
        this.callbacks.onRoomInfo(roomId, playerCount, maxPlayers, yourId);
        break;
      }

      case MessageType.Pong: {
        const { latency } = protocol.decodePong(data);
        this.lastLatency = latency;
        this.callbacks.onLatencyUpdate(latency);
        break;
      }

      case MessageType.Error: {
        const { code, message } = protocol.decodeError(data);
        this.callbacks.onError(code, message);
        break;
      }
    }
  }

  private startPingInterval(): void {
    this.pingInterval = window.setInterval(() => {
      if (this.ws && this.state === 'connected') {
        const ping = protocol.encodePing();
        this.ws.send(ping);
      }
    }, 5000);
  }

  private stopPingInterval(): void {
    if (this.pingInterval !== null) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      if (this.state === 'disconnected') {
        this.connect();
      }
    }, delay);
  }
}
