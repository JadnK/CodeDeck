import { useEffect, useMemo, useRef, useState } from "react";
import { Onboarding } from "../features/onboarding/Onboarding";
import { ProcessesPanel } from "../features/processes/ProcessesPanel";
import { ProjectCard } from "../features/projects/ProjectCard";
import { ProjectCreateModal } from "../features/projects/ProjectCreateModal";
import { ProjectDetails } from "../features/projects/ProjectDetails";
import { ProjectScanModal } from "../features/projects/ProjectScanModal";
import { SettingsPanel } from "../features/settings/SettingsPanel";
import { WorkspacesPanel } from "../features/workspaces/WorkspacesPanel";
import { Icon } from "../shared/components/Icon";
import { ToastStack, type Toast } from "../shared/components/ToastStack";
import { createId, loadData, normalizeData, saveData } from "../shared/lib/storage";
import {
  chooseConfigFile,
  chooseExportPath,
  inspectProject,
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
import type {
  AppData,
  Editor,
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

export function App() {
  const [data, setData] = useState<AppData>(loadData);
  const [search, setSearch] = useState("");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedTag, setSelectedTag] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>();
  const [createOpen, setCreateOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workspacesOpen, setWorkspacesOpen] = useState(false);
  const [processesOpen, setProcessesOpen] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedProject = data.projects.find((project) => project.id === selectedProjectId);
  const editorById = useMemo(() => new Map(data.editors.map((editor) => [editor.id, editor])), [data.editors]);
  const allTags = useMemo(
    () => Array.from(new Set(data.projects.flatMap((project) => [...project.tags, ...(project.inspection?.frameworks ?? [])]))).sort((a, b) => a.localeCompare(b)),
    [data.projects],
  );
  const activeProcesses = data.processHistory.filter((process) => ["starting", "running", "stopping"].includes(process.status));

  const visibleProjects = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return [...data.projects]
      .filter((project) => showArchived ? true : !project.archived)
      .filter((project) => favoriteOnly ? project.favorite : true)
      .filter((project) => selectedTag ? [...project.tags, ...(project.inspection?.frameworks ?? [])].some((tag) => tag.toLowerCase() === selectedTag.toLowerCase()) : true)
      .filter((project) => {
        if (!needle) return true;
        return [
          project.name,
          project.path,
          project.description,
          ...project.tags,
          ...(project.inspection?.frameworks ?? []),
          project.inspection?.branch ?? "",
        ].some((value) => value.toLowerCase().includes(needle));
      })
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || (b.lastOpenedAt ?? b.createdAt).localeCompare(a.lastOpenedAt ?? a.createdAt));
  }, [data.projects, favoriteOnly, search, selectedTag, showArchived]);

  useEffect(() => {
    const timer = window.setTimeout(() => saveData(data), 200);
    return () => window.clearTimeout(timer);
  }, [data]);

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
    pushToast("success", "Projekt hinzugefügt", project.name);
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
    pushToast("success", "Projekt entfernt", "Die Projektdateien wurden nicht verändert.");
  }

  async function openProjectEditor(project: Project, editorId?: string) {
    const editor = editorById.get(editorId ?? project.preferredEditorId ?? "") ?? data.editors.find((entry) => entry.enabled);
    if (!editor) {
      setSettingsOpen(true);
      pushToast("info", "Keine IDE konfiguriert", "Lege in den Einstellungen zuerst einen Editor an.");
      return;
    }
    try {
      await launchTemplate(editor.commandTemplate, project.path, project.name);
      const lastOpenedAt = new Date().toISOString();
      updateProject({ ...project, preferredEditorId: project.preferredEditorId ?? editor.id, lastOpenedAt, updatedAt: lastOpenedAt });
      pushToast("success", `${project.name} geöffnet`, editor.name);
    } catch (error) {
      pushToast("error", "IDE konnte nicht gestartet werden", errorMessage(error));
    }
  }

  async function openProjectTerminal(project: Project) {
    try {
      await openTerminal(project.path, data.settings.terminalCommand);
    } catch (error) {
      pushToast("error", "Terminal konnte nicht geöffnet werden", errorMessage(error));
    }
  }

  async function openProjectFolder(project: Project) {
    try {
      await openTarget(project.path);
    } catch (error) {
      pushToast("error", "Ordner konnte nicht geöffnet werden", errorMessage(error));
    }
  }

  async function runProjectCommand(project: Project, command: ProjectCommand, workspaceId?: string) {
    let safeCommand = command;
    if (data.settings.confirmImportedCommands && command.imported && !command.trusted) {
      const confirmed = window.confirm(`Dieser Command wurde importiert und noch nicht bestätigt:\n\n${command.command}\n\nNur starten, wenn du dem Inhalt vertraust.`);
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
          logs: [...entry.logs, `[Fehler] ${errorMessage(error)}`],
        } : entry),
      }));
      pushToast("error", "Command konnte nicht gestartet werden", errorMessage(error));
    }
  }

  async function runRawCommand(project: Project, label: string, command: string, workspaceId?: string) {
    await runProjectCommand(project, { id: createId(), label, command, env: {}, trusted: true }, workspaceId);
  }

  async function stopRun(process: ProcessRun, ask = true) {
    if (!process.pid) return;
    if (ask && !window.confirm(`Prozess „${process.label}“ wirklich beenden?`)) return;
    setData((current) => ({
      ...current,
      processHistory: current.processHistory.map((entry) => entry.id === process.id ? { ...entry, status: "stopping" } : entry),
    }));
    try {
      await stopProcess(process.pid);
    } catch (error) {
      pushToast("error", "Prozess konnte nicht beendet werden", errorMessage(error));
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
      pushToast("success", "Projektstatus aktualisiert", project.name);
      return inspection;
    } catch (error) {
      pushToast("error", "Projekt konnte nicht analysiert werden", errorMessage(error));
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
        tags: inspection.frameworks,
        favorite: false,
        archived: false,
        preferredEditorId: data.editors.find((editor) => editor.enabled)?.id,
        commands: inspection.scripts.slice(0, 6).map((script) => ({ id: createId(), label: script.name, command: script.command, env: {}, trusted: true })),
        createdAt: now,
        updatedAt: now,
        inspection,
      });
    } catch (error) {
      pushToast("error", "Projekt konnte nicht hinzugefügt werden", errorMessage(error));
    }
  }

  async function runWorkspaceAction(workspace: Workspace, action: WorkspaceAction) {
    if (action.type === "openUrl" && action.url) {
      await openTarget(action.url);
      return;
    }
    const project = data.projects.find((entry) => entry.id === action.projectId);
    if (!project) throw new Error("Ein Projekt dieser Workspace-Aktion wurde nicht gefunden.");
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
      pushToast("success", "Workspace gestartet", `${workspace.name}: ${actions.length} Aktionen`);
    } catch (error) {
      pushToast("error", "Workspace konnte nicht vollständig gestartet werden", errorMessage(error));
    }
  }

  async function stopWorkspace(workspace: Workspace) {
    const runs = data.processHistory.filter((process) => process.workspaceId === workspace.id && ["starting", "running", "stopping"].includes(process.status));
    if (!runs.length) {
      pushToast("info", "Keine aktiven Prozesse", workspace.name);
      return;
    }
    if (!window.confirm(`${runs.length} Prozess(e) des Workspaces „${workspace.name}“ beenden?`)) return;
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
      pushToast("success", "Konfiguration exportiert", path);
    } catch (error) {
      pushToast("error", "Export fehlgeschlagen", errorMessage(error));
    }
  }

  async function importConfiguration() {
    try {
      const path = await chooseConfigFile();
      if (!path) return;
      const contents = await readTextFile(path);
      const parsed = JSON.parse(contents) as unknown;
      const imported = normalizeData(parsed, true);
      if (!window.confirm(`Konfiguration importieren?\n\n${imported.projects.length} Projekte\n${imported.editors.length} IDEs\n${imported.workspaces.length} Workspaces\n\nDie aktuelle Konfiguration wird ersetzt.`)) return;
      setData(imported);
      setSelectedProjectId(undefined);
      pushToast("success", "Konfiguration importiert", "Importierte Commands müssen vor dem ersten Start bestätigt werden.");
    } catch (error) {
      pushToast("error", "Import fehlgeschlagen", errorMessage(error));
    }
  }

  const emptyBecauseFilters = data.projects.length > 0 && visibleProjects.length === 0;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand__mark"><Icon name="code" /></span>
          <span><strong>Code Deck</strong><small>Local Developer Cockpit</small></span>
        </div>
        <div className="global-search">
          <Icon name="search" />
          <input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Projekte, Tags, Frameworks oder Pfade durchsuchen…" />
          <kbd>⌘ K</kbd>
        </div>
        <div className="header-actions">
          <button className="header-button" type="button" onClick={() => setWorkspacesOpen(true)}><Icon name="layers" /><span>Workspaces</span></button>
          <button className="header-button" type="button" onClick={() => setProcessesOpen(true)}><Icon name="terminal" /><span>Prozesse</span>{activeProcesses.length > 0 && <b>{activeProcesses.length}</b>}</button>
          <button className="header-button" type="button" onClick={() => setSettingsOpen(true)}><Icon name="settings" /><span>Einstellungen</span></button>
        </div>
      </header>

      <main className="home-page">
        <section className="home-hero">
          <div>
            <p className="eyebrow">Dein lokales Cockpit</p>
            <h1>Projekte</h1>
            <p>{data.projects.filter((project) => !project.archived).length} aktiv · {data.projects.filter((project) => project.favorite && !project.archived).length} Favoriten · {activeProcesses.length} Prozesse</p>
          </div>
          <div className="hero-actions">
            <button className="button button--secondary" type="button" onClick={() => setScanOpen(true)}><Icon name="search" />Ordner scannen</button>
            <button className="button button--primary" type="button" onClick={() => setCreateOpen(true)}><Icon name="plus" />Neues Projekt</button>
          </div>
        </section>

        <section className="filter-bar">
          <button className={`filter-chip ${favoriteOnly ? "active" : ""}`} type="button" onClick={() => setFavoriteOnly((value) => !value)}><Icon name="star" />Favoriten</button>
          <select aria-label="Nach Tag filtern" value={selectedTag} onChange={(event) => setSelectedTag(event.target.value)}><option value="">Alle Tags & Frameworks</option>{allTags.map((tag) => <option value={tag} key={tag}>{tag}</option>)}</select>
          <label className="filter-checkbox"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /><span>Archivierte anzeigen</span></label>
          {(search || favoriteOnly || selectedTag || showArchived) && <button className="text-button filter-reset" type="button" onClick={() => { setSearch(""); setFavoriteOnly(false); setSelectedTag(""); setShowArchived(false); }}><Icon name="x" />Filter zurücksetzen</button>}
        </section>

        {visibleProjects.length ? (
          <section className="project-grid">
            {visibleProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                editor={editorById.get(project.preferredEditorId ?? "")}
                onOpenDetails={() => setSelectedProjectId(project.id)}
                onOpenEditor={() => void openProjectEditor(project)}
                onRunCommand={(command) => void runProjectCommand(project, command)}
                onToggleFavorite={() => updateProject({ ...project, favorite: !project.favorite, updatedAt: new Date().toISOString() })}
              />
            ))}
          </section>
        ) : (
          <section className="home-empty">
            <div className="home-empty__art"><Icon name={emptyBecauseFilters ? "search" : "layers"} /></div>
            <h2>{emptyBecauseFilters ? "Keine passenden Projekte" : "Dein Deck ist noch leer"}</h2>
            <p>{emptyBecauseFilters ? "Passe Suche oder Filter an, um deine Projekte wiederzufinden." : "Füge einen lokalen Projektordner hinzu oder scanne einen Basisordner nach Git-Repositories und bekannten Projektdateien."}</p>
            <div className="button-row">
              {emptyBecauseFilters ? <button className="button button--secondary" type="button" onClick={() => { setSearch(""); setFavoriteOnly(false); setSelectedTag(""); setShowArchived(false); }}><Icon name="refresh" />Filter zurücksetzen</button> : <><button className="button button--secondary" type="button" onClick={() => setScanOpen(true)}><Icon name="search" />Ordner scannen</button><button className="button button--primary" type="button" onClick={() => setCreateOpen(true)}><Icon name="plus" />Erstes Projekt hinzufügen</button></>}
            </div>
          </section>
        )}
      </main>

      <button className="floating-add" type="button" onClick={() => setCreateOpen(true)}><Icon name="plus" /><span>Neues Projekt</span></button>

      <ProjectCreateModal
        open={createOpen}
        editors={data.editors}
        projectTemplates={data.projectTemplates}
        defaultProjectDir={data.settings.defaultProjectDir}
        onClose={() => setCreateOpen(false)}
        onCreate={addProject}
        onOpenTemplateSettings={() => { setCreateOpen(false); setSettingsOpen(true); }}
        onError={(message) => pushToast("error", "Projekt konnte nicht hinzugefügt werden", message)}
      />
      <ProjectScanModal
        open={scanOpen}
        defaultProjectDir={data.settings.defaultProjectDir}
        existingPaths={data.projects.map((project) => project.path)}
        onClose={() => setScanOpen(false)}
        onChooseCandidate={(candidate) => { setScanOpen(false); void addCandidate(candidate); }}
        onError={(message) => pushToast("error", "Scan fehlgeschlagen", message)}
      />
      <ProjectDetails
        project={selectedProject}
        editors={data.editors}
        processHistory={data.processHistory}
        onClose={() => setSelectedProjectId(undefined)}
        onUpdate={updateProject}
        onDelete={deleteProject}
        onOpenEditor={(project, editorId) => void openProjectEditor(project, editorId)}
        onOpenTerminal={(project) => void openProjectTerminal(project)}
        onOpenFileManager={(project) => void openProjectFolder(project)}
        onRunCommand={(project, command, workspaceId) => void runProjectCommand(project, command, workspaceId)}
        onRunRawCommand={(project, label, command) => void runRawCommand(project, label, command)}
        onRefreshInspection={refreshInspection}
        onError={(message) => pushToast("error", "Eingabe prüfen", message)}
      />
      <SettingsPanel
        open={settingsOpen}
        editors={data.editors}
        projectTemplates={data.projectTemplates}
        settings={data.settings}
        onClose={() => setSettingsOpen(false)}
        onEditorsChange={(editors: Editor[]) => setData((current) => ({ ...current, editors }))}
        onProjectTemplatesChange={(projectTemplates) => setData((current) => ({ ...current, projectTemplates }))}
        onSettingsChange={(settings) => setData((current) => ({ ...current, settings }))}
        onExport={() => void exportConfiguration()}
        onImport={() => void importConfiguration()}
        onResetOnboarding={() => { setData((current) => ({ ...current, settings: { ...current.settings, onboardingComplete: false } })); setOnboardingDismissed(false); setSettingsOpen(false); }}
        onError={(message) => pushToast("error", "Einstellungen", message)}
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
      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
    </div>
  );
}
