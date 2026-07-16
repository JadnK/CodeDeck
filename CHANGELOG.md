# Changelog

All notable changes to CodeDeck are documented in this file.

The project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

### Changed

### Fixed

### Security

## [1.1.0] - 2026-07-16

### Added

- Added direct Git repository cloning with optional branch or tag selection and shallow clones.
- Added per-project build and run commands with a configurable development port and quick localhost access.
- Added a full project Git workbench with branch switching and creation, fetch, pull, push, staging, unstaging, commits and text diffs.
- Added an integrated merge-conflict resolver with current, incoming, combined and manually edited results.
- Added controls to continue or abort merge, rebase, cherry-pick and revert operations.
- Added a system tray menu for opening, hiding and quitting CodeDeck.
- Added optional desktop notifications when commands, builds or runs finish.

### Changed

- Project details now keep all detected package scripts visible instead of limiting the list.
- Project runtime settings automatically suggest common build, run and development-port defaults.
- Vite, Astro, Angular, Nuxt, SvelteKit and Next.js runs automatically receive the configured port when possible.
- Closing the main window now keeps CodeDeck available in the system tray.

### Fixed

- Improved long script and command layouts so actions remain readable in smaller windows.
- Git state refreshes after failed operations so newly created conflicts become visible immediately.

### Security

- Repository file operations validate paths before reading, writing, staging or resolving conflicts.
- Cloned repositories and detected commands are never executed automatically.

## [1.0.1] - 2026-07-16

### Added

- Added detection and launch support for Visual Studio Code installed through Flatpak on Linux.
- Added support for both user-level and system-wide Flatpak installations.

### Changed

- Reworked the GitHub release workflow with fully English job names, messages and release text.
- Release drafts now use the version-specific `RELEASE_NOTES_vX.Y.Z.md` file from the tagged commit.
- Added stricter validation for the release notes file, `Cargo.lock` and updater manifest assets.
- Translated generated release-note categories to English.

### Fixed

- Fixed AppImage builds failing to launch Visual Studio Code when VS Code is installed as `com.visualstudio.code`.
- Fixed IDE detection relying only on the `code` executable being available in `PATH`.
- Fixed Flatpak project launching so the actual project directory is passed through `{projectPath}`.
- Improved release summaries and updater-manifest validation errors.

### Known limitations

- A Flatpak IDE still needs permission to access the selected project directory.
- Platform installers are not yet signed with paid Windows or Apple certificates.

## [1.0.0] - 2026-07-16

### Added

- First stable CodeDeck release for Windows, macOS and Linux.
- Local project dashboard with search, favorites, archiving and project details.
- Built-in project starters for Node.js, Node.js with TypeScript, React with Vite, Spring Boot, Python and Rust.
- Custom local project templates and configurable Spring Boot package roots.
- Folder scanning and project import with language, framework, tool, package-script, Git and Docker detection.
- Configurable IDE and terminal launchers with automatic IDE discovery.
- Manual IDE rescan and test actions that open the Desktop folder.
- Per-project commands with live stdout and stderr, stop support and execution history.
- Git information including branch, changed files and latest commit details.
- Workspaces that can open IDEs, start commands and open URLs in sequence or in parallel.
- Per-project todo lists with title, description, status, priority and manual ordering.
- German and English interface languages.
- Light, dark and system appearance modes.
- Local configuration import and export.
- Signed in-app updates from published GitHub Releases.
- Automatic update checks on startup, manual checks in Settings and installation progress in the app.
- First-run onboarding for project folders and IDE setup.

### Changed

- Redesigned the interface as a compact desktop productivity tool with clearer navigation and action layouts.
- Removed editable project, workspace and template tags.
- Split detected project metadata into languages, frameworks and tools.
- Docker and Docker Compose are now classified as tools instead of frameworks.
- Improved project import detection for JavaScript, TypeScript, Java, Kotlin, Python, Rust, Go, Dart, C#, C/C++, PHP, Ruby, Swift, HTML and CSS.
- Improved framework detection for React, Vue, Angular, Spring Boot, FastAPI, Flask, Django, Laravel, Symfony and Ruby on Rails.
- Improved tool detection for Node.js, Maven, Gradle, Cargo, Composer, Bundler, CMake, .NET and Docker.
- Reworked the project list so every row uses the same fixed column layout.
- Updated the application and bundle icons with a larger transparent foreground mark.
- Fresh installations no longer assume that VS Code or Cursor is installed.
- Updated release automation to build signed updater artifacts and validate `latest.json`.

### Fixed

- Fixed VS Code, Cursor and JetBrains launchers opening a file named after the project instead of the project directory.
- Fixed project launching to always pass the canonical project path through `{projectPath}`.
- Fixed legacy editor templates that used `{projectName}` as the launch target.
- Fixed IDE startup when commands such as `code` or `idea` are not available in `PATH`.
- Added Windows installation-path discovery for VS Code, Cursor, Windsurf and JetBrains IDEs, including Toolbox installations.
- Fixed project-table entries appearing under the wrong headings.
- Fixed technology indicators not aligning with the Technologies column.
- Fixed Docker being shown as a framework during project scanning.
- Fixed incomplete language detection when importing existing projects.
- Improved errors for missing, unreachable or invalid updater `latest.json` files.
- Fixed release creation for existing Git tags by removing invalid `target_commitish` values.
- Fixed release workflow validation for updater versions, platform URLs and signatures.
- Fixed clipped, wrapped and uneven button labels across pages and dialogs.
- Prevented release builds from opening an additional console window on Windows.

### Security

- Commands only run after an explicit user action.
- Imported configurations never start commands automatically.
- Project inspection does not silently modify source files.
- Update packages are verified with the embedded public key before installation.
- Private updater signing keys remain outside the repository and are only used by the release workflow.

### Known limitations

- Windows SmartScreen and macOS Gatekeeper may warn because platform installers are not signed with paid platform certificates.
- Portable or uncommon IDE installations may still require a manually configured executable path.
- The first installation containing the updater must be installed manually; later releases can update in the app.

## [0.2.2]

### Added

- Secure in-app updates from signed GitHub Release artifacts.
- Automatic update checks on application startup.
- Manual update checks and an update preference in Settings.
- Download and installation progress inside the update dialog.
- Automatic IDE detection on the first application launch.
- Broader IDE detection for common Windows, macOS and Linux installations.
- A test action for every saved IDE that opens the Desktop folder.

### Changed

- Fresh installations no longer assume that VS Code or Cursor is installed.
- Release builds now create signed updater artifacts and `latest.json`.

## [0.2.1]

### Added

- Added a persistent German and English language setting.
- Added English translations across the dashboard, project creation, project details, processes, workspaces, onboarding and settings.
- Added the new CodeDeck logo to the application UI and all desktop bundle icons.

### Changed

- Updated the application icon for Windows, macOS, Linux and the web frontend.
- Prepared all application versions for the v0.2.1 release.

### Fixed

- Fixed GitHub release creation for existing tags by removing the invalid tag value from `target_commitish`.

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

[Unreleased]: https://github.com/JadnK/CodeDeck/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/JadnK/CodeDeck/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/JadnK/CodeDeck/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/JadnK/CodeDeck/compare/v0.2.2...v1.0.0
[0.2.2]: https://github.com/JadnK/CodeDeck/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/JadnK/CodeDeck/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/JadnK/CodeDeck/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/JadnK/CodeDeck/releases/tag/v0.1.0
