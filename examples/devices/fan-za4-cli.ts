/**
 * Interactive CLI for the Smartmi Standing Fan 2S (zhimi.fan.za4).
 *
 * Usage:
 *   npm run example:fan-za4
 *
 * You will be prompted for the device IP address and token. After connecting,
 * you can control the fan with simple text commands.
 */

import { createInterface, type Interface as ReadlineInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { MiioDevice, MiioProtocol } from '../../src';

// ── Types ───────────────────────────────────────────────────────────────────

interface FanState {
  power: string;
  acPower: string;
  speedLevel: number;
  naturalLevel: number;
  speed: number;
  angle: number;
  angleEnable: string;
  buzzer: number;
  ledBrightness: number;
  childLock: string;
  poweroffTime: number;
  useTime: number;
}

// ── SmartmiFanZA4 ──────────────────────────────────────────────────────────

/** High-level wrapper around {@link MiioDevice} for the Smartmi Standing Fan 2S. */
class SmartmiFanZA4 {
  private static readonly MODEL = 'zhimi.fan.za4';
  private static readonly LED_NAMES: Record<number, string> = {
    0: 'bright',
    1: 'dim',
    2: 'off',
  };

  private readonly device: MiioDevice;

  constructor(address: string, token: Buffer) {
    this.device = new MiioDevice({
      address,
      token,
      model: SmartmiFanZA4.MODEL,
    });
  }

  /** Perform the handshake and return the device ID. */
  async connect(): Promise<number> {
    const info = await this.device.connect();
    return info.deviceId;
  }

  async turnOn(): Promise<void> {
    await this.device.call('set_power', ['on']);
  }

  async turnOff(): Promise<void> {
    await this.device.call('set_power', ['off']);
  }

  async setSpeedLevel(level: number): Promise<void> {
    await this.device.call('set_speed_level', [level]);
  }

  async setNaturalLevel(level: number): Promise<void> {
    await this.device.call('set_natural_level', [level]);
  }

  async setAngle(degrees: number): Promise<void> {
    await this.device.call('set_angle', [degrees]);
  }

  async setAngleEnable(enabled: boolean): Promise<void> {
    await this.device.call('set_angle_enable', [enabled ? 'on' : 'off']);
  }

  async move(direction: 'left' | 'right'): Promise<void> {
    await this.device.call('set_move', [direction]);
  }

  async setBuzzer(on: boolean): Promise<void> {
    await this.device.call('set_buzzer', [on ? 2 : 0]);
  }

  async setLedBrightness(level: number): Promise<void> {
    await this.device.call('set_led_b', [level]);
  }

  async setChildLock(on: boolean): Promise<void> {
    await this.device.call('set_child_lock', [on ? 'on' : 'off']);
  }

  async setPoweroffTime(seconds: number): Promise<void> {
    await this.device.call('set_poweroff_time', [seconds]);
  }

  async getState(): Promise<FanState> {
    const result = (await this.device.getProperties([
      'power', 'ac_power', 'speed_level', 'natural_level', 'speed',
      'angle', 'angle_enable', 'buzzer', 'led_b', 'child_lock',
      'poweroff_time', 'use_time',
    ])) as unknown[];
    return {
      power: result[0] as string,
      acPower: result[1] as string,
      speedLevel: result[2] as number,
      naturalLevel: result[3] as number,
      speed: result[4] as number,
      angle: result[5] as number,
      angleEnable: result[6] as string,
      buzzer: result[7] as number,
      ledBrightness: result[8] as number,
      childLock: result[9] as string,
      poweroffTime: result[10] as number,
      useTime: result[11] as number,
    };
  }

  /** Destroy the underlying transport. */
  destroy(): void {
    this.device.destroy();
  }

  /** Resolve the human-readable name for an LED brightness level. */
  static ledName(level: number): string {
    return SmartmiFanZA4.LED_NAMES[level] ?? 'unknown';
  }

  /** Format seconds as a human-readable duration. */
  static formatDuration(seconds: number): string {
    if (seconds <= 0) return 'off';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const parts: string[] = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0 || parts.length === 0) parts.push(`${s}s`);
    return parts.join(' ');
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────

/** Command handler signature — each command is a simple async function. */
type CommandHandler = (args: string[]) => Promise<void>;

/** Interactive command-line controller for a {@link SmartmiFanZA4}. */
class FanCli {
  private readonly fan: SmartmiFanZA4;
  private readonly rl: ReadlineInterface;
  private readonly commands: Map<string, CommandHandler>;
  private running = true;

  constructor(fan: SmartmiFanZA4, rl: ReadlineInterface) {
    this.fan = fan;
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
      ['on', () => this.fan.turnOn().then(() => console.log('OK — Fan turned on'))],
      ['off', () => this.fan.turnOff().then(() => console.log('OK — Fan turned off'))],
      ['speed', (args) => this.handleSpeed(args)],
      ['natural', (args) => this.handleNatural(args)],
      ['angle', (args) => this.handleAngle(args)],
      ['oscillate', (args) => this.handleOscillate(args)],
      ['move', (args) => this.handleMove(args)],
      ['buzzer', (args) => this.handleBuzzer(args)],
      ['led', (args) => this.handleLed(args)],
      ['lock', (args) => this.handleChildLock(args)],
      ['timer', (args) => this.handleTimer(args)],
      ['state', () => this.handleState()],
      ['help', async () => this.printHelp()],
      ['exit', async () => { this.running = false; }],
      ['quit', async () => { this.running = false; }],
    ]);
  }

  private async handleSpeed(args: string[]): Promise<void> {
    const level = Number(args[0]);
    if (isNaN(level) || level < 1 || level > 100) {
      console.log('Usage: speed <1-100>');
      return;
    }
    await this.fan.setSpeedLevel(level);
    console.log(`OK — Speed set to ${level}% (direct mode)`);
  }

  private async handleNatural(args: string[]): Promise<void> {
    const level = Number(args[0]);
    if (isNaN(level) || level < 1 || level > 100) {
      console.log('Usage: natural <1-100>');
      return;
    }
    await this.fan.setNaturalLevel(level);
    console.log(`OK — Speed set to ${level}% (natural mode)`);
  }

  private async handleAngle(args: string[]): Promise<void> {
    const degrees = Number(args[0]);
    if (isNaN(degrees) || degrees < 30 || degrees > 120) {
      console.log('Usage: angle <30-120>  (common values: 30, 60, 90, 120)');
      return;
    }
    await this.fan.setAngle(degrees);
    console.log(`OK — Oscillation angle set to ${degrees} degrees`);
  }

  private async handleOscillate(args: string[]): Promise<void> {
    const value = args[0]?.toLowerCase();
    if (value !== 'on' && value !== 'off') {
      console.log('Usage: oscillate <on|off>');
      return;
    }
    await this.fan.setAngleEnable(value === 'on');
    console.log(`OK — Oscillation ${value}`);
  }

  private async handleMove(args: string[]): Promise<void> {
    const direction = args[0]?.toLowerCase();
    if (direction !== 'left' && direction !== 'right') {
      console.log('Usage: move <left|right>');
      return;
    }
    await this.fan.move(direction);
    console.log(`OK — Fan nudged ${direction}`);
  }

  private async handleBuzzer(args: string[]): Promise<void> {
    const value = args[0]?.toLowerCase();
    if (value !== 'on' && value !== 'off') {
      console.log('Usage: buzzer <on|off>');
      return;
    }
    await this.fan.setBuzzer(value === 'on');
    console.log(`OK — Buzzer ${value}`);
  }

  private async handleLed(args: string[]): Promise<void> {
    const value = args[0]?.toLowerCase();
    const ledMap: Record<string, number> = { bright: 0, dim: 1, off: 2 };
    const level = value !== undefined ? ledMap[value] : undefined;
    if (level === undefined) {
      console.log('Usage: led <bright|dim|off>');
      return;
    }
    await this.fan.setLedBrightness(level);
    console.log(`OK — LED set to ${value}`);
  }

  private async handleChildLock(args: string[]): Promise<void> {
    const value = args[0]?.toLowerCase();
    if (value !== 'on' && value !== 'off') {
      console.log('Usage: lock <on|off>');
      return;
    }
    await this.fan.setChildLock(value === 'on');
    console.log(`OK — Child lock ${value}`);
  }

  private async handleTimer(args: string[]): Promise<void> {
    const value = args[0]?.toLowerCase();
    if (value === 'off') {
      await this.fan.setPoweroffTime(0);
      console.log('OK — Timer disabled');
      return;
    }
    const minutes = Number(value);
    if (isNaN(minutes) || minutes < 1) {
      console.log('Usage: timer <minutes>   (or "timer off" to disable)');
      return;
    }
    const seconds = minutes * 60;
    await this.fan.setPoweroffTime(seconds);
    console.log(`OK — Timer set to ${minutes} minute(s)`);
  }

  private async handleState(): Promise<void> {
    const state = await this.fan.getState();
    this.printState(state);
  }

  // ── Output helpers ──────────────────────────────────────────────────────

  private async printCurrentState(): Promise<void> {
    try {
      const state = await this.fan.getState();
      console.log('Current state:');
      this.printState(state);
    } catch {
      console.log('(Could not read initial state)');
    }
  }

  private printState(state: FanState): void {
    const mode = state.naturalLevel > 0 ? 'natural' : 'direct';
    const activeSpeed = state.naturalLevel > 0 ? state.naturalLevel : state.speedLevel;
    console.log(`  Power:        ${state.power}`);
    console.log(`  AC power:     ${state.acPower}`);
    console.log(`  Mode:         ${mode}`);
    console.log(`  Speed:        ${activeSpeed}% (${state.speed} RPM)`);
    console.log(`  Oscillation:  ${state.angleEnable} (${state.angle} degrees)`);
    console.log(`  LED:          ${SmartmiFanZA4.ledName(state.ledBrightness)}`);
    console.log(`  Buzzer:       ${state.buzzer === 0 ? 'off' : 'on'}`);
    console.log(`  Child lock:   ${state.childLock}`);
    console.log(`  Timer:        ${SmartmiFanZA4.formatDuration(state.poweroffTime)}`);
    console.log(`  Use time:     ${SmartmiFanZA4.formatDuration(state.useTime)}`);
  }

  private printHelp(): void {
    console.log('Commands:');
    console.log('  on                      Turn on the fan');
    console.log('  off                     Turn off the fan');
    console.log('  speed <1-100>           Set speed (direct mode)');
    console.log('  natural <1-100>         Set speed (natural wind mode)');
    console.log('  angle <30-120>          Set oscillation angle');
    console.log('  oscillate <on|off>      Enable/disable oscillation');
    console.log('  move <left|right>       Nudge fan head left or right');
    console.log('  buzzer <on|off>         Enable/disable buzzer');
    console.log('  led <bright|dim|off>    Set LED brightness');
    console.log('  lock <on|off>           Enable/disable child lock');
    console.log('  timer <minutes|off>     Set auto power-off timer');
    console.log('  state                   Show current fan state');
    console.log('  help                    Show this help');
    console.log('  exit                    Disconnect and exit');
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

(async () => {
  const rl = createInterface({ input: stdin, output: stdout });

  console.log('Smartmi Standing Fan 2S (zhimi.fan.za4) — Interactive CLI');
  console.log('==========================================================\n');

  const ip = (await rl.question('IP address: ')).trim();
  const tokenHex = (await rl.question('Token (32 hex chars): ')).trim();

  if (!/^[0-9a-fA-F]{32}$/.test(tokenHex)) {
    console.error('Invalid token: must be exactly 32 hexadecimal characters.');
    rl.close();
    process.exit(1);
  }

  const fan = new SmartmiFanZA4(ip, MiioProtocol.tokenFromHex(tokenHex));

  console.log(`\nConnecting to ${ip}...`);

  try {
    const deviceId = await fan.connect();
    console.log(`Connected! Device ID: ${deviceId}\n`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Failed to connect: ${message}`);
    fan.destroy();
    rl.close();
    process.exit(1);
  }

  const cli = new FanCli(fan, rl);
  await cli.run();

  fan.destroy();
  rl.close();
  console.log('Disconnected.');
})();
