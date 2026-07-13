# Contributing to CodeDeck

Thanks for taking the time to contribute. CodeDeck is a local desktop application built with Tauri, React, TypeScript and Rust.

## Before you start

- Search the existing issues before opening a new one.
- Open an issue before starting a large feature or architectural change.
- Keep pull requests focused. Unrelated changes should be submitted separately.
- Never include API keys, passwords, private paths, `.env` files or other secrets.

## Local setup

You need:

- Node.js 24
- pnpm 10
- the Rust toolchain
- the platform requirements for Tauri 2

Install dependencies:

```bash
pnpm install --frozen-lockfile
```

Start the desktop app:

```bash
pnpm tauri:dev
```

Build the frontend:

```bash
pnpm build
```

Check the Rust code:

```bash
cargo check --locked --manifest-path src-tauri/Cargo.toml
```

Create a release build:

```bash
pnpm tauri:build
```

## Branches

Use a short, descriptive branch name:

```text
feature/project-import
feature/workspace-actions
fix/windows-terminal-launch
docs/project-guide
refactor/process-runner
```

## Commit messages

Use clear commit messages that describe one logical change:

```text
feat: add custom project templates
fix: prevent terminal window from opening on Windows
docs: explain workspace actions
refactor: separate project detection from storage
chore: update Tauri dependencies
```

## Pull requests

A pull request should include:

- a short explanation of the problem
- a summary of the chosen solution
- testing steps
- screenshots for visible UI changes
- documentation updates when behavior changes

Before opening a pull request, run:

```bash
pnpm build
cargo check --locked --manifest-path src-tauri/Cargo.toml
```

Also perform a short manual check for the affected workflow. For example, a change to project creation should be tested by creating a project, opening it and running one generated command.

## Project rules

CodeDeck interacts with local files and executable commands, so these rules are important:

- Commands must only run after an explicit user action.
- Imported commands must never run automatically.
- Project source files must not be changed without a clear user action.
- Sensitive files such as `.env` must not be displayed or added to logs automatically.
- Errors should explain what failed and how the user can fix it.
- New pages and dialogs should include useful empty and error states.

## Reporting security issues

Do not report security vulnerabilities in a public issue. Follow the instructions in [SECURITY.md](SECURITY.md).
