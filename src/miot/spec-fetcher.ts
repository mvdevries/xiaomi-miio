import { request as httpsRequest } from 'https';

/**
 * MIoT specification structure for a device property
 */
export interface MiotProperty {
  iid: number;
  type: string;
  description: string;
  format: string;
  access: ('read' | 'write' | 'notify')[];
  unit?: string;
  'value-range'?: [number, number, number];
  'value-list'?: Array<{ value: number; description: string }>;
}

/**
 * MIoT specification structure for a device action
 */
export interface MiotAction {
  iid: number;
  type: string;
  description: string;
  in: number[];
  out: number[];
}

/**
 * MIoT specification structure for a device service
 */
export interface MiotService {
  iid: number;
  type: string;
  description: string;
  properties?: MiotProperty[];
  actions?: MiotAction[];
  events?: unknown[];
}

/**
 * Complete MIoT device specification
 */
export interface MiotSpec {
  type: string;
  description: string;
  services: MiotService[];
}

/**
 * Capability information extracted from MIoT spec
 */
export interface DeviceCapability {
  service: string;
  serviceDescription: string;
  property?: {
    name: string;
    description: string;
    format: string;
    access: string[];
    unit?: string | undefined;
    valueRange?: [number, number, number] | undefined;
    valueList?: Array<{ value: number; description: string }> | undefined;
  };
  action?: {
    name: string;
    description: string;
    inputs: number[];
    outputs: number[];
  };
}

/**
 * Fetches and caches MIoT device specifications from home.miot-spec.com
 */
export class MiotSpecFetcher {
  private static readonly SPEC_BASE_URL = 'https://miot-spec.org/miot-spec-v2/instance';
  private static specCache = new Map<string, MiotSpec>();

  /**
   * Fetch the MIoT specification for a device model
   * @param model - Device model (e.g. "yeelink.light.bslamp2")
   * @returns MIoT specification or null if not found
   */
  static async fetchSpec(model: string): Promise<MiotSpec | null> {
    // Check cache first
    const cached = this.specCache.get(model);
    if (cached) {
      return cached;
    }

    const url = `${this.SPEC_BASE_URL}?type=urn:miot-spec-v2:device:${model}:1`;

    try {
      const spec = await this.httpsGet(url);
      this.specCache.set(model, spec);
      return spec;
    } catch {
      // Spec not found or network error
      return null;
    }
  }

  /**
   * Extract all capabilities from a MIoT spec
   * @param spec - MIoT specification
   * @returns Array of device capabilities
   */
  static extractCapabilities(spec: MiotSpec): DeviceCapability[] {
    const capabilities: DeviceCapability[] = [];

    for (const service of spec.services) {
      const serviceType = service.type.split(':').pop() || service.type;

      // Extract properties
      if (service.properties) {
        for (const prop of service.properties) {
          const propType = prop.type.split(':').pop() || prop.type;
          capabilities.push({
            service: serviceType,
            serviceDescription: service.description,
            property: {
              name: propType,
              description: prop.description,
              format: prop.format,
              access: prop.access,
              unit: prop.unit,
              valueRange: prop['value-range'],
              valueList: prop['value-list'],
            },
          });
        }
      }

      // Extract actions
      if (service.actions) {
        for (const action of service.actions) {
          const actionType = action.type.split(':').pop() || action.type;
          capabilities.push({
            service: serviceType,
            serviceDescription: service.description,
            action: {
              name: actionType,
              description: action.description,
              inputs: action.in,
              outputs: action.out,
            },
          });
        }
      }
    }

    return capabilities;
  }

  /**
   * Clear the specification cache
   */
  static clearCache(): void {
    this.specCache.clear();
  }

  /**
   * Perform HTTPS GET request and parse JSON response
   */
  private static httpsGet(url: string): Promise<MiotSpec> {
    return new Promise((resolve, reject) => {
      httpsRequest(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }

        let data = '';
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(data) as MiotSpec;
            resolve(parsed);
          } catch (error) {
            reject(new Error(`Failed to parse JSON: ${(error as Error).message}`));
          }
        });
      }).on('error', reject);
    });
  }
}
