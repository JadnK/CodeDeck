import { useEffect, useState } from "react";
import { Icon } from "../../shared/components/Icon";
import { GitHubProjectPanel } from "../github/GitHubProjectPanel";
import { Modal } from "../../shared/components/Modal";
import { useI18n } from "../../shared/i18n/I18n";
import { createId } from "../../shared/lib/storage";
import { getDetectedTechnologies } from "../../shared/lib/projectInspection";
import type {
  Editor,
  Project,
  ProjectCommand,
  ProjectInspection,
} from "../../shared/types/models";

type ProjectDetailsProps = {
  project?: Project;
  editors: Editor[];
  githubToken: string;
  onClose: () => void;
  onUpdate: (project: Project) => void;
  onDelete: (projectId: string) => void;
  onOpenEditor: (project: Project, editorId?: string) => void;
  onOpenTodos: (project: Project) => void;
  onOpenTerminal: (project: Project) => void;
  onOpenFileManager: (project: Project) => void;
  onRunCommand: (project: Project, command: ProjectCommand, workspaceId?: string) => void;
  onBuildProject: (project: Project) => void;
  onRunProject: (project: Project) => void;
  onOpenProjectUrl: (project: Project) => void;
  onRefreshInspection: (project: Project) => Promise<ProjectInspection | undefined>;
  onOpenGitHubSettings: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

type Tab = "overview" | "commands" | "git" | "edit";


export function ProjectDetails({
  project,
  editors,
  githubToken,
  onClose,
  onUpdate,
  onDelete,
  onOpenEditor,
  onOpenTodos,
  onOpenTerminal,
  onOpenFileManager,
  onRunCommand,
  onBuildProject,
  onRunProject,
  onOpenProjectUrl,
  onRefreshInspection,
  onOpenGitHubSettings,
  onSuccess,
  onError,
}: ProjectDetailsProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("overview");
  const [commandLabel, setCommandLabel] = useState("");
  const [commandValue, setCommandValue] = useState("");
  const [editingCommandId, setEditingCommandId] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState<Project>();
  const [runtimeDraft, setRuntimeDraft] = useState({ buildCommand: "", runCommand: "", devPort: "" });

  useEffect(() => {
    setTab("overview");
    setCommandLabel("");
    setCommandValue("");
    setEditingCommandId(undefined);
  }, [project?.id]);

  useEffect(() => {
    setDraft(project ? structuredClone(project) : undefined);
    setRuntimeDraft({
      buildCommand: project?.buildCommand ?? "",
      runCommand: project?.runCommand ?? "",
      devPort: project?.devPort ? String(project.devPort) : "",
    });
  }, [project]);



  if (!project || !draft) return null;

  const currentProject: Project = project;
  const currentDraft: Project = draft;
  const preferredEditor = editors.find((editor) => editor.id === currentProject.preferredEditorId);
  const inspection = currentProject.inspection;
  const technologies = getDetectedTechnologies(inspection);
  const detectedLanguages = technologies.filter((entry) => entry.kind === "language").map((entry) => entry.label);
  const detectedFrameworks = technologies.filter((entry) => entry.kind === "framework").map((entry) => entry.label);
  const detectedTools = technologies.filter((entry) => entry.kind === "tool").map((entry) => entry.label);

  function saveCommand(event: React.FormEvent) {
    event.preventDefault();
    if (!commandLabel.trim() || !commandValue.trim()) {
      onError(t("Command-Name und Befehl dürfen nicht leer sein.", "Command name and command must not be empty."));
      return;
    }
    const commands = editingCommandId
      ? currentProject.commands.map((command) =>
          command.id === editingCommandId
            ? { ...command, label: commandLabel.trim(), command: commandValue.trim() }
            : command,
        )
      : [
          ...currentProject.commands,
          {
            id: createId(),
            label: commandLabel.trim(),
            command: commandValue.trim(),
            env: {},
            trusted: true,
          },
        ];
    onUpdate({ ...currentProject, commands, updatedAt: new Date().toISOString() });
    setCommandLabel("");
    setCommandValue("");
    setEditingCommandId(undefined);
  }

  function editCommand(command: ProjectCommand) {
    setCommandLabel(command.label);
    setCommandValue(command.command);
    setEditingCommandId(command.id);
  }

  function addDetectedScript(name: string, command: string) {
    if (currentProject.commands.some((entry) => entry.command === command)) return;
    onUpdate({
      ...currentProject,
      commands: [
        ...currentProject.commands,
        { id: createId(), label: name, command, env: {}, trusted: true },
      ],
      updatedAt: new Date().toISOString(),
    });
  }

  async function refresh() {
    setRefreshing(true);
    try {
      await onRefreshInspection(currentProject);
    } finally {
      setRefreshing(false);
    }
  }

  function saveProject(event: React.FormEvent) {
    event.preventDefault();
    if (!currentDraft.name.trim() || !currentDraft.path.trim()) {
      onError(t("Name und Projektpfad dürfen nicht leer sein.", "Name and project path must not be empty."));
      return;
    }
    onUpdate({ ...currentDraft, updatedAt: new Date().toISOString() });
  }

  function saveRuntimeSettings(event: React.FormEvent) {
    event.preventDefault();
    const port = runtimeDraft.devPort.trim() ? Number(runtimeDraft.devPort) : undefined;
    if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
      onError(t("Der Port muss zwischen 1 und 65535 liegen.", "The port must be between 1 and 65535."));
      return;
    }
    onUpdate({
      ...currentProject,
      buildCommand: runtimeDraft.buildCommand.trim(),
      runCommand: runtimeDraft.runCommand.trim(),
      devPort: port,
      updatedAt: new Date().toISOString(),
    });
    onSuccess(t("Build-, Run- und Port-Einstellungen wurden gespeichert.", "Build, run and port settings were saved."));
  }

  function confirmDelete() {
    if (window.confirm(t(`„${currentProject.name}“ wirklich aus Code Deck entfernen? Die Projektdateien bleiben unverändert.`, `Remove “${currentProject.name}” from Code Deck? The project files will remain unchanged.`))) {
      onDelete(currentProject.id);
      onClose();
    }
  }

  return (
    <Modal open={Boolean(project)} onClose={onClose} size="fullscreen">
      <div className="project-detail">
        <header className="project-detail__hero">
          <div className="project-detail__identity">
            <div className={`project-icon project-icon--large ${project.favorite ? "project-icon--favorite" : ""}`}>
              <Icon name={project.favorite ? "star" : "code"} />
            </div>
            <div>
              <div className="project-detail__title-row">
                <h2 className="project-name selectable-text">{project.name}</h2>
                {project.archived && <span className="badge badge--warning">{t("Archiviert", "Archived")}</span>}
              </div>
              <p>{project.path}</p>
              <div className="badge-row">
                {technologies.slice(0, 8).map((technology) => (
                  <span className={`badge badge--${technology.kind}`} key={`${technology.kind}:${technology.label}`}><i aria-hidden="true" />{technology.label}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="project-detail__quick-actions">
            <button className="button button--primary" type="button" onClick={() => onOpenEditor(project)} disabled={!preferredEditor}>
              <Icon name="external" />
              {preferredEditor ? t(`In ${preferredEditor.name} öffnen`, `Open in ${preferredEditor.name}`) : t("IDE wählen", "Choose IDE")}
            </button>
            <button className="button button--secondary" type="button" onClick={() => onBuildProject(project)} disabled={!project.buildCommand}>
              <Icon name="box" />Build
            </button>
            <button className="button button--secondary" type="button" onClick={() => onRunProject(project)} disabled={!project.runCommand}>
              <Icon name="play" />Run
            </button>
            <button className="button button--secondary" type="button" onClick={() => onOpenTodos(project)}>
              <Icon name="list" />{t("Todos", "Todos")}{project.todos.filter((todo) => todo.status !== "done").length > 0 && <span className="button-count">{project.todos.filter((todo) => todo.status !== "done").length}</span>}
            </button>
            <button className="button button--secondary" type="button" onClick={() => onOpenTerminal(project)}>
              <Icon name="terminal" />Terminal
            </button>
            <button className="button button--secondary" type="button" onClick={() => onOpenFileManager(project)}>
              <Icon name="folder" />{t("Ordner", "Folder")}
            </button>
            <button className="icon-button" type="button" onClick={onClose} aria-label={t("Schließen", "Close")}><Icon name="x" /></button>
          </div>
        </header>

        <nav className="tab-list" aria-label={t("Projektdetails", "Project details")}>
          <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")} type="button">{t("Übersicht", "Overview")}</button>
          <button className={tab === "commands" ? "active" : ""} onClick={() => setTab("commands")} type="button">{t("Commands", "Commands")} <span>{project.commands.length}</span></button>
          <button className={tab === "git" ? "active" : ""} onClick={() => setTab("git")} type="button">{t("GitHub", "GitHub")}</button>
          <button className={tab === "edit" ? "active" : ""} onClick={() => setTab("edit")} type="button">{t("Bearbeiten", "Edit")}</button>
        </nav>

        <div className="project-detail__content">
          {tab === "overview" && (
            <div className="detail-grid">
              <section className="panel panel--wide">
                <div className="panel__header">
                  <div><p className="eyebrow">{t("Projektstatus", "Project status")}</p><h3>{t("Erkannte Umgebung", "Detected environment")}</h3></div>
                  <button className="button button--ghost button--small" type="button" onClick={refresh} disabled={refreshing}>
                    <Icon name="refresh" />{refreshing ? t("Analysiere…", "Inspecting…") : t("Aktualisieren", "Refresh")}
                  </button>
                </div>
                <div className="stat-grid">
                  <div className="stat"><span>{t("Sprachen", "Languages")}</span><strong>{detectedLanguages.join(", ") || t("Nicht erkannt", "Not detected")}</strong></div>
                  <div className="stat"><span>{t("Frameworks", "Frameworks")}</span><strong>{detectedFrameworks.join(", ") || t("Keine", "None")}</strong></div>
                  <div className="stat"><span>{t("Tools & Laufzeiten", "Tools & runtimes")}</span><strong>{detectedTools.join(", ") || t("Nicht erkannt", "Not detected")}</strong></div>
                  <div className="stat"><span>Git</span><strong>{inspection?.isGit ? inspection.branch || "Repository" : t("Kein Repository", "No repository")}</strong></div>
                </div>
                {project.description && <p className="detail-description">{project.description}</p>}
              </section>

              <section className="panel">
                <div className="panel__header"><div><p className="eyebrow">{t("Schnellstart", "Quick start")}</p><h3>{t("Projekt-Commands", "Project commands")}</h3></div></div>
                {project.commands.length ? (
                  <div className="quick-command-list">
                    {project.commands.slice(0, 5).map((command) => (
                      <button type="button" key={command.id} onClick={() => onRunCommand(project, command)}>
                        <Icon name="play" />
                        <span><b>{command.label}</b><code>{command.command}</code></span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state empty-state--compact"><Icon name="command" /><p>{t("Noch keine Commands angelegt.", "No commands saved yet.")}</p><button className="text-button" type="button" onClick={() => setTab("commands")}>{t("Command hinzufügen", "Add command")}</button></div>
                )}
              </section>

              <section className="panel">
                <div className="panel__header"><div><p className="eyebrow">Scripts</p><h3>package.json</h3></div></div>
                {inspection?.scripts.length ? (
                  <div className="script-list">
                    {inspection.scripts.map((script) => {
                      const exists = project.commands.some((entry) => entry.command === script.command);
                      return (
                        <div className="script-list__row" key={script.name}>
                          <span className="script-list__content"><strong>{script.name}</strong><code>{script.command}</code></span>
                          <button className="button button--ghost button--small" type="button" onClick={() => addDetectedScript(script.name, script.command)} disabled={exists} title={exists ? t("Bereits als Command gespeichert", "Already saved as a command") : t("Dieses Script als Schnellaktion speichern", "Save this script as a quick action")}>
                            <Icon name={exists ? "check" : "plus"} /><span>{exists ? t("Gespeichert", "Saved") : t("Speichern", "Save")}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : <div className="empty-state empty-state--compact"><Icon name="file" /><p>{t("Keine package.json-Scripts erkannt.", "No package.json scripts detected.")}</p></div>}
              </section>
            </div>
          )}

          {tab === "commands" && (
            <div className="commands-layout">
              <form className="panel panel--wide runtime-panel" onSubmit={saveRuntimeSettings}>
                <div className="panel__header">
                  <div><p className="eyebrow">Build & Run</p><h3>{t("Projekt starten und bauen", "Run and build project")}</h3></div>
                  <div className="button-row">
                    {project.devPort && <button className="button button--ghost button--small" type="button" onClick={() => onOpenProjectUrl(project)}><Icon name="external" />localhost:{project.devPort}</button>}
                    <button className="button button--secondary button--small" type="button" onClick={() => onBuildProject(project)} disabled={!project.buildCommand}><Icon name="box" />Build</button>
                    <button className="button button--primary button--small" type="button" onClick={() => onRunProject(project)} disabled={!project.runCommand}><Icon name="play" />Run</button>
                  </div>
                </div>
                <div className="form-grid runtime-form-grid">
                  <div className="form-field"><label htmlFor="runtime-build-command">{t("Build-Command", "Build command")}</label><input id="runtime-build-command" value={runtimeDraft.buildCommand} onChange={(event) => setRuntimeDraft({ ...runtimeDraft, buildCommand: event.target.value })} placeholder="pnpm build" /></div>
                  <div className="form-field"><label htmlFor="runtime-run-command">{t("Run-Command", "Run command")}</label><input id="runtime-run-command" value={runtimeDraft.runCommand} onChange={(event) => setRuntimeDraft({ ...runtimeDraft, runCommand: event.target.value })} placeholder="pnpm dev -- --port {port}" /><small>{t("Nutze optional {port}. Zusätzlich setzt Code Deck PORT, SERVER_PORT und VITE_PORT.", "Optionally use {port}. Code Deck also sets PORT, SERVER_PORT and VITE_PORT.")}</small></div>
                  <div className="form-field"><label htmlFor="runtime-port">{t("Entwicklungs-Port", "Development port")}</label><input id="runtime-port" inputMode="numeric" value={runtimeDraft.devPort} onChange={(event) => setRuntimeDraft({ ...runtimeDraft, devPort: event.target.value.replace(/\D/g, "") })} placeholder="5173" /></div>
                </div>
                <div className="form-actions"><button className="button button--secondary" type="submit"><Icon name="check" />{t("Run-Konfiguration speichern", "Save run configuration")}</button></div>
              </form>
              <section className="panel panel--wide">
                <div className="panel__header"><div><p className="eyebrow">Command Runner</p><h3>{t("Gespeicherte Commands", "Saved commands")}</h3></div></div>
                {project.commands.length ? (
                  <div className="command-table">
                    {project.commands.map((command) => (
                      <article key={command.id}>
                        <div className="command-table__icon"><Icon name="terminal" /></div>
                        <div className="command-table__content"><strong>{command.label}</strong><code>{command.command}</code>{command.imported && !command.trusted && <span className="badge badge--warning">{t("Importiert · Bestätigung nötig", "Imported · confirmation required")}</span>}</div>
                        <div className="command-table__actions">
                          <button className="button button--primary button--small" type="button" onClick={() => onRunCommand(project, command)}><Icon name="play" />{t("Starten", "Run")}</button>
                          <button className="button button--ghost button--small" type="button" onClick={() => editCommand(command)}><Icon name="edit" />{t("Bearbeiten", "Edit")}</button>
                          <button className="button button--ghost button--small button--danger-text" type="button" onClick={() => onUpdate({ ...project, commands: project.commands.filter((entry) => entry.id !== command.id), updatedAt: new Date().toISOString() })}><Icon name="trash" />{t("Entfernen", "Remove")}</button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : <div className="empty-state"><Icon name="terminal" /><h3>{t("Noch keine Commands", "No commands yet")}</h3><p>{t("Lege wiederkehrende Befehle wie Dev-Server, Tests oder Builds an.", "Add recurring commands such as dev servers, tests or builds.")}</p></div>}
              </section>
              <form className="panel command-form" onSubmit={saveCommand}>
                <div className="panel__header"><div><p className="eyebrow">{editingCommandId ? t("Bearbeiten", "Edit") : t("Neu", "New")}</p><h3>{editingCommandId ? t("Command ändern", "Edit command") : t("Command hinzufügen", "Add command")}</h3></div></div>
                <div className="form-field"><label htmlFor="command-label">{t("Name", "Name")}</label><input id="command-label" value={commandLabel} onChange={(event) => setCommandLabel(event.target.value)} placeholder="Dev Server" /></div>
                <div className="form-field"><label htmlFor="command-value">{t("Befehl", "Command")}</label><textarea id="command-value" value={commandValue} onChange={(event) => setCommandValue(event.target.value)} placeholder="pnpm dev" rows={4} /></div>
                <div className="notice"><Icon name="info" /><p>{t("Commands laufen erst nach einem Klick und immer im Projektordner. stdout und stderr findest du über die Anzeige für aktive Commands im Kopfbereich.", "Commands only run after a click and always inside the project folder. Use the active-command indicator in the header to view stdout and stderr.")}</p></div>
                <div className="form-actions">
                  {editingCommandId && <button className="button button--ghost" type="button" onClick={() => { setEditingCommandId(undefined); setCommandLabel(""); setCommandValue(""); }}>{t("Abbrechen", "Cancel")}</button>}
                  <button className="button button--primary" type="submit"><Icon name={editingCommandId ? "check" : "plus"} />{editingCommandId ? t("Änderungen speichern", "Save changes") : t("Command hinzufügen", "Add command")}</button>
                </div>
              </form>
            </div>
          )}

          {tab === "git" && (
            <GitHubProjectPanel
              project={project}
              token={githubToken}
              onOpenGitHubSettings={onOpenGitHubSettings}
              onRefreshInspection={() => onRefreshInspection(project)}
              onSuccess={onSuccess}
              onError={onError}
            />
          )}

          {tab === "edit" && (
            <form className="panel edit-project-form" onSubmit={saveProject}>
              <div className="panel__header"><div><p className="eyebrow">{t("Metadaten", "Metadata")}</p><h3>{t("Projekt bearbeiten", "Edit project")}</h3></div></div>
              <div className="form-grid form-grid--2">
                <div className="form-field"><label htmlFor="edit-name">{t("Name", "Name")}</label><input id="edit-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></div>
                <div className="form-field"><label htmlFor="edit-editor">{t("Bevorzugte IDE", "Preferred IDE")}</label><select id="edit-editor" value={draft.preferredEditorId ?? ""} onChange={(event) => setDraft({ ...draft, preferredEditorId: event.target.value || undefined })}><option value="">{t("Keine IDE", "No IDE")}</option>{editors.filter((editor) => editor.enabled).map((editor) => <option value={editor.id} key={editor.id}>{editor.name}</option>)}</select></div>
              </div>
              <div className="form-field"><label htmlFor="edit-path">{t("Projektpfad", "Project path")}</label><input id="edit-path" value={draft.path} onChange={(event) => setDraft({ ...draft, path: event.target.value })} /></div>
              <div className="form-field"><label htmlFor="edit-description">{t("Beschreibung", "Description")}</label><textarea id="edit-description" rows={4} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></div>
              <div className="form-grid form-grid--2">
                <label className="checkbox-row"><input type="checkbox" checked={draft.favorite} onChange={(event) => setDraft({ ...draft, favorite: event.target.checked })} /><span><strong>{t("Favorit", "Favorite")}</strong><small>{t("Oben in der Projektliste anzeigen.", "Show near the top of the project list.")}</small></span></label>
                <label className="checkbox-row"><input type="checkbox" checked={draft.archived} onChange={(event) => setDraft({ ...draft, archived: event.target.checked })} /><span><strong>{t("Archiviert", "Archived")}</strong><small>{t("Aus der normalen Ansicht ausblenden.", "Hide from the normal view.")}</small></span></label>
              </div>
              <div className="form-actions form-actions--space-between"><button className="button button--danger" type="button" onClick={confirmDelete}><Icon name="trash" />{t("Aus Code Deck entfernen", "Remove from Code Deck")}</button><button className="button button--primary" type="submit"><Icon name="check" />{t("Änderungen speichern", "Save changes")}</button></div>
            </form>
          )}
        </div>
      </div>
    </Modal>
  );
}
