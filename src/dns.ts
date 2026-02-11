import { lookupService as nodeLookupService } from 'node:dns/promises';

const DEFAULT_PORT = 54321;

/** Result from a DNS hostname lookup. */
export interface DnsLookupResult {
  /** IP address that was looked up. */
  address: string;
  /** Port used for the lookup. */
  port: number;
  /** Resolved hostname, or null if lookup failed. */
  hostname: string | null;
  /** Resolved service name, or null if lookup failed. */
  service: string | null;
  /** Error details if lookup failed. */
  error: DnsLookupError | null;
}

/** Function signature for a DNS lookup implementation. */
export type DnsLookupService = (address: string, port: number) => Promise<{ hostname: string; service: string }>;

/** Options for DNS hostname lookup. */
export interface DnsLookupOptions {
  /** Port to use for reverse DNS lookup. Default: 54321 */
  port?: number | undefined;
  /** Optional lookupService implementation (for testing). */
  lookupService?: DnsLookupService | undefined;
}

/** Error returned when DNS hostname lookup fails. */
export class DnsLookupError extends Error {
  readonly address: string;
  readonly port: number;

  constructor(address: string, port: number, cause: unknown) {
    super(`DNS lookup failed for ${address}:${port}`, { cause });
    this.name = 'DnsLookupError';
    this.address = address;
    this.port = port;
  }
}

/**
 * Resolve the device hostname via reverse DNS lookup.
 */
export async function lookupDeviceHostname(
  address: string,
  options: DnsLookupOptions = {}
): Promise<DnsLookupResult> {
  const port = options.port ?? DEFAULT_PORT;
  const lookupService = options.lookupService ?? nodeLookupService;

  try {
    const { hostname, service } = await lookupService(address, port);
    return { address, port, hostname, service, error: null };
  } catch (err: unknown) {
    return {
      address,
      port,
      hostname: null,
      service: null,
      error: new DnsLookupError(address, port, err),
    };
  }
}
