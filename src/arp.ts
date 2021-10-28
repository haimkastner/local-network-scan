import { ScanOptions } from './models';
import spawn from 'await-spawn';

async function getWindowsNetworkTableMap(options: ScanOptions): Promise<Map<string, string>> {
  // First query ARP
  const rawOutput = await spawn('arp', ['-a']);
  // Read output as string
  const rawOutputString = rawOutput.toString() as string;

  // string should looks like:
  //
  // Interface: 192.168.2.10 --- 0x7
  //   Internet Address      Physical Address      Type
  //   192.168.2.1           74-da-38-eb-16-98     dynamic
  //   192.168.2.19          e8-40-f2-3e-ae-53     dynamic
  //   192.168.2.106         02-81-2a-2d-7f-4c     dynamic
  //   192.168.2.255         ff-ff-ff-ff-ff-ff     static
  //   224.0.0.22            01-00-5e-00-00-16     static
  //   224.0.0.251           01-00-5e-00-00-fb     static
  //   224.0.0.252           01-00-5e-00-00-fc     static
  //   239.255.102.18        01-00-5e-7f-66-12     static
  //   239.255.255.250       01-00-5e-7f-ff-fa     static

  // Split by lines and remove the first 3 lines
  const arpLines = rawOutputString.split('\r\n').slice(3);

  const networkTableMap = new Map();

  // Walk on each ip in table
  for (const arpLine of arpLines) {
    // Split by space, and get first two as IP and MAC
    const [ip, mac] = arpLine
      .trim()
      .split(' ')
      .filter(String)
      .map(i => i.trim());
    // If there is no IP, or the IP is not belong to the local network target skip
    if (!ip?.startsWith(options.localNetwork || '')) {
      continue;
    }

    // Add the device ip/mac without dashes.
    networkTableMap.set(ip, mac.replace(/-/g, ''));
  }

  return networkTableMap;
}

async function getLinuxNetworkTableMap(options: ScanOptions): Promise<Map<string, string>> {
  // First query ARP
  const rawOutput = await spawn('arp', ['-n']);
  // Read output as string
  const rawOutputString = rawOutput.toString() as string;

  // string should looks like:
  // Address                  HWtype  HWaddress           Flags Mask            Iface
  // 192.168.2.19             ether   e8:40:f2:3e:ae:53   C                     eth0
  // 192.168.2.10             ether   bc:ee:7b:75:4b:41   C                     eth0
  // 192.168.2.1              ether   74:da:38:eb:16:98   C                     eth0

  // Split by lines and remove the first 2 lines
  const arpLines = rawOutputString.split('\n').slice(1);

  const networkTableMap = new Map();

  // Walk on each ip in table
  for (const arpLine of arpLines) {
    // Split by space, and get first two as IP and MAC
    const [ip, type, mac] = arpLine
      .trim()
      .split(' ')
      .filter(String)
      .map(i => i.trim());
    // If there is no IP, or the IP is not belong to the local network target skip
    if (!ip?.startsWith(options.localNetwork || '')) {
      continue;
    }

    // Add the device ip/mac without dashes.
    networkTableMap.set(ip, mac.replace(/:/g, ''));
  }

  return networkTableMap;
}

/**
 * Assuming all addresses already pinged, now read the mac table
 */
export async function getNetworkTableMap(options: ScanOptions): Promise<Map<string, string>> {
  if (process.platform.indexOf('win') == 0) {
    return await getWindowsNetworkTableMap(options);
  }
  return await getLinuxNetworkTableMap(options);
}
