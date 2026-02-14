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
});
