import { SmartDevice } from '../../src/miot/smart-device.js';

/**
 * Example CLI for SmartDevice - demonstrates MIoT spec fetching and dynamic properties
 *
 * Usage:
 *   npm run example:smart-device -- <ip-address> <token> <model>
 *
 * Examples:
 *   npm run example:smart-device -- 192.168.1.100 0123456789abcdef0123456789abcdef yeelink.light.bslamp2
 *   npm run example:smart-device -- 192.168.1.101 fedcba9876543210fedcba9876543210 zhimi.fan.za4
 */

const [, , address, token, model] = process.argv;

if (!address || !token || !model) {
  console.error('Usage: npm run example:smart-device -- <ip-address> <token> <model>');
  console.error('');
  console.error('Examples:');
  console.error('  npm run example:smart-device -- 192.168.1.100 0123456789abcdef0123456789abcdef yeelink.light.bslamp2');
  console.error('  npm run example:smart-device -- 192.168.1.101 fedcba9876543210fedcba9876543210 zhimi.fan.za4');
  process.exit(1);
}

async function main() {
  const device = new SmartDevice({ address, token, model });

  try {
    console.log(`Connecting to ${model} at ${address}...`);
    const info = await device.connect();
    console.log('Connected:', info);

    console.log('\nInitializing device (fetching MIoT spec)...');
    await device.initialize();
    console.log('Device initialized successfully');

    console.log('\n=== Device Capabilities ===');
    const capabilities = device.getCapabilities();

    // Group by service
    const serviceMap = new Map<string, typeof capabilities>();
    for (const cap of capabilities) {
      if (!serviceMap.has(cap.service)) {
        serviceMap.set(cap.service, []);
      }
      serviceMap.get(cap.service)!.push(cap);
    }

    for (const [serviceName, caps] of serviceMap) {
      console.log(`\n[${serviceName}] ${caps[0].serviceDescription}`);

      for (const cap of caps) {
        if (cap.property) {
          const { name, description, format, access, unit, valueRange, valueList } = cap.property;
          console.log(`  • ${name} (${format}${unit ? `, ${unit}` : ''})`);
          console.log(`    ${description}`);
          console.log(`    Access: ${access.join(', ')}`);

          if (valueRange) {
            console.log(`    Range: ${valueRange[0]} to ${valueRange[1]} (step: ${valueRange[2]})`);
          }

          if (valueList) {
            console.log(`    Values: ${valueList.map((v) => `${v.value}="${v.description}"`).join(', ')}`);
          }
        }

        if (cap.action) {
          const { name, description } = cap.action;
          console.log(`  ⚡ ${name}`);
          console.log(`    ${description}`);
        }
      }
    }

    console.log('\n=== Dynamic Methods ===');
    console.log('Available on device instance:');

    // Show available getter/setter methods
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(device)).concat(
      Object.keys(device),
    );

    const getters = methods.filter((m) => m.startsWith('get') && m !== 'getProperty' && m !== 'getProperties' && m !== 'getCapabilities' && m !== 'getSpec');
    const setters = methods.filter((m) => m.startsWith('set') && m !== 'setProperty');

    if (getters.length > 0) {
      console.log('\nGetters:');
      getters.forEach((m) => console.log(`  - ${m}()`));
    }

    if (setters.length > 0) {
      console.log('\nSetters:');
      setters.forEach((m) => console.log(`  - ${m}(value)`));
    }

    console.log('\n=== Example Usage ===');
    console.log('// Get property');
    console.log('const power = await device.getProperty("power");');
    console.log('// or use dynamic method:');
    if (getters.length > 0) {
      console.log(`const power = await device.${getters[0]}();`);
    }

    console.log('\n// Set property');
    console.log('await device.setProperty("power", true);');
    console.log('// or use dynamic method:');
    if (setters.length > 0) {
      console.log(`await device.${setters[0]}(true);`);
    }
  } catch (error) {
    console.error('\nError:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    device.destroy();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
