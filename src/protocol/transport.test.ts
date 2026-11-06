import { EventEmitter } from 'node:events';
import type * as dgram from 'node:dgram';
import { MiioTransport } from './transport.js';
import { MiioPacket } from './packet.js';

const TOKEN = Buffer.from('ffffffffffffffffffffffffffffffff', 'hex');
const DEVICE_ID = 0x12345678;
const STAMP = 100;

/** Create a mock dgram.Socket using an EventEmitter. */
function createMockSocket() {
  const emitter = new EventEmitter();
  const sendFn = jest.fn(
    (_msg: Buffer, _offset: number, _length: number, _port: number, _address: string, cb?: (err: Error | null) => void) => {
      cb?.(null);
    }
  );
  const closeFn = jest.fn(() => {});

  const socket = Object.assign(emitter, {
    send: sendFn,
    close: closeFn,
  }) as unknown as dgram.Socket;

  return { socket, sendFn, closeFn };
}

/** Build a hello response packet (header-only, 32 bytes). */
function buildHelloResponse(): Buffer {
  const buf = Buffer.alloc(32);
  buf.writeUInt16BE(0x2131, 0);
  buf.writeUInt16BE(32, 2);
  buf.writeUInt32BE(0, 4);
  buf.writeUInt32BE(DEVICE_ID, 8);
  buf.writeUInt32BE(STAMP, 12);
  TOKEN.copy(buf, 16);
  return buf;
}

/** Build an encrypted response packet for a given command ID. */
function buildCommandResponse(id: number, result: unknown): Buffer {
  const payload = { id, result };
  return MiioPacket.encode(DEVICE_ID, STAMP + 1, TOKEN, payload);
}

describe('MiioTransport', () => {
  let mockSocket: ReturnType<typeof createMockSocket>;
  let transport: MiioTransport;

  beforeEach(() => {
    mockSocket = createMockSocket();
    transport = new MiioTransport({
      address: '192.168.1.100',
      token: TOKEN,
      timeout: 500,
      retries: 0,
      createSocket: () => mockSocket.socket,
    });
  });

  afterEach(() => {
    transport.destroy();
  });

  describe('handshake', () => {
    it('should resolve with deviceId and stamp on hello response', async () => {
      const handshakePromise = transport.handshake();

      // Simulate receiving hello response
      mockSocket.socket.emit('message', buildHelloResponse());

      const result = await handshakePromise;
      expect(result.deviceId).toBe(DEVICE_ID);
      expect(result.stamp).toBe(STAMP);
    });

    it('should send a hello packet via the socket', async () => {
      const handshakePromise = transport.handshake();
      mockSocket.socket.emit('message', buildHelloResponse());
      await handshakePromise;

      expect(mockSocket.sendFn).toHaveBeenCalledTimes(1);
      const sentPacket = mockSocket.sendFn.mock.calls[0]?.[0] as Buffer;
      expect(sentPacket.readUInt16BE(0)).toBe(0x2131);
      expect(sentPacket.readUInt16BE(2)).toBe(32);
    });

    it('should reject on timeout', async () => {
      await expect(transport.handshake())
        .rejects.toThrow(/Handshake timeout/);
    });

    it('should reject on malformed response', async () => {
      const handshakePromise = transport.handshake();

      // Send a malformed packet (too short)
      mockSocket.socket.emit('message', Buffer.alloc(10));

      await expect(handshakePromise)
        .rejects.toThrow(/Packet too short/);
    });
  });

  describe('send', () => {
    it('should send a command and resolve with the result', async () => {
      // First do handshake
      const handshakePromise = transport.handshake();
      mockSocket.socket.emit('message', buildHelloResponse());
      await handshakePromise;

      // Send command
      const sendPromise = transport.send('set_power', ['on']);

      // The second call to send will be the command packet (first was hello)
      // Message ID starts at 1
      const response = buildCommandResponse(1, ['ok']);
      mockSocket.socket.emit('message', response);

      const result = await sendPromise;
      expect(result).toEqual(['ok']);
    });

    it('should reject on command timeout', async () => {
      // Do handshake first
      const handshakePromise = transport.handshake();
      mockSocket.socket.emit('message', buildHelloResponse());
      await handshakePromise;

      await expect(transport.send('set_power', ['on']))
        .rejects.toThrow(/timed out/);
    });

    it('should reject on miIO error response', async () => {
      const handshakePromise = transport.handshake();
      mockSocket.socket.emit('message', buildHelloResponse());
      await handshakePromise;

      const sendPromise = transport.send('bad_method', []);

      const errorPayload = { id: 1, error: { code: -1, message: 'unknown method' } };
      const errorResponse = MiioPacket.encode(DEVICE_ID, STAMP + 1, TOKEN, errorPayload);
      mockSocket.socket.emit('message', errorResponse);

      await expect(sendPromise)
        .rejects.toThrow(/miIO error -1: unknown method/);
    });
  });

  describe('destroy', () => {
    it('should close the socket', async () => {
      // Trigger socket creation via handshake
      const handshakePromise = transport.handshake();
      mockSocket.socket.emit('message', buildHelloResponse());
      await handshakePromise;

      transport.destroy();
      expect(mockSocket.closeFn).toHaveBeenCalledTimes(1);
    });

    it('should reject all pending requests', async () => {
      const handshakePromise = transport.handshake();
      mockSocket.socket.emit('message', buildHelloResponse());
      await handshakePromise;

      const sendPromise = transport.send('set_power', ['on']);
      transport.destroy();

      await expect(sendPromise)
        .rejects.toThrow(/Transport destroyed/);
    });
  });

  describe('reliability', () => {
    interface FakeDeviceOptions {
      ignoreFirst?: number;
      errorCodes?: number[];
      maxAcceptedId?: number;
    }

    function createFakeDevice(options: FakeDeviceOptions = {}) {
      const emitter = new EventEmitter();
      const received: { id: number; method: string; stamp: number }[] = [];
      const hellos: number[] = [];
      let ignore = options.ignoreFirst ?? 0;
      const errorCodes = [...(options.errorCodes ?? [])];

      const sendFn = jest.fn(
        (msg: Buffer, _offset: number, _length: number, _port: number, _address: string, cb?: (err: Error | null) => void) => {
          cb?.(null);
          if (msg.length === 32) {
            hellos.push(Date.now());
            setImmediate(() => emitter.emit('message', buildHelloResponse()));
            return;
          }
          const { payload, stamp } = MiioPacket.decode(msg, TOKEN);
          const request = payload as { id: number; method: string };
          received.push({ id: request.id, method: request.method, stamp });
          if (ignore > 0) {
            ignore--;
            return;
          }
          if (options.maxAcceptedId !== undefined && request.id > options.maxAcceptedId) return;
          const code = errorCodes.shift();
          const reply =
            code !== undefined
              ? { id: request.id, error: { code, message: 'recoverable' } }
              : { id: request.id, result: ['ok'] };
          setImmediate(() => emitter.emit('message', MiioPacket.encode(DEVICE_ID, STAMP + 1, TOKEN, reply)));
        }
      );
      const closeFn = jest.fn();
      const socket = Object.assign(emitter, { send: sendFn, close: closeFn }) as unknown as dgram.Socket;
      return { socket, received, hellos, closeFn, emitter };
    }

    function createTransport(device: ReturnType<typeof createFakeDevice>, retries = 3) {
      return new MiioTransport({
        address: '192.168.1.100',
        token: TOKEN,
        timeout: 30,
        retries,
        createSocket: () => device.socket,
      });
    }

    it('should wrap message ids before they reach 10000', async () => {
      const device = createFakeDevice();
      const t = createTransport(device);
      const seen: number[] = [];

      for (let i = 0; i < 10_050; i++) {
        await t.send('get_prop', []);
      }
      for (const r of device.received) seen.push(r.id);

      expect(Math.max(...seen)).toBeLessThan(10_000);
      expect(seen[9_998]).toBe(9_999);
      expect(seen[9_999]).toBe(1);
      t.destroy();
    });

    it('should retry after a timeout with a new handshake and id +100', async () => {
      const device = createFakeDevice({ ignoreFirst: 1 });
      const t = createTransport(device);

      await expect(t.send('set_power', ['on'])).resolves.toEqual(['ok']);

      expect(device.received.map((r) => r.id)).toEqual([1, 101]);
      expect(device.hellos).toHaveLength(2);
      t.destroy();
    });

    it('should give up after the configured number of retries', async () => {
      const device = createFakeDevice({ ignoreFirst: 99 });
      const t = createTransport(device, 2);

      await expect(t.send('set_power', ['on'])).rejects.toThrow(/timed out/);

      expect(device.received).toHaveLength(3);
      t.destroy();
    });

    it('should retry recoverable device errors', async () => {
      const device = createFakeDevice({ errorCodes: [-30001] });
      const t = createTransport(device);

      await expect(t.send('set_power', ['on'])).resolves.toEqual(['ok']);

      expect(device.received).toHaveLength(2);
      t.destroy();
    });

    it('should not retry other device errors', async () => {
      const device = createFakeDevice({ errorCodes: [-5001] });
      const t = createTransport(device);

      await expect(t.send('set_power', ['on'])).rejects.toThrow(/miIO error -5001/);

      expect(device.received).toHaveLength(1);
      t.destroy();
    });

    it('should recover when the device only accepts ids below a limit', async () => {
      const device = createFakeDevice({ maxAcceptedId: 50 });
      const t = createTransport(device, 1);

      await expect(t.send('get_prop', [])).resolves.toEqual(['ok']);
      t.destroy();
    });

    it('should send requests one at a time and in order', async () => {
      const device = createFakeDevice();
      const t = createTransport(device);

      const results = await Promise.all([
        t.send('first', []),
        t.send('second', []),
        t.send('third', []),
      ]);

      expect(results).toEqual([['ok'], ['ok'], ['ok']]);
      expect(device.received.map((r) => r.method)).toEqual(['first', 'second', 'third']);
      expect(device.hellos).toHaveLength(1);
      t.destroy();
    });

    it('should share one handshake between concurrent callers', async () => {
      const device = createFakeDevice();
      const t = createTransport(device);

      await Promise.all([t.handshake(), t.handshake(), t.handshake()]);

      expect(device.hellos).toHaveLength(1);
      t.destroy();
    });

    it('should base the stamp on the device stamp and elapsed time', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate'] });
      try {
        const device = createFakeDevice();
        const t = createTransport(device);

        await t.send('a', []);
        jest.advanceTimersByTime(10_000);
        await t.send('b', []);

        const [first, second] = device.received;
        expect(first?.stamp).toBe(STAMP);
        expect(second?.stamp).toBe(STAMP + 1 + 10);
        t.destroy();
      } finally {
        jest.useRealTimers();
      }
    });

    it('should not throw when the socket errors without an error listener', async () => {
      const device = createFakeDevice();
      const t = createTransport(device);
      await t.send('a', []);

      expect(() => device.emitter.emit('error', new Error('boom'))).not.toThrow();
      expect(device.closeFn).toHaveBeenCalled();
      t.destroy();
    });

    it('should forward socket errors to an error listener', async () => {
      const device = createFakeDevice();
      const t = createTransport(device);
      const listener = jest.fn();
      t.on('error', listener);
      await t.send('a', []);

      device.emitter.emit('error', new Error('boom'));

      expect(listener).toHaveBeenCalledTimes(1);
      t.destroy();
    });

    it('should reconnect on the next call after the socket failed', async () => {
      const device = createFakeDevice();
      const t = createTransport(device);
      await t.send('a', []);

      device.emitter.emit('error', new Error('boom'));

      await expect(t.send('b', [])).resolves.toEqual(['ok']);
      t.destroy();
    });

    it('should start from a fresh handshake after reset', async () => {
      const device = createFakeDevice();
      const t = createTransport(device);
      await t.send('a', []);

      t.reset();
      await t.send('b', []);

      expect(device.hellos).toHaveLength(2);
      t.destroy();
    });

    it('should not leave a handshake listener behind after a timeout', async () => {
      const silent = new EventEmitter();
      const socket = Object.assign(silent, { send: jest.fn(), close: jest.fn() }) as unknown as dgram.Socket;
      const t = new MiioTransport({ address: '192.168.1.100', token: TOKEN, timeout: 20, retries: 0, createSocket: () => socket });

      await expect(t.handshake()).rejects.toThrow(/Handshake timeout/);
      await expect(t.handshake()).rejects.toThrow(/Handshake timeout/);

      expect(silent.listenerCount('message')).toBe(1);
      t.destroy();
    });
  });
});
