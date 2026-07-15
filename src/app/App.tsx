import { useEffect, useMemo, useRef, useState } from "react";
import { Onboarding } from "../features/onboarding/Onboarding";
import { ProcessesPanel } from "../features/processes/ProcessesPanel";
import { ProjectCard } from "../features/projects/ProjectCard";
import { ProjectCreateModal } from "../features/projects/ProjectCreateModal";
import { ProjectDetails } from "../features/projects/ProjectDetails";
import { ProjectScanModal } from "../features/projects/ProjectScanModal";
import { ProjectTodosModal } from "../features/projects/ProjectTodosModal";
import { SettingsPanel } from "../features/settings/SettingsPanel";
import { UpdateModal } from "../features/updates/UpdateModal";
import { WorkspacesPanel } from "../features/workspaces/WorkspacesPanel";
import { Icon } from "../shared/components/Icon";
import { ToastStack, type Toast } from "../shared/components/ToastStack";
import { I18nProvider, translate } from "../shared/i18n/I18n";
import { createId, loadData, normalizeData, saveData } from "../shared/lib/storage";
import {
  chooseConfigFile,
  chooseExportPath,
  detectEditors,
  inspectProject,
  isTauri,
  launchTemplate,
  onProcessExit,
  onProcessOutput,
  openTarget,
  openTerminal,
  readTextFile,
  startProcess,
  stopProcess,
  writeTextFile,
} from "../shared/lib/tauri";
import {
  checkForAppUpdate,
  getCurrentAppVersion,
  installAppUpdate,
  type AvailableAppUpdate,
  type UpdateProgress,
} from "../shared/lib/updater";
import type {
  AppData,
  Editor,
  EditorSuggestion,
  ProcessRun,
  Project,
  ProjectCandidate,
  ProjectCommand,
  Workspace,
  WorkspaceAction,
} from "../shared/types/models";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function mergeDetectedEditors(editors: Editor[], suggestions: EditorSuggestion[]) {
  const next = [...editors];
  for (const suggestion of suggestions) {
    const duplicate = next.some((editor) =>
      editor.id === suggestion.id ||
      editor.commandTemplate.toLowerCase() === suggestion.commandTemplate.toLowerCase(),
    );
    if (!duplicate) next.push({ ...suggestion, enabled: true, detected: true });
  }
  return next;
}

export function App() {
  const [data, setData] = useState<AppData>(loadData);
  const [search, setSearch] = useState("");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>();
  const [todoProjectId, setTodoProjectId] = useState<string>();
  const [createOpen, setCreateOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workspacesOpen, setWorkspacesOpen] = useState(false);
  const [processesOpen, setProcessesOpen] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [currentVersion, setCurrentVersion] = useState("0.2.2");
  const [checkingForUpdates, setCheckingForUpdates] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<AvailableAppUpdate>();
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateInstalling, setUpdateInstalling] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress>();
  const [updateError, setUpdateError] = useState<string>();
  const searchRef = useRef<HTMLInputElement>(null);
  const startupUpdateCheckStarted = useRef(false);
  const startupIdeScanStarted = useRef(false);
  const t = (german: string, english: string) => translate(data.settings.language, german, english);

  const selectedProject = data.projects.find((project) => project.id === selectedProjectId);
  const todoProject = data.projects.find((project) => project.id === todoProjectId);
  const editorById = useMemo(() => new Map(data.editors.map((editor) => [editor.id, editor])), [data.editors]);
  const activeProcesses = data.processHistory.filter((process) => ["starting", "running", "stopping"].includes(process.status));

  const visibleProjects = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return [...data.projects]
      .filter((project) => showArchived ? true : !project.archived)
      .filter((project) => favoriteOnly ? project.favorite : true)
      .filter((project) => {
        if (!needle) return true;
        return [
          project.name,
          project.path,
          project.description,
          ...(project.inspection?.frameworks ?? []),
          project.inspection?.branch ?? "",
        ].some((value) => value.toLowerCase().includes(needle));
      })
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || (b.lastOpenedAt ?? b.createdAt).localeCompare(a.lastOpenedAt ?? a.createdAt));
  }, [data.projects, favoriteOnly, search, showArchived]);

  useEffect(() => {
    const timer = window.setTimeout(() => saveData(data), 200);
    return () => window.clearTimeout(timer);
  }, [data]);

  useEffect(() => {
    document.documentElement.lang = data.settings.language;
  }, [data.settings.language]);

  useEffect(() => {
    if (startupIdeScanStarted.current || data.settings.ideDetectionComplete || !isTauri()) return;
    startupIdeScanStarted.current = true;

    void detectEditors()
      .then((suggestions) => {
        setData((current) => ({
          ...current,
          editors: mergeDetectedEditors(current.editors, suggestions),
          settings: { ...current.settings, ideDetectionComplete: true },
        }));
        if (suggestions.length > 0) {
          pushToast(
            "success",
            t("Installierte IDEs erkannt", "Installed IDEs detected"),
            t(
              `${suggestions.length} Editor${suggestions.length === 1 ? "" : "en"} wurde${suggestions.length === 1 ? "" : "n"} hinzugefügt.`,
              `${suggestions.length} editor${suggestions.length === 1 ? "" : "s"} added.`,
            ),
          );
        }
      })
      .catch(() => {
        setData((current) => ({
          ...current,
          settings: { ...current.settings, ideDetectionComplete: true },
        }));
      });
  }, []);

  useEffect(() => {
    if (startupUpdateCheckStarted.current) return;
    startupUpdateCheckStarted.current = true;

    void getCurrentAppVersion().then(setCurrentVersion).catch(() => undefined);
    if (data.settings.checkForUpdatesOnStartup) {
      const timer = window.setTimeout(() => void checkForUpdates(false), 1100);
      return () => window.clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const resolved = data.settings.theme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
        : data.settings.theme;
      root.dataset.theme = resolved;
    };
    apply();
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [data.settings.theme]);

  useEffect(() => {
    let unlistenOutput: () => void = () => {};
    let unlistenExit: () => void = () => {};

    void onProcessOutput((event) => {
      setData((current) => ({
        ...current,
        processHistory: current.processHistory.map((process) =>
          process.id === event.runId
            ? {
                ...process,
                logs: [...process.logs, `${event.stream === "stderr" ? "[stderr] " : ""}${event.line}`].slice(-500),
              }
            : process,
        ),
      }));
    }).then((unlisten) => { unlistenOutput = unlisten; });

    void onProcessExit((event) => {
      setData((current) => ({
        ...current,
        processHistory: current.processHistory.map((process) => {
          if (process.id !== event.runId) return process;
          const stopped = process.status === "stopping";
          return {
            ...process,
            status: stopped ? "stopped" : event.success ? "success" : "failed",
            exitCode: event.exitCode,
            endedAt: new Date().toISOString(),
          };
        }),
      }));
    }).then((unlisten) => { unlistenExit = unlisten; });

    return () => {
      unlistenOutput();
      unlistenExit();
    };
  }, []);

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setCreateOpen(true);
      }
    };
    document.addEventListener("keydown", handleKeyboard);
    return () => document.removeEventListener("keydown", handleKeyboard);
  }, []);

  function pushToast(type: Toast["type"], title: string, message?: string) {
    const id = createId();
    setToasts((current) => [...current, { id, type, title, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4500);
  }

  async function checkForUpdates(manual: boolean) {
    if (checkingForUpdates) return;
    setCheckingForUpdates(true);
    setUpdateError(undefined);
    try {
      const found = await checkForAppUpdate();
      if (found) {
        setAvailableUpdate(found);
        setUpdateProgress(undefined);
        setUpdateOpen(true);
        return;
      }
      if (manual) {
        pushToast(
          "success",
          t("CodeDeck ist aktuell", "CodeDeck is up to date"),
          t(`Installierte Version: ${currentVersion}`, `Installed version: ${currentVersion}`),
        );
      }
    } catch (error) {
      const message = errorMessage(error);
      if (manual) {
        pushToast("error", t("Update-Prüfung fehlgeschlagen", "Update check failed"), message);
      } else {
        console.warn("CodeDeck update check failed", error);
      }
    } finally {
      setCheckingForUpdates(false);
    }
  }

  async function installAvailableUpdate() {
    if (!availableUpdate || updateInstalling) return;
    setUpdateInstalling(true);
    setUpdateError(undefined);
    try {
      await installAppUpdate(availableUpdate, setUpdateProgress);
    } catch (error) {
      setUpdateError(errorMessage(error));
      setUpdateInstalling(false);
    }
  }

  function updateProject(project: Project) {
    setData((current) => ({
      ...current,
      projects: current.projects.map((entry) => entry.id === project.id ? project : entry),
    }));
  }

  function addProject(project: Project) {
    setData((current) => ({
      ...current,
      projects: [project, ...current.projects.filter((entry) => entry.path.toLowerCase() !== project.path.toLowerCase())],
      settings: { ...current.settings, onboardingComplete: true },
    }));
    setSelectedProjectId(project.id);
    pushToast("success", t("Projekt hinzugefügt", "Project added"), project.name);
  }

  function deleteProject(projectId: string) {
    setData((current) => ({
      ...current,
      projects: current.projects.filter((project) => project.id !== projectId),
      workspaces: current.workspaces.map((workspace) => ({
        ...workspace,
        actions: workspace.actions.filter((action) => action.projectId !== projectId),
      })),
    }));
    setSelectedProjectId(undefined);
    setTodoProjectId(undefined);
    pushToast("success", t("Projekt entfernt", "Project removed"), t("Die Projektdateien wurden nicht verändert.", "The project files were not changed."));
  }

  async function openProjectEditor(project: Project, editorId?: string) {
    const editor = editorById.get(editorId ?? project.preferredEditorId ?? "") ?? data.editors.find((entry) => entry.enabled);
    if (!editor) {
      setSettingsOpen(true);
      pushToast("info", t("Keine IDE konfiguriert", "No IDE configured"), t("Lege in den Einstellungen zuerst einen Editor an.", "Add an editor in Settings first."));
      return;
    }
    if (!editor.commandTemplate.includes("{projectPath}")) {
      setSettingsOpen(true);
      pushToast(
        "error",
        t("IDE-Befehl ist unvollständig", "IDE command is incomplete"),
        t("Der Startbefehl muss {projectPath} enthalten. Code Deck hat die Einstellungen geöffnet.", "The launch command must contain {projectPath}. Code Deck opened Settings."),
      );
      return;
    }
    try {
      await launchTemplate(editor.commandTemplate, project.path, project.name);
      const lastOpenedAt = new Date().toISOString();
      updateProject({ ...project, preferredEditorId: project.preferredEditorId ?? editor.id, lastOpenedAt, updatedAt: lastOpenedAt });
      pushToast("success", t(`${project.name} geöffnet`, `${project.name} opened`), editor.name);
    } catch (error) {
      pushToast("error", t("IDE konnte nicht gestartet werden", "Could not launch IDE"), errorMessage(error));
    }
  }

  async function openProjectTerminal(project: Project) {
    try {
      await openTerminal(project.path, data.settings.terminalCommand);
    } catch (error) {
      pushToast("error", t("Terminal konnte nicht geöffnet werden", "Could not open terminal"), errorMessage(error));
    }
  }

  async function openProjectFolder(project: Project) {
    try {
      await openTarget(project.path);
    } catch (error) {
      pushToast("error", t("Ordner konnte nicht geöffnet werden", "Could not open folder"), errorMessage(error));
    }
  }

  async function runProjectCommand(project: Project, command: ProjectCommand, workspaceId?: string) {
    let safeCommand = command;
    if (data.settings.confirmImportedCommands && command.imported && !command.trusted) {
      const confirmed = window.confirm(t(`Dieser Command wurde importiert und noch nicht bestätigt:\n\n${command.command}\n\nNur starten, wenn du dem Inhalt vertraust.`, `This command was imported and has not been trusted yet:\n\n${command.command}\n\nOnly run it if you trust its contents.`));
      if (!confirmed) return;
      safeCommand = { ...command, trusted: true };
      updateProject({
        ...project,
        commands: project.commands.map((entry) => entry.id === command.id ? safeCommand : entry),
        updatedAt: new Date().toISOString(),
      });
    }

    const run: ProcessRun = {
      id: createId(),
      projectId: project.id,
      commandId: safeCommand.id,
      workspaceId,
      label: safeCommand.label,
      command: safeCommand.command,
      status: "starting",
      startedAt: new Date().toISOString(),
      logs: [`$ ${safeCommand.command}`],
    };
    setData((current) => ({ ...current, processHistory: [run, ...current.processHistory].slice(0, 100) }));
    setProcessesOpen(true);
    try {
      const result = await startProcess(run.id, project.path, safeCommand.command, safeCommand.workingDir, safeCommand.env);
      setData((current) => ({
        ...current,
        processHistory: current.processHistory.map((entry) => entry.id === run.id ? { ...entry, pid: result.pid, status: "running" } : entry),
      }));
    } catch (error) {
      setData((current) => ({
        ...current,
        processHistory: current.processHistory.map((entry) => entry.id === run.id ? {
          ...entry,
          status: "failed",
          endedAt: new Date().toISOString(),
          logs: [...entry.logs, `${t("[Fehler]", "[Error]")} ${errorMessage(error)}`],
        } : entry),
      }));
      pushToast("error", t("Command konnte nicht gestartet werden", "Could not start command"), errorMessage(error));
    }
  }

  async function runRawCommand(project: Project, label: string, command: string, workspaceId?: string) {
    await runProjectCommand(project, { id: createId(), label, command, env: {}, trusted: true }, workspaceId);
  }

  async function stopRun(process: ProcessRun, ask = true) {
    if (!process.pid) return;
    if (ask && !window.confirm(t(`Prozess „${process.label}“ wirklich beenden?`, `Stop process “${process.label}”?`))) return;
    setData((current) => ({
      ...current,
      processHistory: current.processHistory.map((entry) => entry.id === process.id ? { ...entry, status: "stopping" } : entry),
    }));
    try {
      await stopProcess(process.pid);
    } catch (error) {
      pushToast("error", t("Prozess konnte nicht beendet werden", "Could not stop process"), errorMessage(error));
      setData((current) => ({
        ...current,
        processHistory: current.processHistory.map((entry) => entry.id === process.id ? { ...entry, status: "running" } : entry),
      }));
    }
  }

  async function refreshInspection(project: Project) {
    try {
      const inspection = await inspectProject(project.path);
      updateProject({ ...project, inspection, updatedAt: new Date().toISOString() });
      pushToast("success", t("Projektstatus aktualisiert", "Project status refreshed"), project.name);
      return inspection;
    } catch (error) {
      pushToast("error", t("Projekt konnte nicht analysiert werden", "Could not inspect project"), errorMessage(error));
      return undefined;
    }
  }

  async function addCandidate(candidate: ProjectCandidate) {
    try {
      const inspection = await inspectProject(candidate.path);
      const now = new Date().toISOString();
      addProject({
        id: createId(),
        name: candidate.name,
        path: candidate.path,
        description: "",
        favorite: false,
        archived: false,
        preferredEditorId: data.editors.find((editor) => editor.enabled)?.id,
        commands: inspection.scripts.slice(0, 6).map((script) => ({ id: createId(), label: script.name, command: script.command, env: {}, trusted: true })),
        todos: [],
        createdAt: now,
        updatedAt: now,
        inspection,
      });
    } catch (error) {
      pushToast("error", t("Projekt konnte nicht hinzugefügt werden", "Could not add project"), errorMessage(error));
    }
  }

  async function runWorkspaceAction(workspace: Workspace, action: WorkspaceAction) {
    if (action.type === "openUrl" && action.url) {
      await openTarget(action.url);
      return;
    }
    const project = data.projects.find((entry) => entry.id === action.projectId);
    if (!project) throw new Error(t("Ein Projekt dieser Workspace-Aktion wurde nicht gefunden.", "A project used by this workspace action could not be found."));
    if (action.type === "openEditor") return openProjectEditor(project, action.editorId);
    if (action.type === "openTerminal") return openProjectTerminal(project);
    if (action.type === "openFileManager") return openProjectFolder(project);
    if (action.type === "runCommand") {
      const command = project.commands.find((entry) => entry.id === action.commandId);
      if (command) return runProjectCommand(project, command, workspace.id);
      if (action.command) return runRawCommand(project, action.command, action.command, workspace.id);
    }
  }

  async function startWorkspace(workspace: Workspace) {
    const actions = [...workspace.actions].sort((a, b) => a.order - b.order);
    try {
      const parallel = actions.filter((action) => action.runMode === "parallel");
      const sequence = actions.filter((action) => action.runMode === "sequence");
      await Promise.all(parallel.map((action) => runWorkspaceAction(workspace, action)));
      for (const action of sequence) {
        await runWorkspaceAction(workspace, action);
        await sleep(350);
      }
      pushToast("success", t("Workspace gestartet", "Workspace started"), t(`${workspace.name}: ${actions.length} Aktionen`, `${workspace.name}: ${actions.length} actions`));
    } catch (error) {
      pushToast("error", t("Workspace konnte nicht vollständig gestartet werden", "Workspace could not be started completely"), errorMessage(error));
    }
  }

  async function stopWorkspace(workspace: Workspace) {
    const runs = data.processHistory.filter((process) => process.workspaceId === workspace.id && ["starting", "running", "stopping"].includes(process.status));
    if (!runs.length) {
      pushToast("info", t("Keine aktiven Prozesse", "No active processes"), workspace.name);
      return;
    }
    if (!window.confirm(t(`${runs.length} Prozess(e) des Workspaces „${workspace.name}“ beenden?`, `Stop ${runs.length} process(es) from workspace “${workspace.name}”?`))) return;
    await Promise.all(runs.map((run) => stopRun(run, false)));
  }

  async function exportConfiguration() {
    try {
      const path = await chooseExportPath();
      if (!path) return;
      const exportData = {
        ...data,
        processHistory: data.processHistory.filter((process) => !["starting", "running", "stopping"].includes(process.status)),
        exportedAt: new Date().toISOString(),
      };
      await writeTextFile(path, JSON.stringify(exportData, null, 2));
      pushToast("success", t("Konfiguration exportiert", "Configuration exported"), path);
    } catch (error) {
      pushToast("error", t("Export fehlgeschlagen", "Export failed"), errorMessage(error));
    }
  }

  async function importConfiguration() {
    try {
      const path = await chooseConfigFile();
      if (!path) return;
      const contents = await readTextFile(path);
      const parsed = JSON.parse(contents) as unknown;
      const imported = normalizeData(parsed, true);
      if (!window.confirm(t(`Konfiguration importieren?\n\n${imported.projects.length} Projekte\n${imported.editors.length} IDEs\n${imported.workspaces.length} Workspaces\n\nDie aktuelle Konfiguration wird ersetzt.`, `Import configuration?\n\n${imported.projects.length} projects\n${imported.editors.length} IDEs\n${imported.workspaces.length} workspaces\n\nThe current configuration will be replaced.`))) return;
      setData(imported);
      setSelectedProjectId(undefined);
      pushToast("success", t("Konfiguration importiert", "Configuration imported"), t("Importierte Commands müssen vor dem ersten Start bestätigt werden.", "Imported commands must be confirmed before their first run."));
    } catch (error) {
      pushToast("error", t("Import fehlgeschlagen", "Import failed"), errorMessage(error));
    }
  }

  const emptyBecauseFilters = data.projects.length > 0 && visibleProjects.length === 0;


  return (
    <I18nProvider language={data.settings.language}>
      <div className="app-shell">
      <header className="app-header">
        <div className="app-header__bar">
          {/* Brand/logo intentionally hidden in the navigation bar. */}
          <nav className="main-nav" aria-label={t("Hauptnavigation", "Main navigation")}>
            <button className="main-nav__item active" type="button" aria-current="page">
              <Icon name="folder" />
              <span>{t("Projekte", "Projects")}</span>
            </button>
            <button className="main-nav__item" type="button" onClick={() => setWorkspacesOpen(true)}>
              <Icon name="layers" />
              <span>Workspaces</span>
              {data.workspaces.length > 0 && <small>{data.workspaces.length}</small>}
            </button>
            <button className="main-nav__item" type="button" onClick={() => setProcessesOpen(true)}>
              <Icon name="terminal" />
              <span>{t("Prozesse", "Processes")}</span>
              {activeProcesses.length > 0 && <small className="main-nav__badge">{activeProcesses.length}</small>}
            </button>
          </nav>

          <div className="app-header__actions">
            <button
              className="icon-button"
              type="button"
              onClick={() => setSettingsOpen(true)}
              title={t("Einstellungen", "Settings")}
              aria-label={t("Einstellungen öffnen", "Open settings")}
            >
              <Icon name="settings" />
            </button>
            <button className="button button--primary" type="button" onClick={() => setCreateOpen(true)}>
              <Icon name="plus" />
              <span>{t("Projekt hinzufügen", "Add project")}</span>
            </button>
          </div>
        </div>

        <div className="app-toolbar">
          <div className="app-toolbar__title">
            <h1>{t("Projekte", "Projects")}</h1>
            <span>{visibleProjects.length} {t("von", "of")} {data.projects.filter((project) => showArchived || !project.archived).length}</span>
          </div>
          <div className="global-search">
            <Icon name="search" />
            <input
              ref={searchRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("Name, Pfad oder Framework", "Name, path or framework")}
              aria-label={t("Projekte durchsuchen", "Search projects")}
            />
            <kbd>Ctrl K</kbd>
          </div>
          <button className="button button--secondary" type="button" onClick={() => setScanOpen(true)}>
            <Icon name="search" />
            <span>{t("Ordner scannen", "Scan folder")}</span>
          </button>
        </div>
      </header>

      <main className="home-page">
        <section className="filter-bar" aria-label={t("Projektfilter", "Project filters")}>
          <div className="filter-bar__left">
            <button className={`filter-chip ${favoriteOnly ? "active" : ""}`} type="button" onClick={() => setFavoriteOnly((value) => !value)}>
              <Icon name="star" />
              <span>{t("Favoriten", "Favorites")}</span>
            </button>
            <label className="filter-checkbox">
              <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
              <span>{t("Archivierte anzeigen", "Show archived")}</span>
            </label>
          </div>
          {(search || favoriteOnly || showArchived) && (
            <button className="text-button filter-reset" type="button" onClick={() => { setSearch(""); setFavoriteOnly(false); setShowArchived(false); }}>
              <Icon name="x" />
              <span>{t("Zurücksetzen", "Reset")}</span>
            </button>
          )}
        </section>

        {visibleProjects.length ? (
          <section className="project-list" aria-label={t("Projektliste", "Project list")}>
            <div className="project-list__header" aria-hidden="true">
              <span>{t("Projekt", "Project")}</span>
              <span>{t("Technologien", "Technologies")}</span>
              <span>Git</span>
              <span>{t("Zuletzt genutzt", "Last used")}</span>
              <span>{t("Aktionen", "Actions")}</span>
            </div>
            <div className="project-list__body">
              {visibleProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  editor={editorById.get(project.preferredEditorId ?? "")}
                  onOpenDetails={() => setSelectedProjectId(project.id)}
                  onOpenEditor={() => void openProjectEditor(project)}
                  onOpenTodos={() => setTodoProjectId(project.id)}
                  onRunCommand={(command) => void runProjectCommand(project, command)}
                  onToggleFavorite={() => updateProject({ ...project, favorite: !project.favorite, updatedAt: new Date().toISOString() })}
                />
              ))}
            </div>
          </section>
        ) : (
          <section className="home-empty">
            <div className="home-empty__art"><Icon name={emptyBecauseFilters ? "search" : "folder"} /></div>
            <h2>{emptyBecauseFilters ? t("Keine passenden Projekte", "No matching projects") : t("Noch keine Projekte", "No projects yet")}</h2>
            <p>{emptyBecauseFilters ? t("Ändere die Suche oder setze die Filter zurück.", "Change the search or reset the filters.") : t("Füge einen vorhandenen Ordner hinzu oder erstelle ein neues Projekt aus einer Vorlage.", "Add an existing folder or create a new project from a template.")}</p>
            <div className="button-row">
              {emptyBecauseFilters ? (
                <button className="button button--secondary" type="button" onClick={() => { setSearch(""); setFavoriteOnly(false); setShowArchived(false); }}>
                  <Icon name="refresh" />
                  <span>{t("Filter zurücksetzen", "Reset filters")}</span>
                </button>
              ) : (
                <>
                  <button className="button button--secondary" type="button" onClick={() => setScanOpen(true)}>
                    <Icon name="search" />
                    <span>{t("Ordner scannen", "Scan folder")}</span>
                  </button>
                  <button className="button button--primary" type="button" onClick={() => setCreateOpen(true)}>
                    <Icon name="plus" />
                    <span>{t("Projekt hinzufügen", "Add project")}</span>
                  </button>
                </>
              )}
            </div>
          </section>
        )}
      </main>

      <ProjectCreateModal
        open={createOpen}
        editors={data.editors}
        projectTemplates={data.projectTemplates}
        defaultProjectDir={data.settings.defaultProjectDir}
        onClose={() => setCreateOpen(false)}
        onCreate={addProject}
        onOpenTemplateSettings={() => { setCreateOpen(false); setSettingsOpen(true); }}
        onError={(message) => pushToast("error", t("Projekt konnte nicht hinzugefügt werden", "Could not add project"), message)}
      />
      <ProjectScanModal
        open={scanOpen}
        defaultProjectDir={data.settings.defaultProjectDir}
        existingPaths={data.projects.map((project) => project.path)}
        onClose={() => setScanOpen(false)}
        onChooseCandidate={(candidate) => { setScanOpen(false); void addCandidate(candidate); }}
        onError={(message) => pushToast("error", t("Scan fehlgeschlagen", "Scan failed"), message)}
      />
      <ProjectDetails
        project={selectedProject}
        editors={data.editors}
        processHistory={data.processHistory}
        onClose={() => setSelectedProjectId(undefined)}
        onUpdate={updateProject}
        onDelete={deleteProject}
        onOpenEditor={(project, editorId) => void openProjectEditor(project, editorId)}
        onOpenTodos={(project) => setTodoProjectId(project.id)}
        onOpenTerminal={(project) => void openProjectTerminal(project)}
        onOpenFileManager={(project) => void openProjectFolder(project)}
        onRunCommand={(project, command, workspaceId) => void runProjectCommand(project, command, workspaceId)}
        onRunRawCommand={(project, label, command) => void runRawCommand(project, label, command)}
        onRefreshInspection={refreshInspection}
        onError={(message) => pushToast("error", t("Eingabe prüfen", "Check input"), message)}
      />
      <ProjectTodosModal
        project={todoProject}
        onClose={() => setTodoProjectId(undefined)}
        onUpdate={updateProject}
        onError={(message) => pushToast("error", t("Todo konnte nicht gespeichert werden", "Could not save todo"), message)}
      />
      <SettingsPanel
        open={settingsOpen}
        editors={data.editors}
        projectTemplates={data.projectTemplates}
        settings={data.settings}
        currentVersion={currentVersion}
        checkingForUpdates={checkingForUpdates}
        onClose={() => setSettingsOpen(false)}
        onEditorsChange={(editors: Editor[]) => setData((current) => ({ ...current, editors }))}
        onProjectTemplatesChange={(projectTemplates) => setData((current) => ({ ...current, projectTemplates }))}
        onSettingsChange={(settings) => setData((current) => ({ ...current, settings }))}
        onExport={() => void exportConfiguration()}
        onImport={() => void importConfiguration()}
        onResetOnboarding={() => { setData((current) => ({ ...current, settings: { ...current.settings, onboardingComplete: false } })); setOnboardingDismissed(false); setSettingsOpen(false); }}
        onCheckForUpdates={() => void checkForUpdates(true)}
        onSuccess={(message) => pushToast("success", t("Einstellungen", "Settings"), message)}
        onError={(message) => pushToast("error", t("Einstellungen", "Settings"), message)}
      />
      <WorkspacesPanel
        open={workspacesOpen}
        workspaces={data.workspaces}
        projects={data.projects}
        editors={data.editors}
        onClose={() => setWorkspacesOpen(false)}
        onChange={(workspaces) => setData((current) => ({ ...current, workspaces }))}
        onStart={(workspace) => void startWorkspace(workspace)}
        onStop={(workspace) => void stopWorkspace(workspace)}
        onError={(message) => pushToast("error", "Workspace", message)}
      />
      <ProcessesPanel
        open={processesOpen}
        processes={data.processHistory}
        projects={data.projects}
        onClose={() => setProcessesOpen(false)}
        onStop={(process) => void stopRun(process)}
        onClearFinished={() => setData((current) => ({ ...current, processHistory: current.processHistory.filter((process) => ["starting", "running", "stopping"].includes(process.status)) }))}
      />
      <Onboarding
        open={!data.settings.onboardingComplete && !onboardingDismissed}
        hasEditors={data.editors.some((editor) => editor.enabled)}
        hasProjects={data.projects.length > 0}
        onAddProject={() => { setOnboardingDismissed(true); setCreateOpen(true); }}
        onOpenSettings={() => { setOnboardingDismissed(true); setSettingsOpen(true); }}
        onComplete={() => { setData((current) => ({ ...current, settings: { ...current.settings, onboardingComplete: true } })); setOnboardingDismissed(true); }}
      />
      <UpdateModal
        open={updateOpen}
        update={availableUpdate}
        installing={updateInstalling}
        progress={updateProgress}
        error={updateError}
        onClose={() => { if (!updateInstalling) setUpdateOpen(false); }}
        onInstall={() => void installAvailableUpdate()}
      />
      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
      </div>
    </I18nProvider>
  );
}
