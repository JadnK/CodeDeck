# Security Policy

CodeDeck opens local folders, launches external applications and runs user-configured commands. Security reports involving those areas are taken seriously.

## Supported versions

| Version | Supported |
|---|---|
| 1.0.x | Yes |
| 0.2.x | No |
| 0.1.x | No |

Only the latest stable release line receives security fixes.

## Reporting a vulnerability

Do not open a public issue for a security vulnerability.

Use **Security → Report a vulnerability** on the CodeDeck repository to submit a private report. When private vulnerability reporting is unavailable, contact the maintainer through their GitHub profile and ask for a private reporting channel. Do not include exploit details in a public message.

A useful report includes:

- the affected CodeDeck version
- operating system and architecture
- a clear description of the issue
- steps to reproduce it
- expected and actual behavior
- possible impact
- logs or screenshots with secrets removed
- a proposed fix, when available

## Relevant security areas

Examples include:

- command injection through project paths or templates
- commands running without explicit user action
- unsafe handling of imported configuration
- unintended modification or deletion of project files
- exposure of `.env` files, tokens or other secrets
- path traversal while creating or copying templates
- unsafe process termination
- release artifacts or update metadata being replaced or tampered with

## Disclosure

Please allow time for the issue to be reproduced and fixed before publishing details. Credit can be included in the release notes unless anonymity is requested.
