import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { MiotSpecFetcher, type MiotSpec } from './spec-fetcher.js';

describe('MiotSpecFetcher', () => {
  beforeEach(() => {
    // Clear cache before each test
    MiotSpecFetcher.clearCache();
  });

  describe('extractCapabilities', () => {
    it('should extract properties from spec', () => {
      const spec: MiotSpec = {
        type: 'urn:miot-spec-v2:device:light:0000A001:yeelink-bslamp2:1',
        description: 'Light',
        services: [
          {
            iid: 1,
            type: 'urn:miot-spec-v2:service:light:00007802:yeelink-bslamp2:1',
            description: 'Light',
            properties: [
              {
                iid: 1,
                type: 'urn:miot-spec-v2:property:on:00000006:yeelink-bslamp2:1',
                description: 'Switch Status',
                format: 'bool',
                access: ['read', 'write', 'notify'],
              },
              {
                iid: 2,
                type: 'urn:miot-spec-v2:property:brightness:0000000D:yeelink-bslamp2:1',
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

      const capabilities = MiotSpecFetcher.extractCapabilities(spec);

      expect(capabilities).toHaveLength(2);
      expect(capabilities[0]).toMatchObject({
        service: '1',
        serviceDescription: 'Light',
        property: {
          name: '1',
          description: 'Switch Status',
          format: 'bool',
          access: ['read', 'write', 'notify'],
        },
      });

      expect(capabilities[1]?.property).toBeDefined();
      expect(capabilities[1]?.property?.name).toBe('1');
      expect(capabilities[1]?.property?.description).toBe('Brightness');
      expect(capabilities[1]?.property?.valueRange).toEqual([1, 100, 1]);
    });

    it('should extract actions from spec', () => {
      const spec: MiotSpec = {
        type: 'urn:miot-spec-v2:device:light:0000A001:test:1',
        description: 'Test Device',
        services: [
          {
            iid: 1,
            type: 'urn:miot-spec-v2:service:test:00007802:test:1',
            description: 'Test Service',
            actions: [
              {
                iid: 1,
                type: 'urn:miot-spec-v2:action:toggle:00002811:test:1',
                description: 'Toggle',
                in: [],
                out: [],
              },
            ],
          },
        ],
      };

      const capabilities = MiotSpecFetcher.extractCapabilities(spec);

      expect(capabilities).toHaveLength(1);
      expect(capabilities[0]).toMatchObject({
        service: '1',
        serviceDescription: 'Test Service',
        action: {
          name: '1',
          description: 'Toggle',
          inputs: [],
          outputs: [],
        },
      });
    });

    it('should handle properties with value lists', () => {
      const spec: MiotSpec = {
        type: 'urn:miot-spec-v2:device:fan:0000A005:test:1',
        description: 'Fan',
        services: [
          {
            iid: 1,
            type: 'urn:miot-spec-v2:service:fan:00007808:test:1',
            description: 'Fan',
            properties: [
              {
                iid: 1,
                type: 'urn:miot-spec-v2:property:mode:00000008:test:1',
                description: 'Mode',
                format: 'uint8',
                access: ['read', 'write', 'notify'],
                'value-list': [
                  { value: 0, description: 'Basic' },
                  { value: 1, description: 'Natural' },
                ],
              },
            ],
          },
        ],
      };

      const capabilities = MiotSpecFetcher.extractCapabilities(spec);

      expect(capabilities).toHaveLength(1);
      expect(capabilities[0]?.property?.valueList).toEqual([
        { value: 0, description: 'Basic' },
        { value: 1, description: 'Natural' },
      ]);
    });

    it('should handle services with no properties or actions', () => {
      const spec: MiotSpec = {
        type: 'urn:miot-spec-v2:device:test:0000A001:test:1',
        description: 'Test Device',
        services: [
          {
            iid: 1,
            type: 'urn:miot-spec-v2:service:test:00007802:test:1',
            description: 'Test Service',
          },
        ],
      };

      const capabilities = MiotSpecFetcher.extractCapabilities(spec);

      expect(capabilities).toHaveLength(0);
    });

    it('should handle multiple services', () => {
      const spec: MiotSpec = {
        type: 'urn:miot-spec-v2:device:test:0000A001:test:1',
        description: 'Test Device',
        services: [
          {
            iid: 1,
            type: 'urn:miot-spec-v2:service:light:00007802:test:1',
            description: 'Light Service',
            properties: [
              {
                iid: 1,
                type: 'urn:miot-spec-v2:property:on:00000006:test:1',
                description: 'Power',
                format: 'bool',
                access: ['read', 'write'],
              },
            ],
          },
          {
            iid: 2,
            type: 'urn:miot-spec-v2:service:fan:00007808:test:1',
            description: 'Fan Service',
            properties: [
              {
                iid: 1,
                type: 'urn:miot-spec-v2:property:speed:00000016:test:1',
                description: 'Speed',
                format: 'uint8',
                access: ['read', 'write'],
              },
            ],
          },
        ],
      };

      const capabilities = MiotSpecFetcher.extractCapabilities(spec);

      expect(capabilities).toHaveLength(2);
      expect(capabilities[0]?.service).toBe('1');
      expect(capabilities[0]?.serviceDescription).toBe('Light Service');
      expect(capabilities[1]?.service).toBe('1');
      expect(capabilities[1]?.serviceDescription).toBe('Fan Service');
    });
  });

  describe('clearCache', () => {
    it('should clear the specification cache', () => {
      MiotSpecFetcher.clearCache();
      expect(true).toBe(true);
    });
  });

  describe('fetchSpec', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let httpsGetSpy: jest.SpiedFunction<any>;

    afterEach(() => {
      httpsGetSpy?.mockRestore();
    });

    it('should fetch spec via httpsGet and return it', async () => {
      const testSpec: MiotSpec = {
        type: 'test',
        description: 'Test',
        services: [],
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      httpsGetSpy = jest.spyOn(MiotSpecFetcher as any, 'httpsGet').mockResolvedValue(testSpec);

      const result = await MiotSpecFetcher.fetchSpec('fetch-model');

      expect(result).toBe(testSpec);
      expect(httpsGetSpy).toHaveBeenCalledTimes(1);
      expect(httpsGetSpy).toHaveBeenCalledWith(
        expect.stringContaining('fetch-model'),
      );
    });

    it('should return cached spec on second call without calling httpsGet again', async () => {
      const testSpec: MiotSpec = {
        type: 'test',
        description: 'Test',
        services: [],
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      httpsGetSpy = jest.spyOn(MiotSpecFetcher as any, 'httpsGet').mockResolvedValue(testSpec);

      const result1 = await MiotSpecFetcher.fetchSpec('cached-model');
      const result2 = await MiotSpecFetcher.fetchSpec('cached-model');

      expect(result1).toBe(testSpec);
      expect(result2).toBe(testSpec);
      expect(httpsGetSpy).toHaveBeenCalledTimes(1);
    });

    it('should return null when httpsGet throws an error', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      httpsGetSpy = jest.spyOn(MiotSpecFetcher as any, 'httpsGet').mockRejectedValue(
        new Error('Network error'),
      );

      const result = await MiotSpecFetcher.fetchSpec('error-model');

      expect(result).toBeNull();
    });
  });
});
