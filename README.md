<p align="center">
  <img src="public/icon.png" alt="Code Deck icon" width="96" style="border-radius:20px" >
</p>

<h1 align="center">Code Deck</h1>

<p align="center">
  A desktop app for keeping local development projects, commands, todos and IDE shortcuts in one place.
</p>

<p align="center">
  <a href="https://github.com/JadnK/CodeDeck/actions/workflows/ci.yml">
    <img src="https://github.com/JadnK/CodeDeck/actions/workflows/ci.yml/badge.svg" alt="CI">
  </a>
  <a href="https://github.com/JadnK/CodeDeck/releases/latest">
    <img src="https://img.shields.io/github/v/release/JadnK/CodeDeck?display_name=tag&sort=semver" alt="Latest release">
  </a>
  <img src="https://img.shields.io/badge/Tauri-2.x-24C8DB?logo=tauri&logoColor=white" alt="Tauri 2">
  <img src="https://img.shields.io/badge/React-TypeScript-3178C6?logo=react&logoColor=white" alt="React and TypeScript">
</p>

![Code Deck dashboard](docs/screenshots/dashboard.png)

## What CodeDeck does

- Keep local projects in one searchable dashboard
- Open projects in the correct IDE, terminal or file manager
- Run and stop saved development commands
- Create projects from built-in or custom templates
- Create and manage project-specific todos
- Start complete multi-project workspaces
- View Git information and running processes
- Export and import the local configuration
- Switch the interface between English and German

The interface is available in English and German. You can change the language in the settings.

## Download

Download the latest version from [GitHub Releases](../../releases/latest).

Available packages:

| Platform | Package |
|---|---|
| Windows | `.msi` or setup `.exe` |
| macOS | `.dmg` |
| Linux | `.AppImage` or `.deb` |

Code Deck does not require an account or a server. Its configuration stays on your local machine.

**If CodeDeck saves you time, consider starring the repository.**

## Where everything is

| Area | Where to find it | What it is for |
|---|---|---|
| Project search | Search field at the top | Searches names, paths, frameworks and branches |
| Favorites | **Favorites** filter and star on each card | Keeps frequently used projects easy to find |
| Add a project | **New Project** | Creates a starter project or adds an existing folder |
| Scan folders | **Scan folders** | Finds projects below a selected base folder |
| Project actions | **Details** on a project card | IDE, terminal, commands, Git and project settings |
| Todos | **Todos** on a project row or in its details | Manages a local task list for the project |
| Running commands | **Processes** in the top bar | Shows live output, history and stop buttons |
| Multi-project setup | **Workspaces** in the top bar | Starts several project actions together |
| App configuration | **Settings** in the top bar | Editors, templates, theme, folders and backups |

## Documentation

The full user guide explains every page and feature:

[Open the Code Deck documentation](docs/README.md)

### Guides

- [Dashboard](docs/pages/dashboard.md)
- [New Project](docs/pages/new-project.md)
- [Project Details](docs/pages/project-details.md)
- [Todos](docs/pages/todos.md)
- [Processes](docs/pages/processes.md)
- [Workspaces](docs/pages/workspaces.md)
- [Settings](docs/pages/settings.md)

## Adding projects

Click **New Project** on the dashboard. You can either create a new project or add an existing folder.

### Create a new project

Choose **Create new project** and select a starter:

- Empty project
- Node.js
- Node.js with TypeScript
- React with Vite
- Spring Boot with Maven and Java 21
- Python
- Rust CLI
- one of your own local templates

Enter the project name and parent folder. Code Deck shows the final path before creating anything. Git initialization is optional.

Dependencies are not installed automatically. A generated React project, for example, still needs `pnpm install` or `npm install`.

![New project dialog](docs/screenshots/new-project.png)

### Add an existing project

Choose **Add existing folder** and select the project directory.

Code Deck detects common project files such as:

```text
.git
package.json
Cargo.toml
pom.xml
build.gradle
pyproject.toml
go.mod
Dockerfile
```

Detected package scripts are added as command suggestions. The project files themselves are not changed.

### Scan a projects folder

Use **Scan folders** when many repositories are stored below one folder:

```text
C:\Users\you\Projects
```

Code Deck lists likely projects first and lets you choose which ones should be added.

## Project details

Open **Details** from a project card.

![Project details](docs/screenshots/project-details.png)

The detail view contains the project-specific functions:

- **Open in …** opens the project in its preferred IDE
- **Open terminal** opens a terminal in the project directory
- **Open folder** opens the system file manager
- **Refresh status** scans frameworks, scripts, Docker files and Git data again
- **Commands** stores commands such as `pnpm dev`, `mvn test` or `cargo run`
- **Git status** shows the current branch, changed files and latest commit
- Project name, description, favorite state and preferred IDE can be edited
- Archiving hides the project without deleting its files

Commands run with the project folder as their base directory. A custom working directory and environment variables can also be saved per command.

## Project todos

Every project has its own local todo list. Open it with **Todos** on the project row or from the project detail view.

![Project todos](docs/screenshots/todo.png)

You can create todos with:

- a title
- an optional description
- a status: **New**, **In progress** or **Done**
- a priority: **Low**, **Normal** or **High**

Existing todos can be edited, completed or deleted. Their status can also be changed directly from the list.

Todos can be sorted manually or by status, priority, creation date and title. In manual mode, tasks can be moved up and down.

The todos are stored as part of the local CodeDeck configuration. They do not create or modify files inside your project folder and are included in configuration exports.

## Processes and logs

Starting a command opens the **Processes** panel, which also remains available from the top bar.

![Processes and live logs](docs/screenshots/processes.png)

Each run shows:

- project and command name
- running, successful, failed or stopped state
- start time and process ID when available
- stdout and stderr output
- a stop button for active processes

Finished entries can be removed from the history without affecting the project.

## Workspaces

A workspace is useful when one task needs several projects, such as a frontend, API and local browser URL.

![Workspace configuration](docs/screenshots/workspaces.png)

Open **Workspaces**, create a workspace and add actions. Supported actions include:

- opening a project in an IDE
- opening a terminal or project folder
- running a saved or custom command
- opening a URL

Actions can run in parallel or in sequence. **Start** runs the complete workspace, while **Stop all** stops processes started by it.

## Settings

Open **Settings** in the top-right corner.

![Code Deck settings](docs/screenshots/settings.png)

### Editors and IDEs

Each editor has a name and a command template:

```text
VS Code:       code "{projectPath}"
Cursor:        cursor "{projectPath}"
IntelliJ IDEA: idea "{projectPath}"
WebStorm:      webstorm "{projectPath}"
```

Available placeholders:

```text
{projectPath}
{projectName}
```

Keep `{projectPath}` in quotes so paths containing spaces work correctly.

### Terminal, folders and templates

The settings allow you to configure:

- the default folder used by project dialogs and scans
- a custom terminal launch command
- reusable project templates from local folders

When a custom template is copied, generated or repository-specific folders such as `.git`, `node_modules`, `target`, `dist` and `build` are skipped.

### Appearance and backups

The settings also include:

- light, dark and system themes
- English and German interface languages
- JSON export of projects, todos, editors, workspaces and settings
- JSON import with confirmation before replacing the current configuration
- an option to run the onboarding again

Imported commands are marked as untrusted and require confirmation before their first run.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + K` | Focus project search |
| `Ctrl/Cmd + N` | Open the add-project dialog |
| `Esc` | Close the active dialog |

## Running from source

### Requirements

- Node.js 24
- pnpm 10.33 or newer
- stable Rust toolchain
- the Tauri system dependencies for your operating system

### Development

```bash
pnpm install --frozen-lockfile
pnpm tauri:dev
```

Frontend only:

```bash
pnpm dev
```

The frontend-only version is useful for UI work, but filesystem dialogs, process execution and IDE launching require the Tauri app.

### Checks and build

```bash
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
pnpm tauri:build
```

Tauri writes platform packages below:

```text
src-tauri/target/release/bundle/
```

### Platform dependencies

On Ubuntu or Debian:

```bash
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf
```

On macOS:

```bash
xcode-select --install
```

On Windows, install Microsoft C++ Build Tools with the **Desktop development with C++** workload.

## Project structure

```text
CodeDeck/
├── src/
│   ├── app/                  # Main application state and actions
│   ├── features/
│   │   ├── onboarding/       # First-start guide
│   │   ├── processes/        # Process list and logs
│   │   ├── projects/         # Cards, creation, scanning and details
│   │   ├── settings/         # Editors, templates and app settings
│   │   └── workspaces/       # Workspace editor and runner
│   └── shared/
│       ├── components/       # Shared components
│       ├── lib/              # Storage, templates and Tauri bridge
│       └── types/            # Shared TypeScript models
├── src-tauri/
│   ├── src/                  # Rust commands and OS integration
│   ├── capabilities/         # Tauri permissions
│   └── tauri.conf.json       # Window and bundle configuration
├── docs/                     # User documentation and screenshots
├── .github/workflows/        # CI and release workflows
├── CHANGELOG.md
└── CONTRIBUTING.md
```

## Local data and command safety

Code Deck reads project metadata but does not silently rewrite source files.

Commands only start after a click and run with the permissions of the signed-in operating-system user. Use the same care as when running a command manually in a terminal.

Only import configurations and custom templates you trust.

## Contributing

Before opening a pull request, run:

```bash
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
```

More details are available in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

See [LICENSE](LICENSE).