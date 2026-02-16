import { EventEmitter } from 'node:events';
import type * as dgram from 'node:dgram';
import { discoverMiioDevices } from './discovery.js';

const TOKEN_A = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
const TOKEN_B = Buffer.from('ffeeddccbbaa99887766554433221100', 'hex');

/** Create a mock dgram.Socket using an EventEmitter. */
function createMockSocket() {
  const emitter = new EventEmitter();
  const bindFn = jest.fn((_port: number, cb?: () => void) => { cb?.(); });
  const sendFn = jest.fn(
    (_msg: Buffer, _offset: number, _length: number, _port: number, _address: string, cb?: (err: Error | null) => void) => {
      cb?.(null);
    }
  );
  const closeFn = jest.fn(() => {});
  const setBroadcastFn = jest.fn((_enabled: boolean) => {});

  const socket = Object.assign(emitter, {
    bind: bindFn,
    send: sendFn,
    close: closeFn,
    setBroadcast: setBroadcastFn,
  }) as unknown as dgram.Socket;

  return { socket, bindFn, sendFn, closeFn, setBroadcastFn };
}

/** Build a hello response packet (header-only, 32 bytes). */
function buildHelloResponse(token: Buffer, deviceId: number, stamp: number): Buffer {
  const buf = Buffer.alloc(32);
  buf.writeUInt16BE(0x2131, 0);
  buf.writeUInt16BE(32, 2);
  buf.writeUInt32BE(0, 4);
  buf.writeUInt32BE(deviceId, 8);
  buf.writeUInt32BE(stamp, 12);
  token.copy(buf, 16);
  return buf;
}

function buildRemoteInfo(address: string): dgram.RemoteInfo {
  return {
    address,
    family: 'IPv4',
    port: 54321,
    size: 32,
  };
}

describe('discoverMiioDevices', () => {
  it('collects unique devices and closes the socket', async () => {
    const mockSocket = createMockSocket();
    const promise = discoverMiioDevices({
      timeout: 20,
      createSocket: () => mockSocket.socket,
    });

    const respA = buildHelloResponse(TOKEN_A, 0x11111111, 10);
    const respB = buildHelloResponse(TOKEN_B, 0x22222222, 20);

    mockSocket.socket.emit('message', respA, buildRemoteInfo('192.168.1.10'));
    mockSocket.socket.emit('message', respA, buildRemoteInfo('192.168.1.10'));
    mockSocket.socket.emit('message', respB, buildRemoteInfo('192.168.1.11'));

    const devices = await promise;
    expect(devices.length).toBe(2);
    expect(mockSocket.bindFn).toHaveBeenCalledTimes(1);
    expect(mockSocket.setBroadcastFn).toHaveBeenCalledTimes(1);
    expect(mockSocket.sendFn).toHaveBeenCalledTimes(1);
    expect(mockSocket.closeFn).toHaveBeenCalledTimes(1);
  });

  it('includes the token when requested', async () => {
    const mockSocket = createMockSocket();
    const promise = discoverMiioDevices({
      timeout: 20,
      includeToken: true,
      createSocket: () => mockSocket.socket,
    });

    const resp = buildHelloResponse(TOKEN_A, 0x33333333, 30);
    mockSocket.socket.emit('message', resp, buildRemoteInfo('192.168.1.12'));

    const [device] = await promise;
    expect(device).toBeDefined();
    expect(device?.address).toBe('192.168.1.12');
    expect(device?.token?.toString('hex')).toBe(TOKEN_A.toString('hex'));
  });

  it('uses default options when not provided', async () => {
    const mockSocket = createMockSocket();
    const promise = discoverMiioDevices({
      timeout: 20,
      createSocket: () => mockSocket.socket,
    });

    const resp = buildHelloResponse(TOKEN_A, 0x44444444, 40);
    mockSocket.socket.emit('message', resp, buildRemoteInfo('192.168.1.14'));

    const devices = await promise;
    expect(devices.length).toBe(1);
    expect(devices[0]?.token).toBeUndefined();
  });

  it('ignores malformed packets', async () => {
    const mockSocket = createMockSocket();
    const promise = discoverMiioDevices({
      timeout: 20,
      createSocket: () => mockSocket.socket,
    });

    mockSocket.socket.emit('message', Buffer.from('nope'), buildRemoteInfo('192.168.1.13'));

    const devices = await promise;
    expect(devices).toEqual([]);
  });

  it('rejects on socket error', async () => {
    const mockSocket = createMockSocket();
    const promise = discoverMiioDevices({
      timeout: 50,
      createSocket: () => mockSocket.socket,
    });

    const error = new Error('boom');
    mockSocket.socket.emit('error', error);

    await expect(promise)
      .rejects.toThrow(/boom/);
    expect(mockSocket.closeFn).toHaveBeenCalledTimes(1);
  });

  it('rejects on send error', async () => {
    const mockSocket = createMockSocket();
    mockSocket.sendFn.mockImplementation(
      (_msg: Buffer, _offset: number, _length: number, _port: number, _address: string, cb?: (err: Error | null) => void) => {
        cb?.(new Error('send failed'));
      },
    );

    const promise = discoverMiioDevices({
      timeout: 50,
      createSocket: () => mockSocket.socket,
    });

    await expect(promise).rejects.toThrow('send failed');
    expect(mockSocket.closeFn).toHaveBeenCalledTimes(1);
  });
});
