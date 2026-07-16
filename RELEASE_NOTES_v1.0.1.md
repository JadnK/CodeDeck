# CodeDeck v1.0.1

CodeDeck 1.0.1 is a focused bug-fix release for Linux IDE integration and release automation.

## Highlights

- Launch Visual Studio Code installed through Flatpak from the CodeDeck AppImage
- Detect both user-level and system-wide VS Code Flatpak installations
- Pass the real project directory to VS Code through `{projectPath}`
- Use fully English GitHub release text and workflow messages
- Load curated release notes directly from the tagged commit
- Validate version files and updater metadata before the release is considered ready

## Linux and Flatpak

CodeDeck now detects the Flathub package:

```text
com.visualstudio.code
```

When detected, projects are opened with:

```bash
flatpak run com.visualstudio.code "{projectPath}"
```

This works even when the `code` command is not available in the AppImage environment.

## Downloads

Choose the matching file under **Assets**:

- **Windows:** MSI or setup EXE
- **macOS:** universal DMG for Intel and Apple Silicon
- **Linux:** AppImage or DEB

## Updating

Installations that already include the CodeDeck updater can install v1.0.1 directly in the app after this release is published.

## Notes

- Flatpak applications need permission to access the selected project directory.
- Windows SmartScreen or macOS Gatekeeper may display a warning because the platform installers are not yet signed with paid platform certificates.
