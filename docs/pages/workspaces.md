# Workspaces

![Workspace configuration](../screenshots/workspaces.png)

A workspace is a saved launch routine. It is meant for work that needs several projects, commands or URLs at the same time.

It does **not** create a new folder, combine repositories or duplicate projects. It only stores a list of actions and their order.

## Example: full-stack development

Assume a feature needs:

- a React frontend
- a Spring Boot API
- a local browser page

Without a workspace, every session starts with the same manual steps. A workspace can store them once:

```text
1. Open frontend in VS Code
2. Run "pnpm dev" in frontend
3. Open API in IntelliJ IDEA
4. Run "mvn spring-boot:run" in API
5. Open http://localhost:5173
```

Pressing **Start** runs the configured setup.

## Available action types

| Action | Use |
|---|---|
| Open IDE | Opens a selected project with its configured editor |
| Open terminal | Opens a terminal in a project directory |
| Open folder | Opens the project in the operating-system file manager |
| Run saved command | Starts one of the commands already stored for a project |
| Run custom command | Runs a command used only by this workspace action |
| Open URL | Opens a local service, documentation page or other address |

## Sequence and parallel mode

Use sequential execution when one step should start after the previous one has been launched. Use parallel execution when independent services can start together.

Sequence controls launch order; it does not necessarily wait until a server is fully ready. If one service requires another to be ready, add a suitable readiness command or start those steps manually.

## Start and stop

- **Start** launches all enabled actions.
- **Stop all** stops command processes started by that workspace.
- IDE windows, file-manager windows and browser tabs are not closed by **Stop all**.

## When a workspace is useful

Workspaces are a good fit for:

- frontend plus backend
- several microservices
- app plus Docker Compose
- a project plus a documentation site
- repeated test or demo setups

For one project with one development command, the normal project detail page is simpler.

## Creating a workspace

1. Open **Workspaces**.
2. Create a new workspace and give it a clear name.
3. Add the projects involved.
4. Add actions in the order you usually perform them.
5. Choose sequential or parallel execution where available.
6. Save and test the workspace.
7. Check **Prozesse** if a command does not start as expected.
