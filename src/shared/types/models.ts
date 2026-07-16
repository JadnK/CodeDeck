export type Theme = "dark" | "light" | "system";

export type Editor = {
  id: string;
  name: string;
  commandTemplate: string;
  enabled: boolean;
  detected?: boolean;
};

export type ProjectCommand = {
  id: string;
  label: string;
  command: string;
  workingDir?: string;
  env: Record<string, string>;
  imported?: boolean;
  trusted?: boolean;
};

export type DetectedScript = {
  name: string;
  command: string;
};

export type GitCommit = {
  hash: string;
  message: string;
  date: string;
};

export type ProjectInspection = {
  exists: boolean;
  frameworks: string[];
  packageManager?: string;
  scripts: DetectedScript[];
  isGit: boolean;
  branch?: string;
  changedFiles: number;
  lastCommit?: GitCommit;
  hasDocker: boolean;
  markers: string[];
};

export type Project = {
  id: string;
  name: string;
  path: string;
  description: string;
  tags: string[];
  favorite: boolean;
  archived: boolean;
  preferredEditorId?: string;
  commands: ProjectCommand[];
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
  inspection?: ProjectInspection;
};

export type BuiltInProjectTemplateId =
  | "empty"
  | "node"
  | "node-typescript"
  | "react-vite"
  | "spring-boot"
  | "python"
  | "rust";

export type CustomProjectTemplate = {
  id: string;
  name: string;
  description: string;
  sourcePath: string;
  tags: string[];
  preferredEditorId?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreatedProject = {
  name: string;
  path: string;
};

export type WorkspaceActionType =
  | "openEditor"
  | "openTerminal"
  | "openFileManager"
  | "runCommand"
  | "openUrl";

export type WorkspaceAction = {
  id: string;
  type: WorkspaceActionType;
  projectId?: string;
  commandId?: string;
  command?: string;
  url?: string;
  editorId?: string;
  runMode: "parallel" | "sequence";
  order: number;
};

export type Workspace = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  actions: WorkspaceAction[];
  createdAt: string;
  updatedAt: string;
};

export type ProcessStatus =
  | "starting"
  | "running"
  | "success"
  | "failed"
  | "stopping"
  | "stopped";

export type ProcessRun = {
  id: string;
  projectId?: string;
  commandId?: string;
  workspaceId?: string;
  label: string;
  command: string;
  pid?: number;
  status: ProcessStatus;
  startedAt: string;
  endedAt?: string;
  exitCode?: number;
  logs: string[];
};

export type AppSettings = {
  theme: Theme;
  terminalCommand: string;
  defaultProjectDir: string;
  onboardingComplete: boolean;
  confirmImportedCommands: boolean;
};

export type AppData = {
  version: "1";
  projects: Project[];
  editors: Editor[];
  projectTemplates: CustomProjectTemplate[];
  workspaces: Workspace[];
  processHistory: ProcessRun[];
  settings: AppSettings;
};

export type ProjectCandidate = {
  name: string;
  path: string;
  markers: string[];
};

export type EditorSuggestion = {
  id: string;
  name: string;
  commandTemplate: string;
};

export type ProcessOutputEvent = {
  runId: string;
  stream: "stdout" | "stderr";
  line: string;
};

export type ProcessExitEvent = {
  runId: string;
  exitCode?: number;
  success: boolean;
};
