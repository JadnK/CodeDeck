import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../shared/components/Icon";
import { Modal } from "../../shared/components/Modal";
import { useI18n } from "../../shared/i18n/I18n";
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
  const { t } = useI18n();
  const actionLabels: Record<WorkspaceActionType, string> = {
    openEditor: t("IDE öffnen", "Open IDE"),
    openTerminal: t("Terminal öffnen", "Open terminal"),
    openFileManager: t("Projektordner öffnen", "Open project folder"),
    runCommand: t("Command starten", "Run command"),
    openUrl: t("URL öffnen", "Open URL"),
  };
  const [selectedId, setSelectedId] = useState<string>();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [actionType, setActionType] = useState<WorkspaceActionType>("openEditor");
  const [actionProjectId, setActionProjectId] = useState("");
  const [actionCommandId, setActionCommandId] = useState("");
  const [actionCommand, setActionCommand] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [actionEditorId, setActionEditorId] = useState("");
  const [actionRunMode, setActionRunMode] = useState<"parallel" | "sequence">("parallel");

  const selected = workspaces.find((workspace) => workspace.id === selectedId);
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const availableProjects = useMemo(() => projects.filter((project) => !project.archived), [projects]);
  const selectedProject = projectById.get(actionProjectId);
  const sortedActions = useMemo(
    () => selected ? [...selected.actions].sort((a, b) => a.order - b.order) : [],
    [selected],
  );

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
      return;
    }
    setName(selected.name);
    setDescription(selected.description);
  }, [selected]);

  useEffect(() => {
    if (actionProjectId && availableProjects.some((project) => project.id === actionProjectId)) return;
    setActionProjectId(availableProjects[0]?.id ?? "");
    setActionCommandId("");
  }, [actionProjectId, availableProjects]);

  function createWorkspace() {
    const now = new Date().toISOString();
    const workspace: Workspace = {
      id: createId(),
      name: t("Neues Startset", "New launch set"),
      description: "",
      autoStartOnAppLaunch: false,
      actions: [],
      createdAt: now,
      updatedAt: now,
    };
    onChange([...workspaces, workspace]);
    setSelectedId(workspace.id);
  }

  function saveMeta(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !name.trim()) {
      onError(t("Bitte gib dem Startset einen Namen.", "Give the launch set a name."));
      return;
    }
    onChange(workspaces.map((workspace) => workspace.id === selected.id ? {
      ...workspace,
      name: name.trim(),
      description: description.trim(),
      updatedAt: new Date().toISOString(),
    } : workspace));
  }

  function addAction(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    if (actionType !== "openUrl" && !actionProjectId) {
      onError(t("Bitte wähle ein Projekt für den Startschritt aus.", "Choose a project for the launch step."));
      return;
    }
    if (actionType === "openUrl" && !actionUrl.trim()) {
      onError(t("Bitte gib eine URL ein.", "Enter a URL."));
      return;
    }
    if (actionType === "runCommand" && !actionCommandId && !actionCommand.trim()) {
      onError(t("Bitte wähle einen gespeicherten Command oder gib einen Befehl ein.", "Choose a saved command or enter a custom command."));
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
    if (!window.confirm(t(`Startset „${selected.name}“ wirklich löschen?`, `Delete launch set “${selected.name}”?`))) return;
    const next = workspaces.filter((workspace) => workspace.id !== selected.id);
    onChange(next);
    setSelectedId(next[0]?.id);
  }

  function describeAction(action: WorkspaceAction) {
    if (action.type === "openUrl") return action.url || "URL";
    const project = action.projectId ? projectById.get(action.projectId) : undefined;
    if (action.type === "runCommand") {
      const command = project?.commands.find((entry) => entry.id === action.commandId);
      return `${project?.name ?? t("Projekt", "Project")} · ${command?.label ?? action.command ?? "Command"}`;
    }
    if (action.type === "openEditor") {
      const editor = editors.find((entry) => entry.id === action.editorId);
      return `${project?.name ?? t("Projekt", "Project")}${editor ? ` · ${editor.name}` : ""}`;
    }
    return project?.name ?? t("Projekt", "Project");
  }

  return (
    <Modal open={open} onClose={onClose} title={t("Startsets", "Launch sets")} size="large">
      <div className="workspace-layout">
        <aside className="workspace-sidebar">
          <div className="workspace-sidebar__intro">
            <strong>{t("Ein-Klick-Start", "One-click launch")}</strong>
            <small>{t("Bestehende Projekte, Commands und URLs gemeinsam öffnen.", "Open existing projects, commands and URLs together.")}</small>
          </div>
          <button className="button button--primary button--full" type="button" onClick={createWorkspace}><Icon name="plus" />{t("Startset erstellen", "Create launch set")}</button>
          <div className="workspace-list">
            {workspaces.map((workspace) => (
              <button type="button" key={workspace.id} className={workspace.id === selectedId ? "active" : ""} onClick={() => setSelectedId(workspace.id)}>
                <span className="workspace-list__icon"><Icon name="layers" /></span>
                <span><strong className="selectable-text" onClick={(event) => event.stopPropagation()}>{workspace.name}</strong><small>{workspace.autoStartOnAppLaunch ? t(`Autostart · ${workspace.actions.length} Schritte`, `Auto-start · ${workspace.actions.length} steps`) : t(`${workspace.actions.length} Schritte`, `${workspace.actions.length} steps`)}</small></span>
              </button>
            ))}
          </div>
          {workspaces.length === 0 && <div className="empty-state empty-state--compact"><Icon name="layers" /><p>{t("Noch keine Startsets.", "No launch sets yet.")}</p></div>}
        </aside>

        {selected ? (
          <div className="workspace-content">
            <div className="workspace-explainer"><Icon name="info" /><p>{t("Ein Startset ist nur ein gespeicherter Startablauf. Es erstellt keine neuen Ordner und verändert keine Projektdateien.", "A launch set is only a saved startup flow. It does not create folders or modify project files.")}</p></div>

            <form className="workspace-meta" onSubmit={saveMeta}>
              <div className="form-grid form-grid--2">
                <div className="form-field"><label htmlFor="workspace-name">{t("Name", "Name")}</label><input id="workspace-name" value={name} onChange={(event) => setName(event.target.value)} /></div>
                <div className="form-field"><label htmlFor="workspace-description">{t("Beschreibung", "Description")}</label><input id="workspace-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t("Zum Beispiel: API + Frontend lokal starten", "For example: launch API + frontend locally")} /></div>
              </div>
              <label className="checkbox-row workspace-autostart">
                <input
                  type="checkbox"
                  checked={selected.autoStartOnAppLaunch}
                  onChange={(event) => onChange(workspaces.map((workspace) => workspace.id === selected.id ? {
                    ...workspace,
                    autoStartOnAppLaunch: event.target.checked,
                    updatedAt: new Date().toISOString(),
                  } : workspace))}
                />
                <span>
                  <strong>{t("Beim Start von Code Deck ausführen", "Run when Code Deck starts")}</strong>
                  <small>{t("Startet dieses Set einmal automatisch, nachdem Projekte und Einstellungen geladen wurden.", "Starts this set once automatically after projects and settings have loaded.")}</small>
                </span>
              </label>
              <div className="form-actions form-actions--space-between"><button className="button button--danger button--small" type="button" onClick={deleteWorkspace}><Icon name="trash" />{t("Löschen", "Delete")}</button><button className="button button--secondary button--small" type="submit"><Icon name="check" />{t("Details speichern", "Save details")}</button></div>
            </form>

            <section className="panel workspace-actions-panel">
              <div className="panel__header">
                <div><p className="eyebrow">{t("Startablauf", "Launch flow")}</p><h3>{t("Startschritte", "Launch steps")}</h3></div>
                <div className="button-row"><button className="button button--ghost button--small" type="button" onClick={() => onStop(selected)}><Icon name="square" />{t("Commands stoppen", "Stop commands")}</button><button className="button button--primary button--small" type="button" onClick={() => onStart(selected)} disabled={!selected.actions.length}><Icon name="play" />{t("Set starten", "Start set")}</button></div>
              </div>
              {sortedActions.length ? (
                <div className="workspace-action-list">
                  {sortedActions.map((action, index) => (
                    <article key={action.id}>
                      <span className="workspace-action-list__order">{index + 1}</span>
                      <span className="workspace-action-list__icon"><Icon name={actionIcon(action.type)} /></span>
                      <div><strong>{actionLabels[action.type]}</strong><small>{describeAction(action)}</small></div>
                      <span className="badge badge--muted">{action.runMode === "sequence" ? t("Nach vorherigem Start", "After previous launch") : t("Direkt", "Immediately")}</span>
                      <button className="icon-button icon-button--small" type="button" title={t("Nach oben", "Move up")} aria-label={t("Startschritt nach oben verschieben", "Move launch step up")} onClick={() => moveAction(action.id, -1)} disabled={index === 0}><Icon name="arrow-up" /></button>
                      <button className="icon-button icon-button--small" type="button" title={t("Nach unten", "Move down")} aria-label={t("Startschritt nach unten verschieben", "Move launch step down")} onClick={() => moveAction(action.id, 1)} disabled={index === sortedActions.length - 1}><Icon name="arrow-down" /></button>
                      <button className="icon-button icon-button--small icon-button--danger" type="button" title={t("Entfernen", "Remove")} aria-label={t("Startschritt entfernen", "Remove launch step")} onClick={() => removeAction(action.id)}><Icon name="trash" /></button>
                    </article>
                  ))}
                </div>
              ) : <div className="empty-state empty-state--compact"><Icon name="layers" /><p>{t("Füge den ersten Startschritt hinzu.", "Add the first launch step.")}</p></div>}
            </section>

            <form className="panel workspace-action-form" onSubmit={addAction}>
              <div className="panel__header"><div><p className="eyebrow">{t("Neuer Schritt", "New step")}</p><h3>{t("Aktion hinzufügen", "Add action")}</h3></div></div>
              <div className="form-grid form-grid--3">
                <div className="form-field"><label htmlFor="action-type">{t("Aktion", "Action")}</label><select id="action-type" value={actionType} onChange={(event) => setActionType(event.target.value as WorkspaceActionType)}>{Object.entries(actionLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
                {actionType !== "openUrl" && <div className="form-field"><label htmlFor="action-project">{t("Projekt", "Project")}</label><select id="action-project" value={actionProjectId} onChange={(event) => { setActionProjectId(event.target.value); setActionCommandId(""); }}><option value="">{t("Projekt wählen", "Choose project")}</option>{availableProjects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></div>}
                <div className="form-field"><label htmlFor="action-mode">{t("Zeitpunkt", "Timing")}</label><select id="action-mode" value={actionRunMode} onChange={(event) => setActionRunMode(event.target.value as "parallel" | "sequence")}><option value="parallel">{t("Direkt mit den anderen starten", "Launch immediately with others")}</option><option value="sequence">{t("Nach dem vorherigen Start", "After the previous launch")}</option></select></div>
              </div>
              {actionType === "runCommand" && <div className="form-grid form-grid--2"><div className="form-field"><label htmlFor="action-command-id">{t("Gespeicherter Command", "Saved command")}</label><select id="action-command-id" value={actionCommandId} onChange={(event) => setActionCommandId(event.target.value)}><option value="">{t("Eigener Befehl", "Custom command")}</option>{selectedProject?.commands.map((command) => <option value={command.id} key={command.id}>{command.label}</option>)}</select></div><div className="form-field"><label htmlFor="action-command">{t("Eigener Befehl", "Custom command")}</label><input id="action-command" value={actionCommand} onChange={(event) => setActionCommand(event.target.value)} disabled={Boolean(actionCommandId)} placeholder="pnpm dev" /></div></div>}
              {actionType === "openUrl" && <div className="form-field"><label htmlFor="action-url">URL</label><input id="action-url" value={actionUrl} onChange={(event) => setActionUrl(event.target.value)} placeholder="http://localhost:3000" /></div>}
              {actionType === "openEditor" && <div className="form-field"><label htmlFor="action-editor">{t("Alternative IDE (optional)", "Alternative IDE (optional)")}</label><select id="action-editor" value={actionEditorId} onChange={(event) => setActionEditorId(event.target.value)}><option value="">{t("Projektstandard", "Project default")}</option>{editors.filter((editor) => editor.enabled).map((editor) => <option value={editor.id} key={editor.id}>{editor.name}</option>)}</select></div>}
              <div className="form-actions"><button className="button button--primary" type="submit"><Icon name="plus" />{t("Startschritt hinzufügen", "Add launch step")}</button></div>
            </form>
          </div>
        ) : (
          <div className="empty-state workspace-empty"><Icon name="layers" /><h3>{t("Startset erstellen", "Create launch set")}</h3><p>{t("Öffne mehrere vorhandene Projekte, Commands und URLs mit einem Klick.", "Open multiple existing projects, commands and URLs with one click.")}</p><button className="button button--primary" type="button" onClick={createWorkspace}><Icon name="plus" />{t("Erstes Startset erstellen", "Create first launch set")}</button></div>
        )}
      </div>
    </Modal>
  );
}
