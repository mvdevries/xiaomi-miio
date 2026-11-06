import * as dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import { MiioPacket } from './packet.js';

const MIIO_PORT = 54321;
const DEFAULT_TIMEOUT = 1500;
const DEFAULT_RETRIES = 3;
const HANDSHAKE_MAX_AGE = 60_000;
const MAX_MESSAGE_ID = 10_000;
const RETRY_ID_STEP = 100;
const RECOVERABLE_ERROR_CODES = new Set([-30001, -9999]);

export interface TransportOptions {
  /** Device IP address. */
  address: string;
  /** Device token (16-byte Buffer). */
  token: Buffer;
  /** Command timeout in milliseconds. Default: 5000. */
  timeout?: number | undefined;
  retries?: number | undefined;
  /** Optional factory for creating the UDP socket (for testing). */
  createSocket?: (() => dgram.Socket) | undefined;
}

export interface SendOptions {
  retries?: number | undefined;
}

export class MiioTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MiioTimeoutError';
  }
}

export class MiioDeviceError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(`miIO error ${code}: ${message}`);
    this.name = 'MiioDeviceError';
    this.code = code;
  }

  get recoverable(): boolean {
    return RECOVERABLE_ERROR_CODES.has(this.code);
  }
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface HandshakeWaiter {
  resolve: (value: { deviceId: number; stamp: number }) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
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
  private readonly retries: number;
  private readonly createSocket: () => dgram.Socket;

  private socket: dgram.Socket | null = null;
  private deviceId = 0;
  private deviceStamp = 0;
  private stampReceivedAt = 0;
  private lastHandshake = 0;
  private lastId = 0;
  private handshakePromise: Promise<{ deviceId: number; stamp: number }> | null = null;
  private handshakeWaiter: HandshakeWaiter | null = null;
  private queue: Promise<void> = Promise.resolve();
  private active = 0;

  private readonly pendingRequests = new Map<number, PendingRequest>();

  constructor(options: TransportOptions) {
    super();
    this.address = options.address;
    this.token = options.token;
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this.retries = options.retries ?? DEFAULT_RETRIES;
    this.createSocket = options.createSocket ?? (() => dgram.createSocket('udp4'));
  }

  /** Perform the initial handshake to discover the device. */
  async handshake(): Promise<{ deviceId: number; stamp: number }> {
    if (this.handshakePromise) return this.handshakePromise;

    const promise = this.performHandshake().finally(() => {
      this.handshakePromise = null;
    });
    this.handshakePromise = promise;
    return promise;
  }

  /** Send a miIO JSON-RPC command and wait for the response. */
  async send(method: string, params: unknown[] = [], options: SendOptions = {}): Promise<unknown> {
    const retries = options.retries ?? this.retries;
    const run = (): Promise<unknown> => this.sendWithRetries(method, params, retries);
    this.active++;
    const started = this.active === 1 ? run() : this.queue.then(run, run);
    const result = started.finally(() => {
      this.active--;
    });
    this.queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  reset(): void {
    this.destroy();
    this.deviceStamp = 0;
    this.stampReceivedAt = 0;
    this.lastHandshake = 0;
  }

  /** Close the UDP socket and clean up. */
  destroy(): void {
    const error = new Error('Transport destroyed');

    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pendingRequests.delete(id);
    }

    if (this.handshakeWaiter) {
      const waiter = this.handshakeWaiter;
      this.handshakeWaiter = null;
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }

    this.closeSocket();
  }

  private performHandshake(): Promise<{ deviceId: number; stamp: number }> {
    const socket = this.ensureSocket();
    const hello = MiioPacket.createHello();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.handshakeWaiter = null;
        reject(new MiioTimeoutError(`Handshake timeout after ${this.timeout}ms`));
      }, this.timeout);

      this.handshakeWaiter = { resolve, reject, timer };

      socket.send(hello, 0, hello.length, MIIO_PORT, this.address, (err) => {
        if (err) this.failHandshake(err);
      });
    });
  }

  private async sendWithRetries(method: string, params: unknown[], retries: number): Promise<unknown> {
    let attemptsLeft = retries;
    let firstAttempt = true;

    for (;;) {
      try {
        if (this.needsHandshake()) {
          await this.handshake();
        }
        const id = this.nextId(firstAttempt);
        firstAttempt = false;
        return await this.sendOnce(id, method, params);
      } catch (err) {
        if (!isRetryable(err) || attemptsLeft <= 0) throw err;
        attemptsLeft--;

        if (err instanceof MiioTimeoutError) {
          this.lastHandshake = 0;
          this.closeSocket();
        }
      }
    }
  }

  private sendOnce(id: number, method: string, params: unknown[]): Promise<unknown> {
    const payload = { id, method, params };
    const packet = MiioPacket.encode(this.deviceId, this.currentStamp(), this.token, payload);
    const socket = this.ensureSocket();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new MiioTimeoutError(`Command '${method}' timed out after ${this.timeout}ms`));
      }, this.timeout);

      this.pendingRequests.set(id, { resolve, reject, timer });
      socket.send(packet, 0, packet.length, MIIO_PORT, this.address, (err) => {
        if (!err) return;
        const pending = this.pendingRequests.get(id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pendingRequests.delete(id);
        reject(err);
      });
    });
  }

  private needsHandshake(): boolean {
    // Re-handshake if stale (older than 60 seconds)
    return this.lastHandshake === 0 || Date.now() - this.lastHandshake > HANDSHAKE_MAX_AGE;
  }

  private nextId(firstAttempt: boolean): number {
    const id = this.lastId + (firstAttempt ? 1 : RETRY_ID_STEP);
    this.lastId = id >= MAX_MESSAGE_ID ? 1 : id;
    return this.lastId;
  }

  private currentStamp(): number {
    const elapsed = Math.floor((Date.now() - this.stampReceivedAt) / 1000);
    return (this.deviceStamp + elapsed) >>> 0;
  }

  private updateStamp(stamp: number): void {
    if (stamp > 0) {
      this.deviceStamp = stamp;
      this.stampReceivedAt = Date.now();
    }
  }

  private failHandshake(err: Error): void {
    const waiter = this.handshakeWaiter;
    if (!waiter) return;
    this.handshakeWaiter = null;
    clearTimeout(waiter.timer);
    waiter.reject(err);
  }

  private ensureSocket(): dgram.Socket {
    if (this.socket) return this.socket;

    const socket = this.createSocket();
    socket.on('message', (msg) => { this.handleMessage(msg); });
    socket.on('error', (err) => {
      if (this.socket === socket) this.closeSocket();
      if (this.listenerCount('error') > 0) this.emit('error', err);
    });
    this.socket = socket;
    return socket;
  }

  private closeSocket(): void {
    const socket = this.socket;
    if (!socket) return;
    this.socket = null;
    try {
      socket.close();
    } catch {
      return;
    }
  }

  private handleMessage(data: Buffer): void {
    let decoded: ReturnType<typeof MiioPacket.decode>;
    try {
      decoded = MiioPacket.decode(data, this.token);
    } catch (err) {
      // Ignore malformed packets
      this.failHandshake(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    const { deviceId, stamp, payload } = decoded;
    this.updateStamp(stamp);

    if (payload === null) {
      const waiter = this.handshakeWaiter;
      if (!waiter) return;
      this.handshakeWaiter = null;
      clearTimeout(waiter.timer);
      this.deviceId = deviceId;
      this.lastHandshake = Date.now();
      waiter.resolve({ deviceId, stamp });
      return;
    }

    if (typeof payload === 'object' && 'id' in payload) {
      const response = payload as { id: number; result?: unknown; error?: { code: number; message: string } };
      const pending = this.pendingRequests.get(response.id);
      if (!pending) return;

      clearTimeout(pending.timer);
      this.pendingRequests.delete(response.id);

      if (response.error) {
        pending.reject(new MiioDeviceError(response.error.code, response.error.message));
      } else {
        pending.resolve(response.result);
      }
    }
  }
}

function isRetryable(err: unknown): boolean {
  if (err instanceof MiioTimeoutError) return true;
  return err instanceof MiioDeviceError && err.recoverable;
}
