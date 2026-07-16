# Settings

![Code Deck settings](../screenshots/settings.png)

Open **Einstellungen** from the top-right area. Settings apply across all projects unless a project has its own selection.

## IDEs and editors

An editor entry contains a display name and a command template.

Examples:

```text
code "{projectPath}"
cursor "{projectPath}"
idea "{projectPath}"
webstorm "{projectPath}"
```

Available placeholders:

```text
{projectPath}
{projectName}
```

Keep the project path in quotes so folders containing spaces work.

A project uses its preferred editor for the main open button. Changing a global editor command affects every project assigned to that editor.

## Terminal

Leave the custom terminal command empty to use Code Deck's platform-specific default. Set a command when you use a different terminal or need custom arguments.

The terminal is opened with the project directory as its starting folder where supported.

## Default project folder

This directory is used as the initial location for project creation, folder selection and scanning. It is only a convenience setting; projects may still be stored elsewhere.

## Custom project templates

Under **Eigene Projektvorlagen**, choose a local folder and save it as a template.

Use templates for files you want in many new projects, for example:

- linting configuration
- standard folders
- a company-specific README outline
- package scripts
- shared development settings

Do not include secrets, installed dependencies or generated build output.

## Appearance

Choose light, dark or system theme. The selection is saved locally.

## Import and export

Export creates a JSON backup containing Code Deck configuration such as projects, commands, editors, workspaces and settings.

Import replaces or merges configuration according to the confirmation shown in the app. Review imported commands before running them. Code Deck does not automatically execute commands from an imported file.

## Onboarding

Use the onboarding option to open the first-run guide again. This is useful after reinstalling an IDE or when setting up Code Deck on another machine.
