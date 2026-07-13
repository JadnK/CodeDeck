import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import type {
  EditorSuggestion,
  ProcessExitEvent,
  ProcessOutputEvent,
  ProjectCandidate,
  ProjectInspection,
} from "../types/models";

export const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    throw new Error("Diese Aktion ist nur in der Desktop-App verfügbar.");
  }
  return invoke<T>(command, args);
}

export async function chooseDirectory(defaultPath?: string) {
  if (!isTauri()) return null;
  const selected = await open({
    directory: true,
    multiple: false,
    defaultPath: defaultPath || undefined,
    title: "Projektordner auswählen",
  });
  return typeof selected === "string" ? selected : null;
}

export async function chooseConfigFile() {
  if (!isTauri()) return null;
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Code Deck Konfiguration", extensions: ["json"] }],
    title: "Code Deck Konfiguration importieren",
  });
  return typeof selected === "string" ? selected : null;
}

export async function chooseExportPath() {
  if (!isTauri()) return null;
  return save({
    defaultPath: `code-deck-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
    title: "Code Deck Konfiguration exportieren",
  });
}

export const inspectProject = (path: string) =>
  call<ProjectInspection>("inspect_project", { path });

export const scanProjects = (path: string) =>
  call<ProjectCandidate[]>("scan_projects", { path });

export const detectEditors = () =>
  call<EditorSuggestion[]>("detect_editors");

export const launchTemplate = (
  commandTemplate: string,
  projectPath: string,
  projectName: string,
) =>
  call<void>("launch_template", {
    commandTemplate,
    projectPath,
    projectName,
  });

export const openTerminal = (projectPath: string, terminalCommand: string) =>
  call<void>("open_terminal", { projectPath, terminalCommand });

export const openTarget = (target: string) =>
  call<void>("open_target", { target });

export const startProcess = (
  runId: string,
  projectPath: string,
  command: string,
  workingDir?: string,
  env: Record<string, string> = {},
) =>
  call<{ pid: number }>("start_process", {
    runId,
    projectPath,
    command,
    workingDir: workingDir || null,
    env,
  });

export const stopProcess = (pid: number) =>
  call<void>("stop_process", { pid });

export const readTextFile = (path: string) =>
  call<string>("read_text_file", { path });

export const writeTextFile = (path: string, contents: string) =>
  call<void>("write_text_file", { path, contents });

export function onProcessOutput(
  handler: (event: ProcessOutputEvent) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) return Promise.resolve(() => undefined);
  return listen<ProcessOutputEvent>("code-deck://process-output", (event) =>
    handler(event.payload),
  );
}

export function onProcessExit(
  handler: (event: ProcessExitEvent) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) return Promise.resolve(() => undefined);
  return listen<ProcessExitEvent>("code-deck://process-exit", (event) =>
    handler(event.payload),
  );
}
