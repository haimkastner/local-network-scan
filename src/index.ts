import axios from 'axios';
import ip from 'ip';
import nodeArp from 'node-arp';
import ping from 'ping';

/**
 * A device in the network
 */
export interface NetworkDevice {
  /** Device's IP */
  ip: string;
  /** Device's MAC address */
  mac: string;
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
}

/**
 * Convert nodeArp callback driven API to promise function
 * @param ip The IP to query
 * @returns The IP's mac address
 */
async function getMac(ip: string): Promise<string> {
  return new Promise<string>((res, rej) => {
    nodeArp.getMAC(ip, (err: any, mac: string) => {
      if (err) {
        rej(err);
        return;
      }
      res(mac);
    });
  });
}

/**
 * Detect local network to scan
 * @param localNetwork The local network to scan (Optional)
 * @returns The localNetwork to scan
 */
function getNetworkAddress(localNetwork?: string): string {
  // If localNetwork passed, just make sure it's valid
  if (localNetwork) {
    const parts = localNetwork.split('.');
    if (parts.length === 3) {
      return localNetwork;
    }
    throw new Error('localNetwork should be xxx.xxx.xxx');
  }

  // Get device IP
  const machineIp = ip.address();
  const machineIpParts = machineIp.split('.');
  if (machineIpParts.length !== 4) {
    throw new Error("MAchine don't own IP address, have to pass localNetwork option");
  }

  // Get network only address
  return machineIpParts.slice(0, -1).join('.');
}

/**
 * Query https://macvendors.com/ API
 * @param mac The mac to query for
 * @returns The vendor results
 */
async function getVendor(mac: string): Promise<string> {
  try {
    const vendorRes = await axios(`http://macvendors.co/api/${mac}/json`);
    const vendorBody = vendorRes.data as any;
    return vendorBody?.result?.company || '';
  } catch (error) {
    return '';
  }
}

/**
 * Ping device, detect if there is a device and if so, get his mac from ARP table
 * @param ip The ip to ping
 * @param options The scan option
 * @returns ResolvedDevice object, or undefined if there is no devices on current IP
 */
async function pingDevice(ip: string, options: ScanOptions): Promise<NetworkDevice | undefined> {
  try {
    // First ping ip
    const pingResult = await ping.promise.probe(ip, { timeout: 0.5 });
    if (!pingResult.alive) {
      // If no device there, return undefined and abort
      return;
    }
    // Get devices' mac
    const rawMac = await getMac(ip);

    let vendor;
    if (options.queryVendor) {
      // Get device's vendor, if required
      vendor = await getVendor(rawMac);
    }

    // Convert mac from any convention (suc as '11:aa:22:bb:33:cc') to '11aa22bb33cc'
    const mac = rawMac.replace(/:|-|_| /g, '').toLowerCase();

    return {
      ip,
      mac,
      vendor,
    };
  } catch (error) {
    // Do nothing in case of ping error, it's OK.
  }
}

/**
 * Scan local network devices in parallel
 * @param options See @see ScanOptions
 * @returns The network devices collection
 */
export async function scanLocalNetwork(options: ScanOptions = {}): Promise<NetworkDevice[]> {
  // First calc the network addresses
  options.localNetwork = getNetworkAddress(options.localNetwork);

  // Generate all network IP's
  const networkDeviceCandidate: string[] = [];
  for (let index = 0; index < 255; index++) {
    networkDeviceCandidate.push(`${options.localNetwork}.${index}`);
  }

  // Query all devices in parallel, and wats for the results
  const allResults = await Promise.all(
    networkDeviceCandidate.map(deviceCandidate => pingDevice(deviceCandidate, options)),
  );

  // Clean up all non used IP's (pingHost returns undefined in any case of failure)
  const succeedResults = allResults.filter(r => !!r);
  return succeedResults as NetworkDevice[];
}
