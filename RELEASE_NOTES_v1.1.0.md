# CodeDeck v1.1.0

CodeDeck 1.1.0 expands the project workflow from launching folders to managing the full local development cycle.

## Highlights

- Clone HTTPS, SSH or local Git repositories directly from the Add Project dialog. Optional branch, tag and shallow-clone settings are included.
- Configure a build command, run command and development port for every project. CodeDeck can open the local URL and supplies the selected port to common web frameworks.
- Use the new Git workbench to inspect file changes and diffs, switch or create branches, stage and unstage files, commit changes, and run fetch, pull or push.
- Resolve text merge conflicts inside CodeDeck by choosing the current version, incoming version, both versions or a manually edited result. Continue or abort merge, rebase, cherry-pick and revert operations afterwards.
- Keep CodeDeck available from the system tray and receive optional desktop notifications when builds, runs and other commands finish.
- Keep the redesigned Settings sidebar, structured project-template management, streamlined Launch sets and improved non-selectable productivity UI from the previous interface rework.

## Safety

Repository paths are validated before files are read or written. Cloning a repository never runs its scripts automatically, and commands still require an explicit user action.

## Upgrade notes

Existing projects are migrated automatically. CodeDeck suggests build, run and port defaults from detected project metadata, while preserving explicitly configured values.
