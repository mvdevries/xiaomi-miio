# CLAUDE.md — Project Guide

## Project Overview

`xiaomi-miio` is a zero-dependency Node.js TypeScript library for communicating with Xiaomi devices via the miIO protocol.
It focuses on the protocol and transport layer only (no device-specific logic).

## Architecture

```
xiaomi-miio/
├── src/
│   ├── protocol/         # miIO binary protocol (UDP, AES-128-CBC encryption)
│   ├── device.ts         # Base MiioDevice class
│   └── index.ts          # Public API exports
├── examples/             # CLI examples
├── .github/workflows/    # CI + release pipelines
├── jest.config.ts        # Jest test configuration
├── tsconfig.json
└── tsconfig.examples.json
```

## Key Constraints

- **Runtime has zero external dependencies** — only Node.js built-in modules (`crypto`, `dgram`, `buffer`, `events`)
- **No `fs` module in the library** — runtime code must never import or use `fs`
- **No device-specific code** — only protocol and transport; device implementations live elsewhere
- Protocol uses UDP port 54321, AES-128-CBC encryption with PKCS#7 padding
- Key = MD5(token), IV = MD5(Key + token)
- Packet header: 32 bytes starting with magic `0x2131`

## Requirements

- Node.js 22+ (minimum)
- npm 10+

## Development Commands

```bash
npm install
npm run lint
npm run build
npm run test
npm run test:coverage
```

## Examples

```bash
npm run example:bedlamp2
npm run example:discovery
```

## Build & Test Outputs

- `dist/` from `npm run build`
- `dist-examples/` from `npm run build:examples`
- `coverage/` from `npm run test:coverage` (includes HTML report)

## Quality Gates

- Node.js 22 minimum
- Lint passes for any code changes
- Tests must pass (Jest)
- Coverage thresholds:
  - Lines: ≥80%
  - Statements: ≥80%
  - Functions: ≥80%
  - Branches: ≥75%

## Coding Standards

- Strict TypeScript (`strict: true`)
- No `any` types — use proper interfaces
- All public APIs must have JSDoc comments
- Error handling via typed error classes, not string throws
- Async/await for all IO operations
- Target Node.js 22 runtime
