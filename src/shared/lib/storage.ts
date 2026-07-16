import type { AppData, CustomProjectTemplate, Editor, ProjectCommand, ProjectTodo } from "../types/models";

const STORAGE_KEY = "code-deck-data-v1";

const now = () => new Date().toISOString();

function id() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const createId = id;

function normalizeEditorTemplate(idValue: string, nameValue: string, commandTemplate: string) {
  const template = commandTemplate.trim();
  if (template.includes("{projectPath}")) return template;

  const identity = `${idValue} ${nameValue}`.toLowerCase();
  if (identity.includes("vscode") || identity.includes("vs code") || identity.includes("visual studio code")) {
    return 'code "{projectPath}"';
  }
  if (identity.includes("cursor")) {
    return 'cursor "{projectPath}"';
  }

  return template;
}

export function defaultEditors(): Editor[] {
  return [
    {
      id: "vscode",
      name: "VS Code",
      commandTemplate: 'code "{projectPath}"',
      enabled: true,
    },
    {
      id: "cursor",
      name: "Cursor",
      commandTemplate: 'cursor "{projectPath}"',
      enabled: true,
    },
  ];
}

export function createDefaultData(): AppData {
  return {
    version: "1",
    projects: [],
    editors: defaultEditors(),
    projectTemplates: [],
    workspaces: [],
    processHistory: [],
    settings: {
      theme: "dark",
      language: "de",
      terminalCommand: "",
      defaultProjectDir: "",
      onboardingComplete: false,
      confirmImportedCommands: true,
    },
  };
}

function normalizeCommand(command: Partial<ProjectCommand>): ProjectCommand {
  return {
    id: command.id ?? id(),
    label: command.label?.trim() || "Command",
    command: command.command?.trim() || "",
    workingDir: command.workingDir ?? "",
    env: command.env ?? {},
    imported: command.imported ?? false,
    trusted: command.trusted ?? true,
  };
}


function normalizeTodo(todo: Partial<ProjectTodo>, order: number): ProjectTodo {
  const status = todo.status === "in-progress" || todo.status === "done" ? todo.status : "new";
  const priority = todo.priority === "low" || todo.priority === "high" ? todo.priority : "normal";
  return {
    id: todo.id ?? id(),
    title: todo.title?.trim() || "Todo",
    description: todo.description ?? "",
    status,
    priority,
    order: Number.isFinite(todo.order) ? Number(todo.order) : order,
    createdAt: todo.createdAt ?? now(),
    updatedAt: todo.updatedAt ?? now(),
  };
}

export function normalizeData(input: unknown, imported = false): AppData {
  const fallback = createDefaultData();
  if (!input || typeof input !== "object") return fallback;

  const value = input as Partial<AppData>;
  const language = value.settings?.language === "en" ? "en" : "de";
  const rawEditors = Array.isArray(value.editors) ? value.editors : [];
  const editors = rawEditors.length
    ? rawEditors.map((editor) => {
        const legacy = editor as typeof editor & { path?: string };
        const editorId = editor.id ?? id();
        const editorName = editor.name?.trim() || "IDE";
        return {
          id: editorId,
          name: editorName,
          commandTemplate: normalizeEditorTemplate(
            editorId,
            editorName,
            editor.commandTemplate ?? legacy.path ?? "",
          ),
          enabled: editor.enabled ?? true,
          detected: editor.detected,
        };
      })
    : fallback.editors;

  const projects = Array.isArray(value.projects)
    ? value.projects.map((project) => {
        const legacy = project as typeof project & { editorId?: string };
        return {
          id: project.id ?? id(),
          name: project.name?.trim() || (language === "en" ? "Untitled project" : "Unbenanntes Projekt"),
          path: project.path ?? "",
          description: project.description ?? "",
          favorite: Boolean(project.favorite),
          archived: Boolean(project.archived),
          preferredEditorId: project.preferredEditorId ?? legacy.editorId,
          commands: Array.isArray(project.commands)
            ? project.commands.map((command) => ({
                ...normalizeCommand(command),
                imported: imported || command.imported,
                trusted: imported ? false : command.trusted ?? true,
              }))
            : [],
          todos: Array.isArray(project.todos)
            ? project.todos.map((todo, index) => normalizeTodo(todo, index))
            : [],
          createdAt: project.createdAt ?? now(),
          updatedAt: project.updatedAt ?? now(),
          lastOpenedAt: project.lastOpenedAt,
          inspection: project.inspection,
        };
      })
    : [];


  const projectTemplates: CustomProjectTemplate[] = Array.isArray(value.projectTemplates)
    ? value.projectTemplates.map((template) => ({
        id: template.id ?? id(),
        name: template.name?.trim() || (language === "en" ? "Custom template" : "Eigene Vorlage"),
        description: template.description ?? "",
        sourcePath: template.sourcePath ?? "",
        preferredEditorId: template.preferredEditorId,
        createdAt: template.createdAt ?? now(),
        updatedAt: template.updatedAt ?? now(),
      }))
    : [];

  const workspaces = Array.isArray(value.workspaces)
    ? value.workspaces.map((workspace) => ({
        id: workspace.id ?? id(),
        name: workspace.name?.trim() || "Workspace",
        description: workspace.description ?? "",
        actions: Array.isArray(workspace.actions)
          ? workspace.actions.map((action, index) => {
              const legacy = action as typeof action & { targetId?: string };
              return {
                id: action.id ?? id(),
                type: action.type,
                projectId: action.projectId ?? legacy.targetId,
                commandId: action.commandId,
                command: action.command,
                url: action.url,
                editorId: action.editorId,
                runMode: action.runMode ?? "parallel",
                order: action.order ?? index,
              };
            })
          : [],
        createdAt: workspace.createdAt ?? now(),
        updatedAt: workspace.updatedAt ?? now(),
      }))
    : [];

  const processHistory = Array.isArray(value.processHistory)
    ? value.processHistory.slice(0, 100).map((process) => ({
        ...process,
        status:
          process.status === "running" || process.status === "starting"
            ? "stopped"
            : process.status,
        endedAt: process.endedAt ?? now(),
        logs: Array.isArray(process.logs) ? process.logs.slice(-500) : [],
      }))
    : [];

  return {
    version: "1",
    projects,
    editors,
    projectTemplates,
    workspaces,
    processHistory,
    settings: {
      ...fallback.settings,
      ...(value.settings ?? {}),
      theme: ["dark", "light", "system"].includes(value.settings?.theme ?? "")
        ? value.settings!.theme
        : fallback.settings.theme,
      language: value.settings?.language === "en" ? "en" : "de",
    },
  };
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeData(JSON.parse(raw)) : createDefaultData();
  } catch {
    return createDefaultData();
  }
}

export function saveData(data: AppData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
