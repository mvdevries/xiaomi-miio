import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type * as dgram from 'node:dgram';
import { MiioDevice } from './device.js';
import { MiioPacket } from './protocol/packet.js';

const TOKEN = Buffer.from('ffffffffffffffffffffffffffffffff', 'hex');
const DEVICE_ID = 0x12345678;
const STAMP = 100;

function createMockSocket() {
  const emitter = new EventEmitter();
  const socket = Object.assign(emitter, {
    send: (_msg: Buffer, _offset: number, _length: number, _port: number, _address: string, cb?: (err: Error | null) => void) => {
      cb?.(null);
    },
    close: () => {},
  }) as unknown as dgram.Socket;
  return socket;
}

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

function buildCommandResponse(id: number, result: unknown): Buffer {
  return MiioPacket.encode(DEVICE_ID, STAMP + 1, TOKEN, { id, result });
}

describe('MiioDevice', () => {
  let mockSocket: dgram.Socket;
  let device: MiioDevice;

  beforeEach(() => {
    mockSocket = createMockSocket();
    device = new MiioDevice({
      address: '192.168.1.100',
      token: TOKEN,
      model: 'yeelink.light.bslamp2',
      timeout: 500,
      createSocket: () => mockSocket,
    });
  });

  afterEach(() => {
    device.destroy();
  });

  describe('connect', () => {
    it('should return device info after handshake', async () => {
      const connectPromise = device.connect();
      mockSocket.emit('message', buildHelloResponse());

      const info = await connectPromise;
      assert.strictEqual(info.address, '192.168.1.100');
      assert.strictEqual(info.deviceId, DEVICE_ID);
      assert.strictEqual(info.model, 'yeelink.light.bslamp2');
    });
  });

  describe('call', () => {
    it('should send a command and return the result', async () => {
      // Connect first
      const connectPromise = device.connect();
      mockSocket.emit('message', buildHelloResponse());
      await connectPromise;

      // Send command
      const callPromise = device.call('set_power', ['on']);
      mockSocket.emit('message', buildCommandResponse(1, ['ok']));

      const result = await callPromise;
      assert.deepStrictEqual(result, ['ok']);
    });
  });

  describe('getProperties', () => {
    it('should call get_prop with given property names', async () => {
      const connectPromise = device.connect();
      mockSocket.emit('message', buildHelloResponse());
      await connectPromise;

      const propsPromise = device.getProperties(['power', 'bright']);
      mockSocket.emit('message', buildCommandResponse(1, ['on', 100]));

      const result = await propsPromise;
      assert.deepStrictEqual(result, ['on', 100]);
    });
  });

  describe('lookupHostname', () => {
    it('should resolve hostname via DNS', async () => {
      const lookupService = mock.fn((_address: string, _port: number) => {
        return Promise.resolve({ hostname: 'miio-device.local', service: 'miio' });
      });

      const result = await device.lookupHostname({ port: 54321, lookupService });
      assert.strictEqual(result.address, '192.168.1.100');
      assert.strictEqual(result.port, 54321);
      assert.strictEqual(result.hostname, 'miio-device.local');
      assert.strictEqual(result.service, 'miio');
      assert.strictEqual(result.error, null);
      assert.strictEqual(lookupService.mock.callCount(), 1);
    });
  });

  describe('destroy', () => {
    it('should not throw when called on unconnected device', () => {
      assert.doesNotThrow(() => device.destroy());
    });
  });
});
