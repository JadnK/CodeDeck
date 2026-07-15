# New Project

![New project dialog](../screenshots/new-project.png)

Open **Neues Projekt** from the dashboard. The dialog supports three different jobs: create a starter project, create from your own template, or add an existing folder.

## Create a starter project

Choose **Neues Projekt erstellen**, then select a starter such as Node.js, React, Spring Boot, Python or Rust.

You provide:

| Field | Meaning |
|---|---|
| Project name | The folder name and default display name |
| Parent folder | The directory in which the new folder is created |
| Starter | The base files Code Deck should generate |
| Initialize Git | Runs `git init` after the files are created |
| Preferred IDE | The editor used by the main open button |

Code Deck shows the final path before creating anything.

Dependencies are not installed automatically. This avoids running package-manager commands without a clear user action. For a generated React project, for example, open its terminal afterwards and run `pnpm install` or `npm install`.

## Use a custom template

Custom templates are ordinary local folders registered under **Einstellungen → Eigene Projektvorlagen**.

When you select one during project creation, Code Deck copies the template contents into the new project folder. These generated or repository-specific directories are skipped:

```text
.git
node_modules
target
dist
build
```

A template is useful when your projects usually begin with the same configuration, folder structure, scripts or internal defaults.

## Add an existing project

Choose **Vorhandenen Ordner hinzufügen** when the project is already on disk.

Code Deck reads common files such as:

```text
package.json
Cargo.toml
pom.xml
build.gradle
pyproject.toml
go.mod
Dockerfile
.git
```

This information is used to detect frameworks and package scripts. The project files are not rewritten.

## Scan a base folder

Use **Ordner scannen** on the dashboard when many repositories are stored below one parent folder. The scan proposes likely projects; you still decide which ones are added.

## Common problems

**The folder already exists:** choose a different project name or parent folder, or add the existing folder instead.

**A starter command is unavailable:** generated files do not require the related runtime immediately, but running the project later still requires Node.js, Java, Python, Rust or the relevant toolchain.

**The preferred IDE is missing:** configure it first under **Einstellungen → IDEs**.
