import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../shared/components/Icon";
import { Modal } from "../../shared/components/Modal";
import { createId } from "../../shared/lib/storage";
import type {
  Editor,
  Project,
  Workspace,
  WorkspaceAction,
  WorkspaceActionType,
} from "../../shared/types/models";

type WorkspacesPanelProps = {
  open: boolean;
  workspaces: Workspace[];
  projects: Project[];
  editors: Editor[];
  onClose: () => void;
  onChange: (workspaces: Workspace[]) => void;
  onStart: (workspace: Workspace) => void;
  onStop: (workspace: Workspace) => void;
  onError: (message: string) => void;
};

const actionLabels: Record<WorkspaceActionType, string> = {
  openEditor: "Projekt in IDE öffnen",
  openTerminal: "Terminal öffnen",
  openFileManager: "Dateimanager öffnen",
  runCommand: "Command starten",
  openUrl: "URL öffnen",
};

function actionIcon(type: WorkspaceActionType) {
  if (type === "openEditor") return "code" as const;
  if (type === "openTerminal" || type === "runCommand") return "terminal" as const;
  if (type === "openFileManager") return "folder" as const;
  return "external" as const;
}

export function WorkspacesPanel({
  open,
  workspaces,
  projects,
  editors,
  onClose,
  onChange,
  onStart,
  onStop,
  onError,
}: WorkspacesPanelProps) {
  const [selectedId, setSelectedId] = useState<string>();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [actionType, setActionType] = useState<WorkspaceActionType>("openEditor");
  const [actionProjectId, setActionProjectId] = useState("");
  const [actionCommandId, setActionCommandId] = useState("");
  const [actionCommand, setActionCommand] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [actionEditorId, setActionEditorId] = useState("");
  const [actionRunMode, setActionRunMode] = useState<"parallel" | "sequence">("parallel");

  const selected = workspaces.find((workspace) => workspace.id === selectedId);
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const selectedProject = projectById.get(actionProjectId);

  useEffect(() => {
    if (!open) return;
    setSelectedId((current) =>
      current && workspaces.some((workspace) => workspace.id === current)
        ? current
        : workspaces[0]?.id,
    );
  }, [open, workspaces]);

  useEffect(() => {
    if (!selected) {
      setName("");
      setDescription("");
      setTags("");
      return;
    }
    setName(selected.name);
    setDescription(selected.description);
    setTags(selected.tags.join(", "));
  }, [selected]);

  function createWorkspace() {
    const now = new Date().toISOString();
    const workspace: Workspace = {
      id: createId(),
      name: "Neuer Workspace",
      description: "",
      tags: [],
      actions: [],
      createdAt: now,
      updatedAt: now,
    };
    onChange([...workspaces, workspace]);
    setSelectedId(workspace.id);
  }

  function saveMeta(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !name.trim()) return;
    onChange(workspaces.map((workspace) => workspace.id === selected.id ? {
      ...workspace,
      name: name.trim(),
      description: description.trim(),
      tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      updatedAt: new Date().toISOString(),
    } : workspace));
  }

  function addAction(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    if (actionType !== "openUrl" && !actionProjectId) {
      onError("Bitte wähle ein Projekt für die Aktion aus.");
      return;
    }
    if (actionType === "openUrl" && !actionUrl.trim()) {
      onError("Bitte gib eine URL ein.");
      return;
    }
    if (actionType === "runCommand" && !actionCommandId && !actionCommand.trim()) {
      onError("Bitte wähle einen gespeicherten Command oder gib einen Befehl ein.");
      return;
    }
    const action: WorkspaceAction = {
      id: createId(),
      type: actionType,
      projectId: actionProjectId || undefined,
      commandId: actionCommandId || undefined,
      command: actionCommand.trim() || undefined,
      url: actionUrl.trim() || undefined,
      editorId: actionEditorId || undefined,
      runMode: actionRunMode,
      order: selected.actions.length,
    };
    onChange(workspaces.map((workspace) => workspace.id === selected.id ? {
      ...workspace,
      actions: [...workspace.actions, action],
      updatedAt: new Date().toISOString(),
    } : workspace));
    setActionCommand("");
    setActionCommandId("");
    setActionUrl("");
  }

  function removeAction(actionId: string) {
    if (!selected) return;
    onChange(workspaces.map((workspace) => workspace.id === selected.id ? {
      ...workspace,
      actions: workspace.actions.filter((action) => action.id !== actionId).map((action, index) => ({ ...action, order: index })),
      updatedAt: new Date().toISOString(),
    } : workspace));
  }

  function moveAction(actionId: string, direction: -1 | 1) {
    if (!selected) return;
    const actions = [...selected.actions].sort((a, b) => a.order - b.order);
    const index = actions.findIndex((action) => action.id === actionId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= actions.length) return;
    [actions[index], actions[target]] = [actions[target], actions[index]];
    onChange(workspaces.map((workspace) => workspace.id === selected.id ? {
      ...workspace,
      actions: actions.map((action, order) => ({ ...action, order })),
      updatedAt: new Date().toISOString(),
    } : workspace));
  }

  function deleteWorkspace() {
    if (!selected) return;
    if (!window.confirm(`Workspace „${selected.name}“ wirklich löschen?`)) return;
    const next = workspaces.filter((workspace) => workspace.id !== selected.id);
    onChange(next);
    setSelectedId(next[0]?.id);
  }

  function describeAction(action: WorkspaceAction) {
    if (action.type === "openUrl") return action.url || "URL";
    const project = action.projectId ? projectById.get(action.projectId) : undefined;
    if (action.type === "runCommand") {
      const command = project?.commands.find((entry) => entry.id === action.commandId);
      return `${project?.name ?? "Projekt"} · ${command?.label ?? action.command ?? "Command"}`;
    }
    if (action.type === "openEditor") {
      const editor = editors.find((entry) => entry.id === action.editorId);
      return `${project?.name ?? "Projekt"}${editor ? ` · ${editor.name}` : ""}`;
    }
    return project?.name ?? "Projekt";
  }

  return (
    <Modal open={open} onClose={onClose} title="Workspaces" eyebrow="Mehrere Projekte, ein Start" size="large">
      <div className="workspace-layout">
        <aside className="workspace-sidebar">
          <button className="button button--primary button--full" type="button" onClick={createWorkspace}><Icon name="plus" />Workspace erstellen</button>
          <div className="workspace-list">
            {workspaces.map((workspace) => (
              <button type="button" key={workspace.id} className={workspace.id === selectedId ? "active" : ""} onClick={() => setSelectedId(workspace.id)}>
                <span className="workspace-list__icon"><Icon name="layers" /></span>
                <span><strong>{workspace.name}</strong><small>{workspace.actions.length} Aktionen</small></span>
              </button>
            ))}
          </div>
          {workspaces.length === 0 && <div className="empty-state empty-state--compact"><Icon name="layers" /><p>Noch keine Workspaces.</p></div>}
        </aside>

        {selected ? (
          <div className="workspace-content">
            <form className="workspace-meta" onSubmit={saveMeta}>
              <div className="form-grid form-grid--2">
                <div className="form-field"><label htmlFor="workspace-name">Name</label><input id="workspace-name" value={name} onChange={(event) => setName(event.target.value)} /></div>
                <div className="form-field"><label htmlFor="workspace-tags">Tags</label><input id="workspace-tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="fullstack, kunde-a" /></div>
              </div>
              <div className="form-field"><label htmlFor="workspace-description">Beschreibung</label><textarea id="workspace-description" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} /></div>
              <div className="form-actions form-actions--space-between"><button className="button button--danger button--small" type="button" onClick={deleteWorkspace}><Icon name="trash" />Löschen</button><button className="button button--secondary button--small" type="submit"><Icon name="check" />Metadaten speichern</button></div>
            </form>

            <section className="panel workspace-actions-panel">
              <div className="panel__header">
                <div><p className="eyebrow">Startablauf</p><h3>Aktionen</h3></div>
                <div className="button-row"><button className="button button--ghost button--small" type="button" onClick={() => onStop(selected)}><Icon name="square" />Alle stoppen</button><button className="button button--primary button--small" type="button" onClick={() => onStart(selected)} disabled={!selected.actions.length}><Icon name="play" />Workspace starten</button></div>
              </div>
              {selected.actions.length ? (
                <div className="workspace-action-list">
                  {[...selected.actions].sort((a, b) => a.order - b.order).map((action, index) => (
                    <article key={action.id}>
                      <span className="workspace-action-list__order">{index + 1}</span>
                      <span className="workspace-action-list__icon"><Icon name={actionIcon(action.type)} /></span>
                      <div><strong>{actionLabels[action.type]}</strong><small>{describeAction(action)}</small></div>
                      <span className="badge badge--muted">{action.runMode === "sequence" ? "Nacheinander" : "Parallel"}</span>
                      <button className="icon-button icon-button--small" type="button" title="Aktion nach oben verschieben" aria-label="Aktion nach oben verschieben" onClick={() => moveAction(action.id, -1)} disabled={index === 0}>↑</button>
                      <button className="icon-button icon-button--small" type="button" title="Aktion nach unten verschieben" aria-label="Aktion nach unten verschieben" onClick={() => moveAction(action.id, 1)} disabled={index === selected.actions.length - 1}>↓</button>
                      <button className="icon-button icon-button--small icon-button--danger" type="button" title="Aktion entfernen" aria-label="Aktion entfernen" onClick={() => removeAction(action.id)}><Icon name="trash" /></button>
                    </article>
                  ))}
                </div>
              ) : <div className="empty-state empty-state--compact"><Icon name="layers" /><p>Füge die ersten Aktionen für diesen Workspace hinzu.</p></div>}
            </section>

            <form className="panel workspace-action-form" onSubmit={addAction}>
              <div className="panel__header"><div><p className="eyebrow">Neue Aktion</p><h3>Schritt hinzufügen</h3></div></div>
              <div className="form-grid form-grid--3">
                <div className="form-field"><label htmlFor="action-type">Typ</label><select id="action-type" value={actionType} onChange={(event) => setActionType(event.target.value as WorkspaceActionType)}>{Object.entries(actionLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
                {actionType !== "openUrl" && <div className="form-field"><label htmlFor="action-project">Projekt</label><select id="action-project" value={actionProjectId} onChange={(event) => { setActionProjectId(event.target.value); setActionCommandId(""); }}><option value="">Projekt wählen</option>{projects.filter((project) => !project.archived).map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></div>}
                <div className="form-field"><label htmlFor="action-mode">Startmodus</label><select id="action-mode" value={actionRunMode} onChange={(event) => setActionRunMode(event.target.value as "parallel" | "sequence")}><option value="parallel">Parallel</option><option value="sequence">Nacheinander</option></select></div>
              </div>
              {actionType === "runCommand" && <div className="form-grid form-grid--2"><div className="form-field"><label htmlFor="action-command-id">Gespeicherter Command</label><select id="action-command-id" value={actionCommandId} onChange={(event) => setActionCommandId(event.target.value)}><option value="">Eigener Befehl</option>{selectedProject?.commands.map((command) => <option value={command.id} key={command.id}>{command.label}</option>)}</select></div><div className="form-field"><label htmlFor="action-command">Eigener Befehl</label><input id="action-command" value={actionCommand} onChange={(event) => setActionCommand(event.target.value)} disabled={Boolean(actionCommandId)} placeholder="pnpm dev" /></div></div>}
              {actionType === "openUrl" && <div className="form-field"><label htmlFor="action-url">URL</label><input id="action-url" value={actionUrl} onChange={(event) => setActionUrl(event.target.value)} placeholder="http://localhost:3000" /></div>}
              {actionType === "openEditor" && <div className="form-field"><label htmlFor="action-editor">Alternative IDE (optional)</label><select id="action-editor" value={actionEditorId} onChange={(event) => setActionEditorId(event.target.value)}><option value="">Projektstandard</option>{editors.filter((editor) => editor.enabled).map((editor) => <option value={editor.id} key={editor.id}>{editor.name}</option>)}</select></div>}
              <div className="form-actions"><button className="button button--primary" type="submit"><Icon name="plus" />Aktion hinzufügen</button></div>
            </form>
          </div>
        ) : (
          <div className="empty-state workspace-empty"><Icon name="layers" /><h3>Workspace erstellen</h3><p>Gruppiere Frontend, Backend, Docker und URLs zu einem gemeinsamen Startablauf.</p><button className="button button--primary" type="button" onClick={createWorkspace}><Icon name="plus" />Ersten Workspace erstellen</button></div>
        )}
      </div>
    </Modal>
  );
}
