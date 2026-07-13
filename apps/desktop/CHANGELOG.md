# Changelog

All notable changes to Code Deck are documented here.

## [0.1.0] - 2026-07-13

### Added

- Complete Tauri 2 and React desktop application foundation.
- Project creation, scanning, search, tags, favorites, editing, archiving and deletion.
- Configurable IDE and terminal launchers with project placeholders.
- Framework, package script, Docker and Git detection.
- Command runner with live stdout/stderr, stop support and local history.
- Git branch, dirty-file count, last commit, fetch and pull actions.
- Workspaces with ordered parallel/sequential actions.
- Process overview, local JSON import/export, themes and onboarding.
- Cross-platform release workflows and application icons.

### Security

- Commands only execute after explicit user actions.
- Imported project commands are marked untrusted and can require confirmation.
- Project inspection does not modify project files.
