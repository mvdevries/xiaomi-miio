import { MiioDevice, type DeviceOptions } from '../device.js';
import { MiotSpecFetcher, type MiotSpec, type DeviceCapability } from './spec-fetcher.js';

/**
 * Options for creating a smart device
 */
export interface SmartDeviceOptions extends DeviceOptions {
  /** Device model identifier (required for MIoT spec lookup) */
  model: string;
}

/**
 * Property value types that can be sent to/received from device
 */
export type PropertyValue = string | number | boolean | null;

/**
 * Smart device wrapper that extends MiioDevice with dynamic MIoT capabilities.
 *
 * This class fetches the device's MIoT specification and provides:
 * - Type-safe property getters/setters
 * - Action methods
 * - Capability discovery
 *
 * @example
 * ```typescript
 * const device = new SmartDevice({
 *   address: '192.168.1.100',
 *   token: 'your-device-token',
 *   model: 'yeelink.light.bslamp2'
 * });
 *
 * await device.connect();
 * await device.initialize();
 *
 * // Use dynamic properties
 * await device.setPower(true);
 * await device.setBrightness(80);
 *
 * // Or use generic methods
 * await device.setProperty('power', true);
 * const brightness = await device.getProperty('brightness');
 *
 * // Discover capabilities
 * const caps = device.getCapabilities();
 * console.log(caps);
 * ```
 */
export class SmartDevice extends MiioDevice {
  private spec: MiotSpec | null = null;
  private capabilities: DeviceCapability[] = [];
  private propertyMap = new Map<string, { siid: number; piid: number }>();
  private actionMap = new Map<string, { siid: number; aiid: number }>();

  constructor(options: SmartDeviceOptions) {
    super(options);

    // Ensure model is set
    if (!options.model) {
      throw new Error('SmartDevice requires a model identifier');
    }
  }

  /**
   * Initialize the device by fetching and parsing its MIoT specification from miot-spec.org.
   * Must be called after connect() before using dynamic properties/actions.
   *
   * @throws Error if spec cannot be fetched or model is invalid
   * @throws Error if device is already initialized
   */
  async initialize(): Promise<void> {
    if (this.isInitialized()) {
      throw new Error('Device is already initialized. Call initialize() only once.');
    }

    if (!this.model) {
      throw new Error('Model is required for initialization');
    }

    this.spec = await MiotSpecFetcher.fetchSpec(this.model);

    if (!this.spec) {
      throw new Error(`Could not fetch MIoT spec for model: ${this.model}`);
    }

    this.capabilities = MiotSpecFetcher.extractCapabilities(this.spec);
    this.buildPropertyAndActionMaps();
    this.registerDynamicMethods();
  }

  /**
   * Initialize the device synchronously with a pre-loaded MIoT specification.
   * Use this when you have already fetched the spec or want to provide a custom spec.
   *
   * @param spec - Pre-loaded MIoT specification
   * @throws Error if device is already initialized with a different spec
   * @example
   * ```typescript
   * // Fetch spec once as developer
   * const spec = await MiotSpecFetcher.fetchSpec('yeelink.light.bslamp2');
   *
   * // Initialize with spec
   * const device = new SmartDevice({
   *   address: '192.168.1.100',
   *   token: 'your-token',
   *   model: 'yeelink.light.bslamp2'
   * });
   * device.initializeWithSpec(spec);
   * ```
   */
  initializeWithSpec(spec: MiotSpec): void {
    // If already initialized, check if it's the same spec
    if (this.isInitialized()) {
      if (this.spec === spec) {
        // Same spec, silently ignore
        return;
      }
      // Different spec, throw error
      throw new Error('Device is already initialized with a different spec. Cannot re-initialize.');
    }

    this.spec = spec;
    this.capabilities = MiotSpecFetcher.extractCapabilities(this.spec);
    this.buildPropertyAndActionMaps();
    this.registerDynamicMethods();
  }

  /**
   * Get a property value from the device using MIoT protocol
   *
   * @param propertyName - Name of the property (e.g. "power", "brightness")
   * @returns Property value
   */
  async getProperty(propertyName: string): Promise<PropertyValue> {
    const prop = this.propertyMap.get(propertyName);
    if (!prop) {
      throw new Error(`Unknown property: ${propertyName}`);
    }

    const result = (await this.call('get_properties', [
      { siid: prop.siid, piid: prop.piid },
    ])) as Array<{ code: number; value: PropertyValue }>;

    if (result[0]?.code === 0) {
      return result[0].value;
    }

    throw new Error(`Failed to get property ${propertyName}: code ${result[0]?.code}`);
  }

  /**
   * Set a property value on the device using MIoT protocol
   *
   * @param propertyName - Name of the property (e.g. "power", "brightness")
   * @param value - Value to set
   */
  async setProperty(propertyName: string, value: PropertyValue): Promise<void> {
    const prop = this.propertyMap.get(propertyName);
    if (!prop) {
      throw new Error(`Unknown property: ${propertyName}`);
    }

    const result = (await this.call('set_properties', [
      { siid: prop.siid, piid: prop.piid, value },
    ])) as Array<{ code: number }>;

    if (result[0]?.code !== 0) {
      throw new Error(`Failed to set property ${propertyName}: code ${result[0]?.code}`);
    }
  }

  /**
   * Call an action on the device using MIoT protocol
   *
   * @param actionName - Name of the action
   * @param params - Action parameters
   * @returns Action result
   */
  async callAction(actionName: string, params: PropertyValue[] = []): Promise<unknown> {
    const action = this.actionMap.get(actionName);
    if (!action) {
      throw new Error(`Unknown action: ${actionName}`);
    }

    return this.call('action', [
      {
        siid: action.siid,
        aiid: action.aiid,
        in: params,
      },
    ]);
  }

  /**
   * Get all available device capabilities from the MIoT specification
   *
   * @returns Array of capabilities with properties and actions
   */
  getCapabilities(): DeviceCapability[] {
    return this.capabilities;
  }

  /**
   * Get the raw MIoT specification
   *
   * @returns MIoT spec or null if not initialized
   */
  getSpec(): MiotSpec | null {
    return this.spec;
  }

  /**
   * Check if the device has been initialized with its MIoT spec
   */
  isInitialized(): boolean {
    return this.spec !== null;
  }

  /**
   * Build internal maps for quick property/action lookup
   */
  private buildPropertyAndActionMaps(): void {
    if (!this.spec) return;

    for (const service of this.spec.services) {
      const siid = service.iid;

      // Map properties
      if (service.properties) {
        for (const prop of service.properties) {
          const name = prop.type.split(':').pop() || prop.type;
          this.propertyMap.set(name, { siid, piid: prop.iid });
        }
      }

      // Map actions
      if (service.actions) {
        for (const action of service.actions) {
          const name = action.type.split(':').pop() || action.type;
          this.actionMap.set(name, { siid, aiid: action.iid });
        }
      }
    }
  }

  /**
   * Register dynamic getter/setter methods for properties.
   * Creates methods like setPower(), setBrightness(), etc.
   */
  private registerDynamicMethods(): void {
    for (const [propName] of this.propertyMap) {
      const capitalizedName = propName.charAt(0).toUpperCase() + propName.slice(1);
      const getterName = `get${capitalizedName}`;
      const setterName = `set${capitalizedName}`;

      // Register getter
      if (!(getterName in this)) {
        Object.defineProperty(this, getterName, {
          value: async () => this.getProperty(propName),
          writable: false,
          enumerable: true,
        });
      }

      // Register setter
      if (!(setterName in this)) {
        Object.defineProperty(this, setterName, {
          value: async (value: PropertyValue) => this.setProperty(propName, value),
          writable: false,
          enumerable: true,
        });
      }
    }

    // Register action methods
    for (const [actionName] of this.actionMap) {
      const capitalizedName = actionName.charAt(0).toUpperCase() + actionName.slice(1);
      const methodName = `call${capitalizedName}`;

      if (!(methodName in this)) {
        Object.defineProperty(this, methodName, {
          value: async (...params: PropertyValue[]) => this.callAction(actionName, params),
          writable: false,
          enumerable: true,
        });
      }
    }
  }
}
