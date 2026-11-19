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

1. Create a new branch from `main`. The branch name starts with the kind of change, because the release pipeline derives the version from it (see [Versioning](#versioning)):
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

4. Commit your changes. The commit messages are free-form; the title of the pull request becomes the squash commit and the release text.

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

You never update a version number by hand. The version comes from the branch name of the merged pull request:

| Branch name | Version bump |
|---|---|
| `breaking/…` | Major (1.0.0 → **2**.0.0) |
| `feature/…` | Minor (1.0.0 → 1.**1**.0) |
| `fix/…` | Patch (1.0.0 → 1.0.**1**) |

A pull request check rejects other branch names (Dependabot branches are allowed).

### What happens when a PR is merged to main?

The release pipeline (`.github/workflows/release.yml`) runs automatically, unless the change only touches
documentation, `.github`, examples or other non-code files:

1. **Version** — raises the latest `v<version>` tag by the kind of bump from the branch name
2. **Checks** — lint, build, and tests with coverage check
3. **Publish** — builds and publishes the npm package (`@martyndevries/xiaomi-miio`) with that version
4. **Release** — creates the tag and a GitHub Release; the title of the pull request becomes the release text

The version in `package.json` is replaced during the run and is not committed back to `main`.

## Questions?

Ask your question via a [GitHub Issue](https://github.com/mvdevries/xiaomi-miio/issues). We will respond as soon as possible.

## License

By contributing, you agree that your contribution will be released under the [ISC License](LICENSE.md).
