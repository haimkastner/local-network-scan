/**
 * A device in the network
 */
export interface NetworkDevice {
  /** Device's IP */
  ip: string;
  /** Device's MAC address */
  mac?: string;
  /** Device's vendor name */
  vendor?: string;
}

/**
 * Scan local network options
 */
export interface ScanOptions {
  /** The local network to scan, should look like xxx.xxx.xxx (default it's machine first IP network) */
  localNetwork?: string;
  /** Detect devices vendor from https://macvendors.com/ API (default false) */
  queryVendor?: boolean;
  /** Ping timeout */
  pingTimeoutMS?: number;
  /** ping batch size */
  beachesSize?: number;
  /** clean in-mem cache of vendor by mac address */
  clearVendorsCache?: boolean;
}