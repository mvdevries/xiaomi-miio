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

const mockSpecWithActions: MiotSpec = {
  type: 'urn:miot-spec-v2:device:light:0000A001:test:1',
  description: 'Test Light With Actions',
  services: [
    {
      iid: 2,
      type: 'urn:miot-spec-v2:service:light',
      description: 'Light',
      properties: [
        {
          iid: 1,
          type: 'urn:miot-spec-v2:property:power',
          description: 'Power',
          format: 'bool',
          access: ['read', 'write', 'notify'],
        },
        {
          iid: 2,
          type: 'urn:miot-spec-v2:property:brightness',
          description: 'Brightness',
          format: 'uint8',
          access: ['read', 'write', 'notify'],
          unit: 'percentage',
          'value-range': [1, 100, 1],
        },
      ],
      actions: [
        {
          iid: 1,
          type: 'urn:miot-spec-v2:action:toggle',
          description: 'Toggle',
          in: [],
          out: [],
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

    it('should call action with correct siid and aiid', async () => {
      const device = new SmartDevice({
        address: '192.168.1.100',
        token: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
        model: 'test.light.v1',
      });

      (MiotSpecFetcher.extractCapabilities as jest.Mock).mockReturnValue([]);
      device.initializeWithSpec(mockSpecWithActions);

      const callSpy = jest.spyOn(device, 'call').mockResolvedValue({ code: 0 });

      const result = await device.callAction('toggle');
      expect(result).toEqual({ code: 0 });
      expect(callSpy).toHaveBeenCalledWith('action', [{ siid: 2, aiid: 1, in: [] }]);
    });

    it('should pass parameters to action', async () => {
      const device = new SmartDevice({
        address: '192.168.1.100',
        token: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
        model: 'test.light.v1',
      });

      (MiotSpecFetcher.extractCapabilities as jest.Mock).mockReturnValue([]);
      device.initializeWithSpec(mockSpecWithActions);

      const callSpy = jest.spyOn(device, 'call').mockResolvedValue({ code: 0 });

      await device.callAction('toggle', [1, 2, 3]);
      expect(callSpy).toHaveBeenCalledWith('action', [{ siid: 2, aiid: 1, in: [1, 2, 3] }]);
    });
  });

  describe('getProperty with known property', () => {
    it('should return value when call succeeds with code 0', async () => {
      const device = new SmartDevice({
        address: '192.168.1.100',
        token: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
        model: 'test.light.v1',
      });

      (MiotSpecFetcher.extractCapabilities as jest.Mock).mockReturnValue([]);
      device.initializeWithSpec(mockSpecWithActions);

      jest.spyOn(device, 'call').mockResolvedValue([{ code: 0, value: true }]);

      const result = await device.getProperty('power');
      expect(result).toBe(true);
    });

    it('should throw when call returns non-zero code', async () => {
      const device = new SmartDevice({
        address: '192.168.1.100',
        token: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
        model: 'test.light.v1',
      });

      (MiotSpecFetcher.extractCapabilities as jest.Mock).mockReturnValue([]);
      device.initializeWithSpec(mockSpecWithActions);

      jest.spyOn(device, 'call').mockResolvedValue([{ code: -1 }]);

      await expect(device.getProperty('power')).rejects.toThrow(
        'Failed to get property power: code -1',
      );
    });
  });

  describe('setProperty with known property', () => {
    it('should succeed when call returns code 0', async () => {
      const device = new SmartDevice({
        address: '192.168.1.100',
        token: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
        model: 'test.light.v1',
      });

      (MiotSpecFetcher.extractCapabilities as jest.Mock).mockReturnValue([]);
      device.initializeWithSpec(mockSpecWithActions);

      const callSpy = jest.spyOn(device, 'call').mockResolvedValue([{ code: 0 }]);

      await device.setProperty('power', true);
      expect(callSpy).toHaveBeenCalledWith('set_properties', [
        { siid: 2, piid: 1, value: true },
      ]);
    });

    it('should throw when call returns non-zero code', async () => {
      const device = new SmartDevice({
        address: '192.168.1.100',
        token: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
        model: 'test.light.v1',
      });

      (MiotSpecFetcher.extractCapabilities as jest.Mock).mockReturnValue([]);
      device.initializeWithSpec(mockSpecWithActions);

      jest.spyOn(device, 'call').mockResolvedValue([{ code: -4001 }]);

      await expect(device.setProperty('power', true)).rejects.toThrow(
        'Failed to set property power: code -4001',
      );
    });
  });

  describe('dynamic methods', () => {
    it('should register and call dynamic getter', async () => {
      const device = new SmartDevice({
        address: '192.168.1.100',
        token: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
        model: 'test.light.v1',
      });

      (MiotSpecFetcher.extractCapabilities as jest.Mock).mockReturnValue([]);
      device.initializeWithSpec(mockSpecWithActions);

      jest.spyOn(device, 'call').mockResolvedValue([{ code: 0, value: 75 }]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (device as any).getBrightness();
      expect(result).toBe(75);
    });

    it('should register and call dynamic setter', async () => {
      const device = new SmartDevice({
        address: '192.168.1.100',
        token: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
        model: 'test.light.v1',
      });

      (MiotSpecFetcher.extractCapabilities as jest.Mock).mockReturnValue([]);
      device.initializeWithSpec(mockSpecWithActions);

      const callSpy = jest.spyOn(device, 'call').mockResolvedValue([{ code: 0 }]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (device as any).setPower(true);
      expect(callSpy).toHaveBeenCalledWith('set_properties', [
        { siid: 2, piid: 1, value: true },
      ]);
    });

    it('should register and call dynamic action method', async () => {
      const device = new SmartDevice({
        address: '192.168.1.100',
        token: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
        model: 'test.light.v1',
      });

      (MiotSpecFetcher.extractCapabilities as jest.Mock).mockReturnValue([]);
      device.initializeWithSpec(mockSpecWithActions);

      const callSpy = jest.spyOn(device, 'call').mockResolvedValue({ code: 0 });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (device as any).callToggle();
      expect(callSpy).toHaveBeenCalledWith('action', [{ siid: 2, aiid: 1, in: [] }]);
    });
  });
});
