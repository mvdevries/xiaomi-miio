/**
 * Interactive CLI for the Xiaomi Mi Bedside Lamp 2 (yeelink.light.bslamp2).
 *
 * Usage:
 *   npm run example:bedlamp2
 *
 * You will be prompted for the device IP address and token. After connecting,
 * you can control the lamp with simple text commands.
 */

import { createInterface, type Interface as ReadlineInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { MiioDevice, MiioProtocol } from '../src/index.js';

// ── Types ───────────────────────────────────────────────────────────────────

interface LampState {
  power: string;
  brightness: number;
  colorMode: number;
  rgb: number;
  hue: number;
  saturation: number;
  colorTemperature: number;
}

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

// ── BedsideLamp2 ────────────────────────────────────────────────────────────

/** High-level wrapper around {@link MiioDevice} for the Mi Bedside Lamp 2. */
class BedsideLamp2 {
  private static readonly MODEL = 'yeelink.light.bslamp2';
  private static readonly TRANSITION_MS = 500;
  private static readonly COLOR_MODE_NAMES: Record<number, string> = {
    1: 'rgb',
    2: 'ct',
    3: 'hsv',
  };

  private readonly device: MiioDevice;

  constructor(address: string, token: Buffer) {
    this.device = new MiioDevice({
      address,
      token,
      model: BedsideLamp2.MODEL,
    });
  }

  /** Perform the handshake and return the device ID. */
  async connect(): Promise<number> {
    const info = await this.device.connect();
    return info.deviceId;
  }

  async turnOn(): Promise<void> {
    await this.device.call('set_power', ['on', 'smooth', BedsideLamp2.TRANSITION_MS]);
  }

  async turnOff(): Promise<void> {
    await this.device.call('set_power', ['off', 'smooth', BedsideLamp2.TRANSITION_MS]);
  }

  async setBrightness(level: number): Promise<void> {
    await this.device.call('set_bright', [Math.round(level), 'smooth', BedsideLamp2.TRANSITION_MS]);
  }

  async setColor({ r, g, b }: RgbColor): Promise<void> {
    const rgb = ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
    await this.device.call('set_rgb', [rgb, 'smooth', BedsideLamp2.TRANSITION_MS]);
  }

  async setColorTemperature(kelvin: number): Promise<void> {
    await this.device.call('set_ct_abx', [Math.round(kelvin), 'smooth', BedsideLamp2.TRANSITION_MS]);
  }

  async getState(): Promise<LampState> {
    const result = (await this.device.getProperties([
      'power', 'bright', 'color_mode', 'rgb', 'hue', 'sat', 'ct',
    ])) as unknown[];
    return {
      power: result[0] as string,
      brightness: result[1] as number,
      colorMode: result[2] as number,
      rgb: result[3] as number,
      hue: result[4] as number,
      saturation: result[5] as number,
      colorTemperature: result[6] as number,
    };
  }

  /** Destroy the underlying transport. */
  destroy(): void {
    this.device.destroy();
  }

  /** Resolve the human-readable name for a color mode integer. */
  static colorModeName(mode: number): string {

    return BedsideLamp2.COLOR_MODE_NAMES[mode] ?? 'unknown';
  }

  /** Split a packed RGB integer into individual channels. */
  static splitRgb(rgb: number): RgbColor {
    return {
      r: (rgb >> 16) & 0xff,
      g: (rgb >> 8) & 0xff,
      b: rgb & 0xff,
    };
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────

/** Command handler signature — each command is a simple async function. */
type CommandHandler = (args: string[]) => Promise<void>;

/** Interactive command-line controller for a {@link BedsideLamp2}. */
class LampCli {
  private readonly lamp: BedsideLamp2;
  private readonly rl: ReadlineInterface;
  private readonly commands: Map<string, CommandHandler>;
  private running = true;

  constructor(lamp: BedsideLamp2, rl: ReadlineInterface) {
    this.lamp = lamp;
    this.rl = rl;
    this.commands = this.buildCommandMap();
  }

  /** Run the interactive prompt loop until the user exits. */
  async run(): Promise<void> {
    await this.printCurrentState();
    this.printHelp();
    console.log('');

    while (this.running) {
      let line: string;
      try {
        line = await this.rl.question('> ');
      } catch {
        break; // readline closed (Ctrl+D)
      }

      const [cmd, ...args] = line.trim().split(/\s+/);
      if (!cmd) continue;

      const handler = this.commands.get(cmd.toLowerCase());
      if (!handler) {
        console.log(`Unknown command: ${cmd}. Type "help" for available commands.`);
        continue;
      }

      try {
        await handler(args);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Error: ${message}`);
      }
    }
  }

  // ── Command handlers ────────────────────────────────────────────────────

  private buildCommandMap(): Map<string, CommandHandler> {
    return new Map<string, CommandHandler>([
      ['on', () => this.lamp.turnOn().then(() => console.log('OK — Lamp turned on'))],
      ['off', () => this.lamp.turnOff().then(() => console.log('OK — Lamp turned off'))],
      ['brightness', (args) => this.handleBrightness(args)],
      ['color', (args) => this.handleColor(args)],
      ['temp', (args) => this.handleTemp(args)],
      ['state', () => this.handleState()],
      ['help', async () => this.printHelp()],
      ['exit', async () => { this.running = false; }],
      ['quit', async () => { this.running = false; }],
    ]);
  }

  private async handleBrightness(args: string[]): Promise<void> {
    const level = Number(args[0]);
    if (isNaN(level) || level < 1 || level > 100) {
      console.log('Usage: brightness <1-100>');
      return;
    }
    await this.lamp.setBrightness(level);
    console.log(`OK — Brightness set to ${Math.round(level)}%`);
  }

  private async handleColor(args: string[]): Promise<void> {
    const r = Number(args[0]);
    const g = Number(args[1]);
    const b = Number(args[2]);
    if ([r, g, b].some(v => isNaN(v) || v < 0 || v > 255)) {
      console.log('Usage: color <r> <g> <b>  (each 0-255)');
      return;
    }
    await this.lamp.setColor({ r, g, b });
    console.log(`OK — Color set to RGB(${r}, ${g}, ${b})`);
  }

  private async handleTemp(args: string[]): Promise<void> {
    const kelvin = Number(args[0]);
    if (isNaN(kelvin) || kelvin < 1700 || kelvin > 6500) {
      console.log('Usage: temp <1700-6500>');
      return;
    }
    await this.lamp.setColorTemperature(kelvin);
    console.log(`OK — Color temperature set to ${Math.round(kelvin)}K`);
  }

  private async handleState(): Promise<void> {
    const state = await this.lamp.getState();
    this.printState(state);
  }

  // ── Output helpers ──────────────────────────────────────────────────────

  private async printCurrentState(): Promise<void> {
    try {
      const state = await this.lamp.getState();
      console.log('Current state:');
      this.printState(state);
    } catch {
      console.log('(Could not read initial state)');
    }
  }

  private printState(state: LampState): void {
    const { r, g, b } = BedsideLamp2.splitRgb(state.rgb);
    console.log(`  Power:       ${state.power}`);
    console.log(`  Brightness:  ${state.brightness}%`);
    console.log(`  Mode:        ${BedsideLamp2.colorModeName(state.colorMode)}`);
    console.log(`  RGB:         ${state.rgb} (${r}, ${g}, ${b})`);
    console.log(`  Hue:         ${state.hue}, Saturation: ${state.saturation}`);
    console.log(`  Color temp:  ${state.colorTemperature}K`);
  }

  private printHelp(): void {
    console.log('Commands:');
    console.log('  on                    Turn on the lamp');
    console.log('  off                   Turn off the lamp');
    console.log('  brightness <1-100>    Set brightness');
    console.log('  color <r> <g> <b>     Set RGB color (0-255 each)');
    console.log('  temp <1700-6500>      Set color temperature in Kelvin');
    console.log('  state                 Show current lamp state');
    console.log('  help                  Show this help');
    console.log('  exit                  Disconnect and exit');
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

(async () => {
  const rl = createInterface({ input: stdin, output: stdout });

  console.log('Mi Bedside Lamp 2 — Interactive CLI');
  console.log('====================================\n');

  const ip = (await rl.question('IP address: ')).trim();
  const tokenHex = (await rl.question('Token (32 hex chars): ')).trim();

  if (!/^[0-9a-fA-F]{32}$/.test(tokenHex)) {
    console.error('Invalid token: must be exactly 32 hexadecimal characters.');
    rl.close();
    process.exit(1);
  }

  const lamp = new BedsideLamp2(ip, MiioProtocol.tokenFromHex(tokenHex));

  console.log(`\nConnecting to ${ip}...`);

  try {
    const deviceId = await lamp.connect();
    console.log(`Connected! Device ID: ${deviceId}\n`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Failed to connect: ${message}`);
    lamp.destroy();
    rl.close();
    process.exit(1);
  }

  const cli = new LampCli(lamp, rl);
  await cli.run();

  lamp.destroy();
  rl.close();
  console.log('Disconnected.');
})();
