import { DnsLookupError, lookupDeviceHostname } from './dns.js';

describe('lookupDeviceHostname', () => {
  it('returns hostname and service on success', async () => {
    const lookupService = jest.fn((_address: string, _port: number) => {
      return Promise.resolve({ hostname: 'miio-device.local', service: 'miio' });
    });

    const result = await lookupDeviceHostname('192.168.1.10', { port: 54321, lookupService });
    expect(result.address).toBe('192.168.1.10');
    expect(result.port).toBe(54321);
    expect(result.hostname).toBe('miio-device.local');
    expect(result.service).toBe('miio');
    expect(result.error).toBeNull();
    expect(lookupService).toHaveBeenCalledTimes(1);
  });

  it('uses default port when not specified', async () => {
    const lookupService = jest.fn((_address: string, _port: number) => {
      return Promise.resolve({ hostname: 'device.local', service: 'miio' });
    });

    const result = await lookupDeviceHostname('192.168.1.15', { lookupService });
    expect(result.port).toBe(54321);
    expect(lookupService).toHaveBeenCalledWith('192.168.1.15', 54321);
  });

  it('returns a typed error on failure', async () => {
    const lookupService = jest.fn(() => {
      return Promise.reject(new Error('nope'));
    });

    const result = await lookupDeviceHostname('192.168.1.20', { port: 54321, lookupService });
    expect(result.hostname).toBeNull();
    expect(result.service).toBeNull();
    expect(result.error).toBeDefined();
    expect(result.error).toBeInstanceOf(DnsLookupError);
    expect(result.error?.address).toBe('192.168.1.20');
    expect(result.error?.port).toBe(54321);
    expect(result.error?.cause).toBeInstanceOf(Error);
  });
});
