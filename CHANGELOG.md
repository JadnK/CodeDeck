# Changelog

All notable changes to CodeDeck are documented in this file.

The project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

### Changed

### Fixed

### Security

## [0.2.1]

### Changed

- Redesigned the application interface
- Reworked the main navigation
- Improved project cards and action layouts
- Fixed duplicate process and settings navigation
- Improved button sizing, text alignment and responsive behavior
- Added the Code Deck application icon to the interface

### Fixed

- Fixed clipped and wrapped button labels
- Fixed inconsistent spacing across dialogs and pages
- Fixed duplicate navigation entries

## [0.2.0]

### Added

- Built-in starters for Node.js, Node.js with TypeScript, React with Vite, Spring Boot, Python and Rust.
- Custom project templates based on local folders.
- A clearer project creation flow for starter projects, templates and existing folders.
- Additional page-by-page documentation for the dashboard, project details, processes, workspaces and settings.

### Changed

- Improved labels, descriptions, empty states and button text across the interface.
- Updated GitHub Actions for the repository-root project structure.
- Improved release creation and cross-platform artifact handling.
- Updated the Windows desktop build so no console window appears in release builds.

### Fixed

- Fixed pnpm installation failures caused by incorrect workflow paths.
- Fixed release version validation and draft-release lookup.
- Fixed shell errors while generating release notes.
- Prevented internal Git commands from opening visible command windows on Windows.

## [0.1.0]

### Added

- Tauri 2 and React desktop application foundation.
- Local project creation, scanning, search, tags, favorites, editing, archiving and removal.
- Configurable IDE and terminal launchers with project placeholders.
- Framework, package-script, Docker and Git detection.
- Command runner with live stdout and stderr, stop support and local history.
- Git branch, changed-file count and latest-commit information.
- Workspaces with ordered sequential and parallel actions.
- Process overview, local JSON import and export, themes and onboarding.
- Cross-platform build and release workflows.

### Security

- Commands only execute after an explicit user action.
- Imported commands are never started automatically.
- Project inspection does not modify project source files.

[0.2.1]: https://github.com/JadnK/CodeDeck/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/JadnK/CodeDeck/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/JadnK/CodeDeck/releases/tag/v0.1.0
