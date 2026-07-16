# Code Deck

Code Deck is a local desktop cockpit for developers. It keeps projects, IDE launchers, commands, Git status, live process logs and multi-project workspaces in one fast Tauri app.

## Features

- Create new projects from built-in offline templates for Node.js, Node.js + TypeScript, React + Vite, Spring Boot, Python, Rust or an empty starter.
- Save local folders as reusable custom project templates; generated folders such as `.git`, `node_modules`, `target`, `dist` and `build` are excluded while copying.
- Add existing projects by folder selection or scan a base directory for `.git`, `package.json`, `pom.xml`, `Cargo.toml`, `pyproject.toml`, `go.mod` and Flutter projects.
- Search by name, path, description, tag, framework or Git branch; filter favorites and archived projects.
- Configure any IDE with `{projectPath}` and `{projectName}` placeholders and open projects with one click.
- Open a project in the native file manager or a configurable terminal.
- Detect package manager scripts, frameworks, Docker files and Git metadata.
- Create project commands, run them in the correct working directory, view stdout/stderr live and stop complete process trees.
- Keep local command history with status, timestamps, exit codes and logs.
- Build workspaces from editor, terminal, command, folder and URL actions; start actions in parallel or sequence and stop workspace processes together.
- Inspect Git branch, changed-file count and last commit; run `git fetch` and `git pull` with visible logs.
- Light, dark and system themes, first-run onboarding and local JSON import/export.
- Imported commands are never executed automatically and can require explicit trust confirmation.

All application data stays on the local machine. Code Deck never changes project files unless the user explicitly starts a command that does so.

## Requirements

- Node.js 24 or newer
- pnpm 10
- Rust toolchain
- Tauri system prerequisites for your operating system

On Windows, install the Microsoft C++ Build Tools and WebView2 if they are not already present.

## Development

```bash
pnpm install
pnpm tauri:dev
```

Frontend-only preview:

```bash
pnpm dev
```

Desktop integrations such as folder dialogs, IDE launching and commands only work inside Tauri.

## Build

```bash
pnpm build
pnpm tauri:build
```

Installers are written below `src-tauri/target/release/bundle/`.

## Project structure

```text
src/
  app/                  Application state and orchestration
  features/
    onboarding/         First-run setup
    processes/          Live logs and process management
    projects/           Project cards, creation, scan and details
    settings/           IDEs, project templates, terminal, theme and backup
    workspaces/          Multi-project start workflows
  shared/
    components/         Reusable UI primitives
    lib/                Persistence and Tauri bridge
    types/              Application model
src-tauri/
  src/lib.rs            Scaffolding, filesystem, detection, Git, launcher and process core
  capabilities/         Tauri permissions
.github/workflows/      CI and tagged release builds
```

## Data and security

The main configuration is stored in the WebView's local application storage. Exported backups are human-readable JSON. Project inspection is read-only. Commands only run after a direct user action. Imported project commands are marked untrusted until confirmed.

Do not import configuration files from sources you do not trust. A command has the same permissions as the current operating-system user.

## Keyboard shortcuts

- `Ctrl/Cmd + K`: focus project search
- `Ctrl/Cmd + N`: add a project
- `Esc`: close the active dialog

## Roadmap

The current code covers project scaffolding, project management, launcher, command runner, detection, Git view, workspaces and settings. Future additions may include SQLite storage, Docker Compose controls, port management, a command palette, auto-update checks and a plugin system.
