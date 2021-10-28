import axios from 'axios';
import ip from 'ip';
import ping from 'ping';
import { timeout } from 'promise-timeout';
import { getNetworkTableMap } from './arp';
import { NetworkDevice, ScanOptions } from './models';

/** Keep mac vendors results in cache */
const vendorsCache = new Map<string, string>();

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
    throw new Error("Machine don't own IP address, have to pass localNetwork option");
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
    if (vendorsCache.has(mac)) {
      console.debug(`[local-network-scan] found mac ${mac} hit in cache`);
      return vendorsCache.get(mac) || '';
    }
    console.debug(`[local-network-scan] Feting mac ${mac} vendor...`);
    const vendorRes = await axios(`http://macvendors.co/api/${mac}/json`);
    const vendorBody = vendorRes.data as any;
    const vendor = vendorBody?.result?.company || '';
    vendorsCache.set(mac, vendor);
    console.debug(`[local-network-scan] Feting mac ${mac} vendor finished`);
    return vendor;
  } catch (error) {
    console.error(`[local-network-scan] Feting mac ${mac} vendor failed, ${error}`);
    return '';
  }
}

/**
 * Ping device, detect if there is a device and if so, get his mac from ARP table
 * @param ip The ip to ping
 * @param options The scan option
 * @returns ResolvedDevice object, or undefined if there is no devices on current IP
 */
async function pingDevice(ip: string): Promise<NetworkDevice | undefined> {
  try {
    // First ping ip
    const pingResult = await ping.promise.probe(ip, { timeout: 0.5 });
    if (!pingResult.alive) {
      // If no device there, return undefined and abort
      return;
    }

    return {
      ip,
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
  if (options.clearVendorsCache) {
    vendorsCache.clear();
  }

  options.queryVendor = true;
  options.beachesSize = options.beachesSize || 50;
  options.pingTimeoutMS = options.pingTimeoutMS || 1000 * 2.5;

  // First calc the network addresses
  options.localNetwork = getNetworkAddress(options.localNetwork);

  // Hold & run several ping request in batch, batch size based on ScanOptions.beachesSize
  const pingBatches: { [key: number]: (() => Promise<NetworkDevice | undefined>)[] } = {};

  let batch = 0;
  for (let index = 0; index < 255; index++) {
    // If the batch is full (means )
    if (index % options.beachesSize === 0) {
      batch = index; // Keep the device index as bach key
      pingBatches[batch] = [];
    }
    // Prepare the ping promise to ping device index X
    const pingCall = async () => {
      return await timeout(
        pingDevice(`${options.localNetwork}.${index}`),
        (options.pingTimeoutMS || 0) as number,
      ).catch(() => undefined);
    };
    // Add ping call to the bach
    pingBatches[batch].push(pingCall);
  }

  const sampleStartPing = new Date();

  const localDevicesResults: (NetworkDevice | undefined)[] = [];
  console.debug(`[local-network-scan] Pinging the network devices..."`);
  for (const [batch, pingCalls] of Object.entries(pingBatches)) {
    console.debug(`[local-network-scan] Invoking ping batch "${batch}..."`);
    const batchResults = await Promise.all(pingCalls.map(c => c().catch(() => undefined)));
    console.debug(`[local-network-scan] Invoking ping batch "${batch} done"`);
    localDevicesResults.push(...batchResults);
  }
  const localDevices: NetworkDevice[] = localDevicesResults.filter(d => !!d) as NetworkDevice[];

  console.debug(`[local-network-scan] Pinging the network devices finished"`);
  const sampleEndPing = new Date();

  const sampleStartARP = new Date();
  console.debug(`[local-network-scan] Reading ARP table..."`);
  try {
    const macTable = await getNetworkTableMap(options);
    // Load up the mac results to the devices
    for (const localDevice of localDevices) {
      localDevice.mac = macTable.get(localDevice.ip);
    }
  } catch (error) {
    console.error(error);
  }

  console.debug(`[local-network-scan] Reading ARP table finished"`);
  const sampleEndARP = new Date();

  const sampleStartVendor = new Date();
  if (options.queryVendor) {
    console.debug(`[local-network-scan] Fetching devices vendors ..."`);
    const vendorQueries = [];
    for (const localDevice of localDevices) {
      if (!localDevice.mac) {
        // If there is no mac address, skip vendor fetch
        continue;
      }

      vendorQueries.push(async () => {
        localDevice.vendor = await getVendor(localDevice.mac as string);
      });
    }
    await Promise.all(vendorQueries.map(q => q().catch(() => undefined)));
    console.debug(`[local-network-scan] Fetching devices vendors finished"`);
  }
  const sampleEndVendor = new Date();

  const pingsDurationS = (sampleEndPing.getTime() - sampleStartPing.getTime()) / 1000;
  const arpDurationS = (sampleEndARP.getTime() - sampleStartARP.getTime()) / 1000;
  const vendorsDurationS = (sampleEndVendor.getTime() - sampleStartVendor.getTime()) / 1000;
  const totalS = pingsDurationS + arpDurationS + vendorsDurationS;
  console.debug(
    `[local-network-scan] Scanning network devices finished with total ${localDevices.length} devices, pings took ${pingsDurationS}s, ARP read took ${arpDurationS}s, fetch vendors took ${vendorsDurationS}s, total ${totalS}s`,
  );

  return localDevices;
}
