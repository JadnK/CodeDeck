import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../shared/components/Icon";
import { Modal } from "../../shared/components/Modal";
import { createId } from "../../shared/lib/storage";
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
  onOpenTerminal: (project: Project) => void;
  onOpenFileManager: (project: Project) => void;
  onRunCommand: (project: Project, command: ProjectCommand, workspaceId?: string) => void;
  onRunRawCommand: (project: Project, label: string, command: string) => void;
  onRefreshInspection: (project: Project) => Promise<ProjectInspection | undefined>;
  onError: (message: string) => void;
};

type Tab = "overview" | "commands" | "git" | "edit";

function formatDate(value?: string) {
  if (!value) return "–";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function ProjectDetails({
  project,
  editors,
  processHistory,
  onClose,
  onUpdate,
  onDelete,
  onOpenEditor,
  onOpenTerminal,
  onOpenFileManager,
  onRunCommand,
  onRunRawCommand,
  onRefreshInspection,
  onError,
}: ProjectDetailsProps) {
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

  function saveCommand(event: React.FormEvent) {
    event.preventDefault();
    if (!commandLabel.trim() || !commandValue.trim()) {
      onError("Command-Name und Befehl dürfen nicht leer sein.");
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
      onError("Name und Projektpfad dürfen nicht leer sein.");
      return;
    }
    onUpdate({ ...currentDraft, updatedAt: new Date().toISOString() });
  }

  function confirmDelete() {
    if (window.confirm(`„${currentProject.name}“ wirklich aus Code Deck entfernen? Die Projektdateien bleiben unverändert.`)) {
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
                <h2>{project.name}</h2>
                {project.archived && <span className="badge badge--warning">Archiviert</span>}
              </div>
              <p>{project.path}</p>
              <div className="badge-row">
                {[...(inspection?.frameworks ?? []), ...project.tags].slice(0, 8).map((tag) => (
                  <span className="badge" key={tag}>{tag}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="project-detail__quick-actions">
            <button className="button button--primary" type="button" onClick={() => onOpenEditor(project)} disabled={!preferredEditor}>
              <Icon name="external" />
              {preferredEditor ? `In ${preferredEditor.name} öffnen` : "IDE wählen"}
            </button>
            <button className="button button--secondary" type="button" onClick={() => onOpenTerminal(project)}>
              <Icon name="terminal" />Terminal
            </button>
            <button className="button button--secondary" type="button" onClick={() => onOpenFileManager(project)}>
              <Icon name="folder" />Ordner
            </button>
            <button className="icon-button" type="button" onClick={onClose} aria-label="Schließen"><Icon name="x" /></button>
          </div>
        </header>

        <nav className="tab-list" aria-label="Projektdetails">
          <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")} type="button">Übersicht</button>
          <button className={tab === "commands" ? "active" : ""} onClick={() => setTab("commands")} type="button">Commands <span>{project.commands.length}</span></button>
          <button className={tab === "git" ? "active" : ""} onClick={() => setTab("git")} type="button">Git & Historie</button>
          <button className={tab === "edit" ? "active" : ""} onClick={() => setTab("edit")} type="button">Bearbeiten</button>
        </nav>

        <div className="project-detail__content">
          {tab === "overview" && (
            <div className="detail-grid">
              <section className="panel panel--wide">
                <div className="panel__header">
                  <div><p className="eyebrow">Projektstatus</p><h3>Erkannte Umgebung</h3></div>
                  <button className="button button--ghost button--small" type="button" onClick={refresh} disabled={refreshing}>
                    <Icon name="refresh" />{refreshing ? "Analysiere…" : "Aktualisieren"}
                  </button>
                </div>
                <div className="stat-grid">
                  <div className="stat"><span>Frameworks</span><strong>{inspection?.frameworks.join(", ") || "Nicht erkannt"}</strong></div>
                  <div className="stat"><span>Paketmanager</span><strong>{inspection?.packageManager || "–"}</strong></div>
                  <div className="stat"><span>Git</span><strong>{inspection?.isGit ? inspection.branch || "Repository" : "Kein Repository"}</strong></div>
                  <div className="stat"><span>Docker</span><strong>{inspection?.hasDocker ? "Vorhanden" : "Nicht erkannt"}</strong></div>
                </div>
                {project.description && <p className="detail-description">{project.description}</p>}
              </section>

              <section className="panel">
                <div className="panel__header"><div><p className="eyebrow">Schnellstart</p><h3>Projekt-Commands</h3></div></div>
                {project.commands.length ? (
                  <div className="quick-command-list">
                    {project.commands.slice(0, 5).map((command) => (
                      <button type="button" key={command.id} onClick={() => onRunCommand(project, command)}>
                        <span><Icon name="play" /><b>{command.label}</b></span>
                        <code>{command.command}</code>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state empty-state--compact"><Icon name="command" /><p>Noch keine Commands angelegt.</p><button className="text-button" type="button" onClick={() => setTab("commands")}>Command hinzufügen</button></div>
                )}
              </section>

              <section className="panel">
                <div className="panel__header"><div><p className="eyebrow">Scripts</p><h3>package.json</h3></div></div>
                {inspection?.scripts.length ? (
                  <div className="script-list">
                    {inspection.scripts.slice(0, 8).map((script) => {
                      const exists = project.commands.some((entry) => entry.command === script.command);
                      return (
                        <div key={script.name}>
                          <span><strong>{script.name}</strong><code>{script.command}</code></span>
                          <button className="button button--ghost button--small" type="button" onClick={() => addDetectedScript(script.name, script.command)} disabled={exists} title={exists ? "Bereits als Command gespeichert" : "Dieses Script als Schnellaktion speichern"}>
                            <Icon name={exists ? "check" : "plus"} />{exists ? "Gespeichert" : "Als Command"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : <div className="empty-state empty-state--compact"><Icon name="file" /><p>Keine package.json-Scripts erkannt.</p></div>}
              </section>
            </div>
          )}

          {tab === "commands" && (
            <div className="commands-layout">
              <section className="panel panel--wide">
                <div className="panel__header"><div><p className="eyebrow">Command Runner</p><h3>Gespeicherte Commands</h3></div></div>
                {project.commands.length ? (
                  <div className="command-table">
                    {project.commands.map((command) => (
                      <article key={command.id}>
                        <div className="command-table__icon"><Icon name="terminal" /></div>
                        <div className="command-table__content"><strong>{command.label}</strong><code>{command.command}</code>{command.imported && !command.trusted && <span className="badge badge--warning">Importiert · Bestätigung nötig</span>}</div>
                        <div className="command-table__actions">
                          <button className="button button--primary button--small" type="button" onClick={() => onRunCommand(project, command)}><Icon name="play" />Starten</button>
                          <button className="button button--ghost button--small" type="button" onClick={() => editCommand(command)}><Icon name="edit" />Bearbeiten</button>
                          <button className="button button--ghost button--small button--danger-text" type="button" onClick={() => onUpdate({ ...project, commands: project.commands.filter((entry) => entry.id !== command.id), updatedAt: new Date().toISOString() })}><Icon name="trash" />Entfernen</button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : <div className="empty-state"><Icon name="terminal" /><h3>Noch keine Commands</h3><p>Lege wiederkehrende Befehle wie Dev-Server, Tests oder Builds an.</p></div>}
              </section>
              <form className="panel command-form" onSubmit={saveCommand}>
                <div className="panel__header"><div><p className="eyebrow">{editingCommandId ? "Bearbeiten" : "Neu"}</p><h3>{editingCommandId ? "Command ändern" : "Command hinzufügen"}</h3></div></div>
                <div className="form-field"><label htmlFor="command-label">Name</label><input id="command-label" value={commandLabel} onChange={(event) => setCommandLabel(event.target.value)} placeholder="Dev Server" /></div>
                <div className="form-field"><label htmlFor="command-value">Befehl</label><textarea id="command-value" value={commandValue} onChange={(event) => setCommandValue(event.target.value)} placeholder="pnpm dev" rows={4} /></div>
                <div className="notice"><Icon name="info" /><p>Commands laufen erst nach einem Klick und immer im Projektordner. stdout und stderr erscheinen unter Prozesse.</p></div>
                <div className="form-actions">
                  {editingCommandId && <button className="button button--ghost" type="button" onClick={() => { setEditingCommandId(undefined); setCommandLabel(""); setCommandValue(""); }}>Abbrechen</button>}
                  <button className="button button--primary" type="submit"><Icon name={editingCommandId ? "check" : "plus"} />{editingCommandId ? "Änderungen speichern" : "Command hinzufügen"}</button>
                </div>
              </form>
            </div>
          )}

          {tab === "git" && (
            <div className="detail-grid">
              <section className="panel">
                <div className="panel__header"><div><p className="eyebrow">Git</p><h3>Repository-Status</h3></div><button className="button button--ghost button--small" type="button" onClick={refresh}><Icon name="refresh" />Status aktualisieren</button></div>
                {inspection?.isGit ? (
                  <div className="git-status">
                    <div><span>Branch</span><strong>{inspection.branch || "–"}</strong></div>
                    <div><span>Geänderte Dateien</span><strong className={inspection.changedFiles ? "status-warning" : "status-good"}>{inspection.changedFiles}</strong></div>
                    <div><span>Letzter Commit</span><strong>{inspection.lastCommit?.message || "–"}</strong><small>{inspection.lastCommit ? `${inspection.lastCommit.hash} · ${inspection.lastCommit.date}` : ""}</small></div>
                    <div className="button-row"><button className="button button--secondary" type="button" onClick={() => onRunRawCommand(project, "Git Fetch", "git fetch --prune")}><Icon name="download" />Fetch</button><button className="button button--secondary" type="button" onClick={() => onRunRawCommand(project, "Git Pull", "git pull")}><Icon name="refresh" />Pull</button></div>
                  </div>
                ) : <div className="empty-state"><Icon name="git" /><h3>Kein Git-Repository erkannt</h3><p>Der Ordner enthält kein .git-Verzeichnis oder Git ist nicht verfügbar.</p></div>}
              </section>
              <section className="panel panel--wide">
                <div className="panel__header"><div><p className="eyebrow">Historie</p><h3>Letzte Ausführungen</h3></div></div>
                {runs.length ? (
                  <div className="history-list">
                    {runs.map((run) => (
                      <article key={run.id}>
                        <span className={`process-dot process-dot--${run.status}`} />
                        <div><strong>{run.label}</strong><code>{run.command}</code></div>
                        <span>{formatDate(run.startedAt)}</span>
                        <b>{run.status}</b>
                      </article>
                    ))}
                  </div>
                ) : <div className="empty-state"><Icon name="history" /><h3>Noch keine Ausführungen</h3><p>Gestartete Commands werden hier lokal protokolliert.</p></div>}
              </section>
            </div>
          )}

          {tab === "edit" && (
            <form className="panel edit-project-form" onSubmit={saveProject}>
              <div className="panel__header"><div><p className="eyebrow">Metadaten</p><h3>Projekt bearbeiten</h3></div></div>
              <div className="form-grid form-grid--2">
                <div className="form-field"><label htmlFor="edit-name">Name</label><input id="edit-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></div>
                <div className="form-field"><label htmlFor="edit-editor">Bevorzugte IDE</label><select id="edit-editor" value={draft.preferredEditorId ?? ""} onChange={(event) => setDraft({ ...draft, preferredEditorId: event.target.value || undefined })}><option value="">Keine IDE</option>{editors.filter((editor) => editor.enabled).map((editor) => <option value={editor.id} key={editor.id}>{editor.name}</option>)}</select></div>
              </div>
              <div className="form-field"><label htmlFor="edit-path">Projektpfad</label><input id="edit-path" value={draft.path} onChange={(event) => setDraft({ ...draft, path: event.target.value })} /></div>
              <div className="form-field"><label htmlFor="edit-description">Beschreibung</label><textarea id="edit-description" rows={4} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></div>
              <div className="form-field"><label htmlFor="edit-tags">Tags</label><input id="edit-tags" value={draft.tags.join(", ")} onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} /></div>
              <div className="form-grid form-grid--2">
                <label className="checkbox-row"><input type="checkbox" checked={draft.favorite} onChange={(event) => setDraft({ ...draft, favorite: event.target.checked })} /><span><strong>Favorit</strong><small>Oben in der Projektliste anzeigen.</small></span></label>
                <label className="checkbox-row"><input type="checkbox" checked={draft.archived} onChange={(event) => setDraft({ ...draft, archived: event.target.checked })} /><span><strong>Archiviert</strong><small>Aus der normalen Ansicht ausblenden.</small></span></label>
              </div>
              <div className="form-actions form-actions--space-between"><button className="button button--danger" type="button" onClick={confirmDelete}><Icon name="trash" />Aus Code Deck entfernen</button><button className="button button--primary" type="submit"><Icon name="check" />Änderungen speichern</button></div>
            </form>
          )}
        </div>
      </div>
    </Modal>
  );
}
