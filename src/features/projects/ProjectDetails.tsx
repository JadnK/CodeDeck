import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../shared/components/Icon";
import { Modal } from "../../shared/components/Modal";
import { useI18n } from "../../shared/i18n/I18n";
import { createId } from "../../shared/lib/storage";
import { getDetectedTechnologies } from "../../shared/lib/projectInspection";
import type {
  Editor,
  ProcessRun,
  Project,
  ProjectCommand,
  ProjectInspection,
} from "../../shared/types/models";

type ProjectDetailsProps = {
  project?: Project;
  editors: Editor[];
  processHistory: ProcessRun[];
  onClose: () => void;
  onUpdate: (project: Project) => void;
  onDelete: (projectId: string) => void;
  onOpenEditor: (project: Project, editorId?: string) => void;
  onOpenTodos: (project: Project) => void;
  onOpenTerminal: (project: Project) => void;
  onOpenFileManager: (project: Project) => void;
  onRunCommand: (project: Project, command: ProjectCommand, workspaceId?: string) => void;
  onRunRawCommand: (project: Project, label: string, command: string) => void;
  onRefreshInspection: (project: Project) => Promise<ProjectInspection | undefined>;
  onError: (message: string) => void;
};

type Tab = "overview" | "commands" | "git" | "edit";


export function ProjectDetails({
  project,
  editors,
  processHistory,
  onClose,
  onUpdate,
  onDelete,
  onOpenEditor,
  onOpenTodos,
  onOpenTerminal,
  onOpenFileManager,
  onRunCommand,
  onRunRawCommand,
  onRefreshInspection,
  onError,
}: ProjectDetailsProps) {
  const { t, locale } = useI18n();
  const formatDate = (value?: string) => {
    if (!value) return "–";
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  };
  const statusLabel = (status: ProcessRun["status"]) => ({
    starting: t("Startet", "Starting"),
    running: t("Läuft", "Running"),
    success: t("Erfolgreich", "Successful"),
    failed: t("Fehlgeschlagen", "Failed"),
    stopping: t("Wird beendet", "Stopping"),
    stopped: t("Beendet", "Stopped"),
  })[status];
  const [tab, setTab] = useState<Tab>("overview");
  const [commandLabel, setCommandLabel] = useState("");
  const [commandValue, setCommandValue] = useState("");
  const [editingCommandId, setEditingCommandId] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState<Project>();

  useEffect(() => {
    setTab("overview");
    setCommandLabel("");
    setCommandValue("");
    setEditingCommandId(undefined);
  }, [project?.id]);

  useEffect(() => {
    setDraft(project ? structuredClone(project) : undefined);
  }, [project]);

  const runs = useMemo(
    () => processHistory.filter((run) => run.projectId === project?.id).slice(0, 15),
    [processHistory, project?.id],
  );

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
          <button className={tab === "git" ? "active" : ""} onClick={() => setTab("git")} type="button">{t("Git & Historie", "Git & history")}</button>
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
            <div className="detail-grid">
              <section className="panel">
                <div className="panel__header"><div><p className="eyebrow">Git</p><h3>{t("Repository-Status", "Repository status")}</h3></div><button className="button button--ghost button--small" type="button" onClick={refresh}><Icon name="refresh" />{t("Status aktualisieren", "Refresh status")}</button></div>
                {inspection?.isGit ? (
                  <div className="git-status">
                    <div><span>Branch</span><strong>{inspection.branch || "–"}</strong></div>
                    <div><span>{t("Geänderte Dateien", "Changed files")}</span><strong className={inspection.changedFiles ? "status-warning" : "status-good"}>{inspection.changedFiles}</strong></div>
                    <div><span>{t("Letzter Commit", "Latest commit")}</span><strong>{inspection.lastCommit?.message || "–"}</strong><small>{inspection.lastCommit ? `${inspection.lastCommit.hash} · ${inspection.lastCommit.date}` : ""}</small></div>
                    <div className="button-row"><button className="button button--secondary" type="button" onClick={() => onRunRawCommand(project, "Git Fetch", "git fetch --prune")}><Icon name="download" />Fetch</button><button className="button button--secondary" type="button" onClick={() => onRunRawCommand(project, "Git Pull", "git pull")}><Icon name="refresh" />Pull</button></div>
                  </div>
                ) : <div className="empty-state"><Icon name="git" /><h3>{t("Kein Git-Repository erkannt", "No Git repository detected")}</h3><p>{t("Der Ordner enthält kein .git-Verzeichnis oder Git ist nicht verfügbar.", "The folder does not contain a .git directory or Git is unavailable.")}</p></div>}
              </section>
              <section className="panel panel--wide">
                <div className="panel__header"><div><p className="eyebrow">{t("Historie", "History")}</p><h3>{t("Letzte Ausführungen", "Recent runs")}</h3></div></div>
                {runs.length ? (
                  <div className="history-list">
                    {runs.map((run) => (
                      <article key={run.id}>
                        <span className={`process-dot process-dot--${run.status}`} />
                        <div><strong>{run.label}</strong><code>{run.command}</code></div>
                        <span>{formatDate(run.startedAt)}</span>
                        <b>{statusLabel(run.status)}</b>
                      </article>
                    ))}
                  </div>
                ) : <div className="empty-state"><Icon name="history" /><h3>{t("Noch keine Ausführungen", "No runs yet")}</h3><p>{t("Gestartete Commands werden hier lokal protokolliert.", "Started commands are logged locally here.")}</p></div>}
              </section>
            </div>
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
