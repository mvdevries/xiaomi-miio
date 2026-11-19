# Security policy

## Supported versions

Only the latest released version of `xiaomi-miio` receives security fixes.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately through GitHub: open the **Security** tab of this repository and choose
**Report a vulnerability**. Include what you found, the version of the package, and the steps to reproduce it.

This is a hobby project maintained in spare time. You can expect an acknowledgement within a week and an
update on the fix as soon as there is one. Once a fix is released, the report can be made public together
with credit to you, if you want that.

## What is in scope

- The library code in this repository, including the miIO packet encoding and encryption.
- The way the library handles device tokens.

## What is out of scope

- Vulnerabilities in the miIO protocol itself, in Xiaomi devices or firmware, or in dependencies; report those
  to their maintainers. Dependency updates are handled by Dependabot.
- Problems that need physical access to a device or a compromised local network.
