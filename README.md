# local-network-scan

A lightweight library to quickly scan local network.

[![local-network-scan](https://github.com/haimkastner/local-network-scan/actions/workflows/nodejs.yml/badge.svg?branch=main)](https://github.com/haimkastner/local-network-scan/actions/workflows/nodejs.yml)


> The library uses `arp` tool, in case of Linux machine, make sur it's installed on run-time (or install it by `apt-get install net-tools`).

The library ping all network IP's in parallel to make the scan faster should take ~10 seconds or less.

## Install via NPM:

```bash 

npm install local-network-scan

```


## Examples

```typescript
import { scanLocalNetwork } from 'local-network-scan';

(async () => {

	// Scan default network, with default option
	const res1 = await scanLocalNetwork();
	console.log(res1); // [{ ip: '192.168.1.1', mac: '11aa22bb33cc' }, { ip: '192.168.1.2', mac: '12ab23bc34cd' }]

	// Scan specific network
	const res2 = await scanLocalNetwork({ localNetwork: '192.168.2' });
	console.log(res2); // [{ ip: '192.168.2.1', mac: '11aa22bb33cc' }, { ip: '192.168.2.2', mac: '12ab23bc34cd' }]

	// Query device vendor (using https://macvendors.com/ API) - OFF by default
	const res3 = await scanLocalNetwork({ queryVendor: true });
	console.log(res3); // [{ ip: '192.168.2.1', mac: '11aa22bb33cc', vendor: 'some vendor' }, { ip: '192.168.2.2', mac: '12ab23bc34cd', vendor: ''  }]
})()

```
