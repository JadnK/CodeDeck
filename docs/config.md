# Configuration format

Exports contain a top-level `version`, `projects`, `editors`, `workspaces`, `processHistory` and `settings` object. The importer normalizes missing fields and marks imported project commands as untrusted.

Editor templates support:

- `{projectPath}`: absolute local project directory
- `{projectName}`: configured display name

Example:

```json
{
  "id": "vscode",
  "name": "VS Code",
  "commandTemplate": "code \"{projectPath}\"",
  "enabled": true
}
```
