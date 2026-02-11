import * as dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import { MiioPacket } from './packet.js';

const MIIO_PORT = 54321;
const DEFAULT_TIMEOUT = 5000;

export interface TransportOptions {
  /** Device IP address. */
  address: string;
  /** Device token (16-byte Buffer). */
  token: Buffer;
  /** Command timeout in milliseconds. Default: 5000. */
  timeout?: number | undefined;
  /** Optional factory for creating the UDP socket (for testing). */
  createSocket?: (() => dgram.Socket) | undefined;
}

/**
 * UDP transport layer for the miIO protocol.
 *
 * Handles socket management, handshake, command sending,
 * and response correlation via message IDs.
 */
export class MiioTransport extends EventEmitter {
  private readonly address: string;
  private readonly token: Buffer;
  private readonly timeout: number;
  private readonly createSocket: () => dgram.Socket;

  private socket: dgram.Socket | null = null;
  private deviceId = 0;
  private stamp = 0;
  private lastHandshake = 0;
  private messageId = 1;

  private readonly pendingRequests = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();

  constructor(options: TransportOptions) {
    super();
    this.address = options.address;
    this.token = options.token;
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this.createSocket = options.createSocket ?? (() => dgram.createSocket('udp4'));
  }

  /** Perform the initial handshake to discover the device. */
  async handshake(): Promise<{ deviceId: number; stamp: number }> {
    const socket = this.ensureSocket();
    const hello = MiioPacket.createHello();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Handshake timeout after ${this.timeout}ms`));
      }, this.timeout);

      const onMessage = (msg: Buffer): void => {
        clearTimeout(timer);
        socket.removeListener('message', onMessage);

        try {
          const { deviceId, stamp } = MiioPacket.decode(msg, this.token);
          this.deviceId = deviceId;
          this.stamp = stamp;
          this.lastHandshake = Date.now();
          resolve({ deviceId, stamp });
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      };

      socket.on('message', onMessage);
      socket.send(hello, 0, hello.length, MIIO_PORT, this.address);
    });
  }

  /** Send a miIO JSON-RPC command and wait for the response. */
  async send(method: string, params: unknown[] = []): Promise<unknown> {
    // Re-handshake if stale (older than 60 seconds)
    if (Date.now() - this.lastHandshake > 60_000) {
      await this.handshake();
    }

    const id = this.messageId++;
    this.stamp++;

    const payload = { id, method, params };
    const packet = MiioPacket.encode(this.deviceId, this.stamp, this.token, payload);
    const socket = this.ensureSocket();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Command '${method}' timed out after ${this.timeout}ms`));
      }, this.timeout);

      this.pendingRequests.set(id, { resolve, reject, timer });
      socket.send(packet, 0, packet.length, MIIO_PORT, this.address);
    });
  }

  /** Close the UDP socket and clean up. */
  destroy(): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Transport destroyed'));
      this.pendingRequests.delete(id);
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  private ensureSocket(): dgram.Socket {
    if (this.socket) return this.socket;

    const socket = this.createSocket();
    socket.on('message', (msg) => { this.handleMessage(msg); });
    socket.on('error', (err) => { this.emit('error', err); });
    this.socket = socket;
    return socket;
  }

  private handleMessage(data: Buffer): void {
    try {
      const { payload } = MiioPacket.decode(data, this.token);
      if (payload && typeof payload === 'object' && 'id' in payload) {
        const response = payload as { id: number; result?: unknown; error?: { code: number; message: string } };
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRequests.delete(response.id);

          if (response.error) {
            pending.reject(new Error(`miIO error ${response.error.code}: ${response.error.message}`));
          } else {
            pending.resolve(response.result);
          }
        }
      }
    } catch {
      // Ignore malformed packets
    }
  }
}
