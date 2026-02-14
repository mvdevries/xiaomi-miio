# Contributing

Thank you for your interest in contributing to `xiaomi-miio`! This document describes how you can contribute.

## Before you start

1. **Open an issue first** — Before starting work on a change, create a [GitHub Issue](https://github.com/mvdevries/xiaomi-miio/issues) to discuss your proposal. This prevents duplicate work and ensures your change fits within the project.
2. **Wait for feedback** — A maintainer will respond to your issue. Once there is agreement on the approach, you can start implementing.

## Setting up your development environment

```bash
# Fork and clone the repository
git clone https://github.com/<your-username>/xiaomi-miio.git
cd xiaomi-miio

# Install dependencies
npm install

# Build the project
npm run build

# Run the tests
npm run test:dev
```

## Making changes

1. Create a new branch from `main`:
   ```bash
   git checkout -b feature/my-change
   ```

2. Make your changes and write tests.

3. Verify that everything works:
   ```bash
   npm run lint          # Code style check
   npm run build         # TypeScript compilation
   npm run test:dev      # Run tests
   ```

4. Commit your changes using a [Conventional Commit](https://www.conventionalcommits.org/) message (see [Versioning](#versioning) below for details):
   ```bash
   # Bug fix
   git commit -m "fix: description of the fix"

   # New feature
   git commit -m "feat: description of the feature"
   ```

5. Push your branch and create a Pull Request targeting `main`.

## Pull Request guidelines

- Reference the related issue in your PR description (e.g. "Closes #12")
- Make sure the CI pipeline passes (lint, build, tests)
- Include tests for your changes
- Keep your changes small and focused — prefer multiple small PRs over a single large one

## What we expect

- **Tests are required** — All changes must be accompanied by tests. Test coverage must remain at or above 80%.
- **No external dependencies** — This project intentionally has zero runtime dependencies. Only use Node.js built-in modules.
- **No device-specific code** — This library focuses on the miIO protocol and transport. Device-specific logic belongs elsewhere.
- **TypeScript strict mode** — No `any` types, use proper interfaces.

## Reporting bugs

Found a bug? Create an [issue](https://github.com/mvdevries/xiaomi-miio/issues) with:

- A clear description of the problem
- Steps to reproduce the issue
- Expected vs. actual behavior
- Node.js version and OS

## Versioning

This project uses [semantic-release](https://github.com/semantic-release/semantic-release) for fully automated version management and publishing. You never need to manually update a version number — it is determined by the type of commit message you write, following the [Conventional Commits](https://www.conventionalcommits.org/) format.

### Commit message format

```
<type>(<optional scope>): <short description>

<optional body>

<optional footer>
```

| Commit prefix | Example | Release type |
|---|---|---|
| `fix: ...` | `fix: correct UDP timeout handling` | Patch (1.0.0 → 1.0.**1**) |
| `feat: ...` | `feat: add discovery timeout option` | Minor (1.0.0 → 1.**1**.0) |
| `feat!: ...` or `BREAKING CHANGE:` in body | `feat!: change connect() return type` | Major (1.0.0 → **2**.0.0) |

Other prefixes (`chore:`, `docs:`, `refactor:`, `test:`, `ci:`) do **not** trigger a release but will appear in the changelog.

**More examples:**

```bash
# Bug fix → patch release
git commit -m "fix: handle empty token in handshake response"

# New feature → minor release
git commit -m "feat: add broadcast address option to discovery"

# Breaking change → major release
git commit -m "feat!: rename MiioDevice to Device

BREAKING CHANGE: MiioDevice class is renamed to Device.
Update all imports accordingly."

# No release triggered
git commit -m "refactor: extract packet parsing to separate function"
git commit -m "test: add unit tests for encryption edge cases"
```

### What happens when a PR is merged to main?

The CI pipeline runs automatically:

1. **Build & Test** — lint, build, and tests with coverage check
2. **Semantic Release** — analyzes all new commits since the last release and:
   - Determines the new version number
   - Generates the CHANGELOG.md
   - Publishes the npm package (`@martyndevries/xiaomi-miio`)
   - Creates a GitHub Release with release notes
   - Commits the updated `package.json`, `package-lock.json`, and `CHANGELOG.md` back to `main`

If there are no `fix:` or `feat:` commits since the last release, no new version is published.

## Questions?

Ask your question via a [GitHub Issue](https://github.com/mvdevries/xiaomi-miio/issues). We will respond as soon as possible.

## License

By contributing, you agree that your contribution will be released under the [ISC License](LICENSE.md).
