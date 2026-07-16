# Code Deck v1.0.0

CodeDeck 1.0 is the first stable release of the local desktop dashboard for development projects.

## Highlights

- Organize and search local projects from one place
- Create projects from built-in starters or custom templates
- Detect project languages, frameworks and tools more accurately
- Open projects in discovered VS Code, Cursor and JetBrains installations
- Run commands with live logs and stop support
- Manage project-specific todos
- Start multi-project workspaces
- Switch between German and English
- Install signed CodeDeck updates directly in the app

## Important fixes

- Project launchers now pass the real project directory instead of the project name
- VS Code and JetBrains IDEs are discovered even when their commands are missing from `PATH`
- Docker is classified as a tool instead of a framework
- Project table values now stay in their correct columns
- Update checks report missing or invalid `latest.json` manifests clearly

## Downloads

Choose the matching asset:

- Windows: MSI or setup EXE
- macOS: DMG
- Linux: AppImage or DEB

## Installation note

The platform installers are not signed with paid Windows or Apple certificates yet. Windows SmartScreen or macOS Gatekeeper may therefore display a warning on first launch.

## Updating

Versions that already contain the in-app updater can install v1.0.0 directly after the release is published. Older installations without the updater must install this release manually once.
