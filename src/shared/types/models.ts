export type Theme = "dark" | "light" | "system";
export type Language = "de" | "en";

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


export type TodoStatus = "new" | "in-progress" | "done";
export type TodoPriority = "low" | "normal" | "high";

export type ProjectTodo = {
  id: string;
  title: string;
  description: string;
  status: TodoStatus;
  priority: TodoPriority;
  order: number;
  createdAt: string;
  updatedAt: string;
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

export type GitOperation = "merge" | "rebase" | "cherry-pick" | "revert";

export type GitFileStatus = {
  path: string;
  indexStatus: string;
  workTreeStatus: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  conflicted: boolean;
};

export type GitRepositoryStatus = {
  branch?: string;
  upstream?: string;
  ahead: number;
  behind: number;
  operation?: GitOperation;
  files: GitFileStatus[];
};

export type GitConflictContent = {
  path: string;
  base?: string;
  current: string;
  incoming: string;
  workingTree: string;
  binary: boolean;
};

export type ProjectInspection = {
  exists: boolean;
  languages?: string[];
  frameworks: string[];
  tools?: string[];
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
  favorite: boolean;
  archived: boolean;
  preferredEditorId?: string;
  commands: ProjectCommand[];
  todos: ProjectTodo[];
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
  inspection?: ProjectInspection;
  buildCommand?: string;
  runCommand?: string;
  devPort?: number;
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
  language: Language;
  terminalCommand: string;
  defaultProjectDir: string;
  onboardingComplete: boolean;
  confirmImportedCommands: boolean;
  checkForUpdatesOnStartup: boolean;
  ideDetectionComplete: boolean;
  notifyOnCommandCompletion: boolean;
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
  languages?: string[];
  frameworks?: string[];
  tools?: string[];
  hasDocker?: boolean;
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
