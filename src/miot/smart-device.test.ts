import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { SmartDevice } from './smart-device.js';
import { MiotSpecFetcher, type MiotSpec } from './spec-fetcher.js';

// Mock MiotSpecFetcher
jest.mock('./spec-fetcher.js', () => ({
  MiotSpecFetcher: {
    fetchSpec: jest.fn(),
    extractCapabilities: jest.fn(),
  },
}));

const mockSpec: MiotSpec = {
  type: 'urn:miot-spec-v2:device:light:0000A001:test:1',
  description: 'Test Light',
  services: [
    {
      iid: 1,
      type: 'urn:miot-spec-v2:service:light:00007802:test:1',
      description: 'Light',
      properties: [
        {
          iid: 1,
          type: 'urn:miot-spec-v2:property:on:00000006:test:1',
          description: 'Power',
          format: 'bool',
          access: ['read', 'write', 'notify'],
        },
        {
          iid: 2,
          type: 'urn:miot-spec-v2:property:brightness:0000000D:test:1',
          description: 'Brightness',
          format: 'uint8',
          access: ['read', 'write', 'notify'],
          unit: 'percentage',
          'value-range': [1, 100, 1],
        },
      ],
    },
  ],
};

describe('SmartDevice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create device with required options', () => {
      const device = new SmartDevice({
        address: '192.168.1.100',
        token: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
        model: 'yeelink.light.bslamp2',
      });

      expect(device).toBeInstanceOf(SmartDevice);
      expect(device.model).toBe('yeelink.light.bslamp2');
      expect(device.isInitialized()).toBe(false);
    });

    it('should throw error if model is missing', () => {
      expect(() => {
        new SmartDevice({
          address: '192.168.1.100',
          token: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
          model: '',
        });
      }).toThrow('SmartDevice requires a model identifier');
    });
  });

  describe('initialize', () => {
    it('should fetch spec and initialize device', async () => {
      const device = new SmartDevice({
        address: '192.168.1.100',
        token: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
        model: 'test.light.v1',
      });

      (MiotSpecFetcher.fetchSpec as jest.MockedFunction<typeof MiotSpecFetcher.fetchSpec>).mockResolvedValue(mockSpec);
      (MiotSpecFetcher.extractCapabilities as jest.Mock).mockReturnValue([
        {
          service: 'test:1',
          serviceDescription: 'Light',
          property: {
            name: 'test:1',
            description: 'Power',
            format: 'bool',
            access: ['read', 'write', 'notify'],
          },
        },
      ]);

      await device.initialize();

      expect(device.isInitialized()).toBe(true);
      expect(MiotSpecFetcher).toHaveProperty('fetchSpec');
      const capabilities = device.getCapabilities();
      expect(capabilities).toHaveLength(1);
    });

    it('should throw error if already initialized', async () => {
      const device = new SmartDevice({
        address: '192.168.1.100',
        token: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
        model: 'test.light.v1',
      });

      (MiotSpecFetcher.fetchSpec as jest.MockedFunction<typeof MiotSpecFetcher.fetchSpec>).mockResolvedValue(mockSpec);
      (MiotSpecFetcher.extractCapabilities as jest.Mock).mockReturnValue([]);

      await device.initialize();

      await expect(device.initialize()).rejects.toThrow(
        'Device is already initialized. Call initialize() only once.',
      );
    });

    it('should throw error if spec cannot be fetched', async () => {
      const device = new SmartDevice({
        address: '192.168.1.100',
        token: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
        model: 'unknown.device.v1',
      });

      (MiotSpecFetcher.fetchSpec as jest.MockedFunction<typeof MiotSpecFetcher.fetchSpec>).mockResolvedValue(null);

      await expect(device.initialize()).rejects.toThrow(
        'Could not fetch MIoT spec for model: unknown.device.v1',
      );
    });
  });

  describe('initializeWithSpec', () => {
    it('should initialize device with provided spec', () => {
      const device = new SmartDevice({
        address: '192.168.1.100',
        token: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
        model: 'test.light.v1',
      });

      (MiotSpecFetcher.extractCapabilities as jest.Mock).mockReturnValue([
        {
          service: 'test:1',
          serviceDescription: 'Light',
          property: {
            name: 'test:1',
            description: 'Power',
            format: 'bool',
            access: ['read', 'write'],
          },
        },
      ]);

      device.initializeWithSpec(mockSpec);

      expect(device.isInitialized()).toBe(true);
      expect(device.getSpec()).toBe(mockSpec);
      expect(device.getCapabilities()).toHaveLength(1);
    });

    it('should silently ignore if initialized with same spec', () => {
      const device = new SmartDevice({
        address: '192.168.1.100',
        token: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
        model: 'test.light.v1',
      });

      (MiotSpecFetcher.extractCapabilities as jest.Mock).mockReturnValue([]);

      device.initializeWithSpec(mockSpec);
      device.initializeWithSpec(mockSpec); // Same spec, should not throw

      expect(device.isInitialized()).toBe(true);
    });

    it('should throw error if initialized with different spec', () => {
      const device = new SmartDevice({
        address: '192.168.1.100',
        token: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
        model: 'test.light.v1',
      });

      (MiotSpecFetcher.extractCapabilities as jest.Mock).mockReturnValue([]);

      const spec1 = { ...mockSpec };
      const spec2 = { ...mockSpec, description: 'Different Device' };

      device.initializeWithSpec(spec1);

      expect(() => device.initializeWithSpec(spec2)).toThrow(
        'Device is already initialized with a different spec. Cannot re-initialize.',
      );
    });
  });

  describe('getCapabilities', () => {
    it('should return empty array when not initialized', () => {
      const device = new SmartDevice({
        address: '192.168.1.100',
        token: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
        model: 'test.light.v1',
      });

      expect(device.getCapabilities()).toEqual([]);
    });

    it('should return capabilities after initialization', () => {
      const device = new SmartDevice({
        address: '192.168.1.100',
        token: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
        model: 'test.light.v1',
      });

      const mockCapabilities = [
        {
          service: 'test:1',
          serviceDescription: 'Light',
          property: {
            name: 'test:1',
            description: 'Power',
            format: 'bool',
            access: ['read', 'write'],
          },
        },
      ];

      (MiotSpecFetcher.extractCapabilities as jest.Mock).mockReturnValue(mockCapabilities);

      device.initializeWithSpec(mockSpec);

      expect(device.getCapabilities()).toEqual(mockCapabilities);
    });
  });

  describe('getSpec', () => {
    it('should return null when not initialized', () => {
      const device = new SmartDevice({
        address: '192.168.1.100',
        token: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
        model: 'test.light.v1',
      });

      expect(device.getSpec()).toBeNull();
    });

    it('should return spec after initialization', () => {
      const device = new SmartDevice({
        address: '192.168.1.100',
        token: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
        model: 'test.light.v1',
      });

      (MiotSpecFetcher.extractCapabilities as jest.Mock).mockReturnValue([]);

      device.initializeWithSpec(mockSpec);

      expect(device.getSpec()).toBe(mockSpec);
    });
  });

  describe('isInitialized', () => {
    it('should return false before initialization', () => {
      const device = new SmartDevice({
        address: '192.168.1.100',
        token: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
        model: 'test.light.v1',
      });

      expect(device.isInitialized()).toBe(false);
    });

    it('should return true after initialization', () => {
      const device = new SmartDevice({
        address: '192.168.1.100',
        token: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
        model: 'test.light.v1',
      });

      (MiotSpecFetcher.extractCapabilities as jest.Mock).mockReturnValue([]);

      device.initializeWithSpec(mockSpec);

      expect(device.isInitialized()).toBe(true);
    });
  });

  describe('getProperty', () => {
    it('should throw error for unknown property', async () => {
      const device = new SmartDevice({
        address: '192.168.1.100',
        token: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
        model: 'test.light.v1',
      });

      (MiotSpecFetcher.extractCapabilities as jest.Mock).mockReturnValue([]);
      device.initializeWithSpec(mockSpec);

      await expect(device.getProperty('unknown')).rejects.toThrow('Unknown property: unknown');
    });
  });

  describe('setProperty', () => {
    it('should throw error for unknown property', async () => {
      const device = new SmartDevice({
        address: '192.168.1.100',
        token: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
        model: 'test.light.v1',
      });

      (MiotSpecFetcher.extractCapabilities as jest.Mock).mockReturnValue([]);
      device.initializeWithSpec(mockSpec);

      await expect(device.setProperty('unknown', true)).rejects.toThrow('Unknown property: unknown');
    });
  });

  describe('callAction', () => {
    it('should throw error for unknown action', async () => {
      const device = new SmartDevice({
        address: '192.168.1.100',
        token: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
        model: 'test.light.v1',
      });

      (MiotSpecFetcher.extractCapabilities as jest.Mock).mockReturnValue([]);
      device.initializeWithSpec(mockSpec);

      await expect(device.callAction('unknown')).rejects.toThrow('Unknown action: unknown');
    });
  });
});
