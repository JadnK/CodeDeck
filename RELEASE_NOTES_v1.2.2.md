# CodeDeck v1.2.2

CodeDeck 1.2.2 brings GitHub issues and pull requests into Project Details and makes staging groups of changed files much faster.

## Highlights

- Open a project's new **GitHub** area directly from Project Details.
- Browse repository issues in a list-and-detail layout with descriptions, labels, milestones, assignees and comments.
- View open pull requests, their source and target branches, draft state and GitHub page.
- Keep using the complete local Git workbench for branches, diffs, staging, commits, fetch, pull, push and merge-conflict resolution.
- Stage groups of files with **New only**, **Changed only**, **Deleted only**, **New + changed**, or **Everything**.
- Reach the CodeDeck Discord community from the persistent application header or the README link.

## GitHub integration

CodeDeck detects the GitHub repository from the project's Git remote. It prefers `origin` and falls back to the first available remote. Both HTTPS and SSH GitHub remote formats are supported.

Public repositories work without authentication in read-only mode. Connecting an optional fine-grained personal access token enables:

- Issues assigned to the authenticated user
- Adding issue comments
- Closing and reopening issues
- Reading pull requests for private repositories when the token has access

The token is kept only for the current CodeDeck session and is not exported with the application configuration.

## Bulk staging

The Git workbench now includes staging presets with live file counts:

- **New only** — untracked files
- **Changed only** — modified tracked files
- **Deleted only** — removed files
- **New + changed** — excludes deleted files
- **Everything** — new, changed and deleted files

Conflict files are intentionally excluded from automatic bulk staging and must be resolved explicitly.

## Upgrade notes

Existing projects and settings continue to work without migration. Open a Git project and select the **GitHub** tab to use the new integration. Projects without a GitHub remote still retain access to the local Git workbench.

## Known limitations

- GitHub Projects are not part of this release.
- Private repository data and write actions require a compatible GitHub token.
- Anonymous GitHub API access is subject to GitHub's public rate limits.
- Windows SmartScreen and macOS Gatekeeper may still warn because platform installers are not signed with paid platform certificates.

## Downloads

Choose the matching file under **Assets**:

- **Windows:** MSI or setup EXE
- **macOS:** DMG
- **Linux:** AppImage or DEB

Existing CodeDeck installations with the updater can install v1.2.2 from **Settings → Updates → Check now** after the release is published.
