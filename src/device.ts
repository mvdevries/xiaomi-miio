import { lookupDeviceHostname, type DnsLookupOptions, type DnsLookupResult } from './dns.js';
import { MiioTransport, type TransportOptions } from './protocol/transport.js';

export interface DeviceOptions extends TransportOptions {
  /** Device model identifier (e.g. "yeelink.light.bslamp2"). */
  model?: string | undefined;
}

export interface DeviceInfo {
  address: string;
  deviceId: number;
  model?: string | undefined;
}

/**
 * Base class for miIO devices.
 *
 * Provides the transport layer and common command methods.
 * Subclass this to implement device-specific commands.
 */
export class MiioDevice {
  protected readonly transport: MiioTransport;
  readonly model?: string | undefined;
  readonly address: string;

  constructor(options: DeviceOptions) {
    this.transport = new MiioTransport(options);
    this.model = options.model;
    this.address = options.address;
  }

  /** Connect to the device by performing the handshake. */
  async connect(): Promise<DeviceInfo> {
    const { deviceId } = await this.transport.handshake();
    return {
      address: this.address,
      deviceId,
      model: this.model,
    };
  }

  /** Send a raw miIO command. */
  async call(method: string, params: unknown[] = []): Promise<unknown> {
    return this.transport.send(method, params);
  }

  /** Query device properties. */
  async getProperties(props: string[]): Promise<unknown> {
    return this.call('get_prop', props);
  }

  /** Resolve the device hostname via reverse DNS lookup. */
  async lookupHostname(options: DnsLookupOptions = {}): Promise<DnsLookupResult> {
    return lookupDeviceHostname(this.address, options);
  }

  /** Disconnect and clean up resources. */
  destroy(): void {
    this.transport.destroy();
  }
}
