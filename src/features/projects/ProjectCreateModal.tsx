import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../shared/components/Icon";
import { Modal } from "../../shared/components/Modal";
import { builtInProjectTemplates } from "../../shared/lib/projectTemplates";
import { createId } from "../../shared/lib/storage";
import {
  chooseDirectory,
  createProjectFromTemplate,
  inspectProject,
} from "../../shared/lib/tauri";
import type {
  CustomProjectTemplate,
  Editor,
  Project,
  ProjectInspection,
} from "../../shared/types/models";

type ProjectCreateModalProps = {
  open: boolean;
  editors: Editor[];
  projectTemplates: CustomProjectTemplate[];
  defaultProjectDir: string;
  onClose: () => void;
  onCreate: (project: Project) => void;
  onOpenTemplateSettings: () => void;
  onError: (message: string) => void;
};

type CreateMode = "existing" | "new";

function folderName(path: string) {
  return path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "Neues Projekt";
}

function joinPreview(parent: string, name: string) {
  if (!parent.trim()) return name.trim();
  const separator = parent.includes("\\") && !parent.includes("/") ? "\\" : "/";
  return `${parent.replace(/[\\/]+$/, "")}${separator}${name.trim() || "mein-projekt"}`;
}

function tagsFromInput(value: string) {
  return value.split(",").map((tag) => tag.trim()).filter(Boolean);
}

export function ProjectCreateModal({
  open,
  editors,
  projectTemplates,
  defaultProjectDir,
  onClose,
  onCreate,
  onOpenTemplateSettings,
  onError,
}: ProjectCreateModalProps) {
  const [mode, setMode] = useState<CreateMode>("new");
  const [existingPath, setExistingPath] = useState("");
  const [parentPath, setParentPath] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [editorId, setEditorId] = useState("");
  const [favorite, setFavorite] = useState(false);
  const [initGit, setInitGit] = useState(true);
  const [templateKey, setTemplateKey] = useState("builtin:node-typescript");
  const [inspection, setInspection] = useState<ProjectInspection>();
  const [loading, setLoading] = useState(false);

  const enabledEditors = useMemo(() => editors.filter((editor) => editor.enabled), [editors]);
  const selectedBuiltIn = templateKey.startsWith("builtin:")
    ? builtInProjectTemplates.find((template) => `builtin:${template.id}` === templateKey)
    : undefined;
  const selectedCustom = templateKey.startsWith("custom:")
    ? projectTemplates.find((template) => `custom:${template.id}` === templateKey)
    : undefined;

  useEffect(() => {
    if (!open) return;
    setMode("new");
    setExistingPath("");
    setParentPath(defaultProjectDir);
    setName("");
    setDescription("");
    setTags("");
    setEditorId(enabledEditors[0]?.id ?? "");
    setFavorite(false);
    setInitGit(true);
    setTemplateKey("builtin:node-typescript");
    setInspection(undefined);
    setLoading(false);
  }, [open, defaultProjectDir, enabledEditors]);

  function selectTemplate(key: string) {
    setTemplateKey(key);
    const builtIn = builtInProjectTemplates.find((template) => `builtin:${template.id}` === key);
    const custom = projectTemplates.find((template) => `custom:${template.id}` === key);
    const templateTags = builtIn?.tags ?? custom?.tags ?? [];
    setTags(templateTags.join(", "));
    if (custom?.preferredEditorId) setEditorId(custom.preferredEditorId);
  }

  async function browseExisting() {
    try {
      const selected = await chooseDirectory(defaultProjectDir);
      if (!selected) return;
      setExistingPath(selected);
      setName((current) => current || folderName(selected));
      setLoading(true);
      const result = await inspectProject(selected);
      setInspection(result);
      setTags(result.frameworks.join(", "));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function browseParent() {
    try {
      const selected = await chooseDirectory(parentPath || defaultProjectDir);
      if (selected) setParentPath(selected);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }

  async function refreshInspection() {
    if (!existingPath.trim()) return;
    setLoading(true);
    try {
      const result = await inspectProject(existingPath.trim());
      setInspection(result);
      setTags(result.frameworks.join(", "));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  function buildProject(path: string, projectInspection: ProjectInspection): Project {
    const now = new Date().toISOString();
    return {
      id: createId(),
      name: name.trim(),
      path,
      description: description.trim(),
      tags: tagsFromInput(tags),
      favorite,
      archived: false,
      preferredEditorId: editorId || undefined,
      commands: projectInspection.scripts.slice(0, 8).map((script) => ({
        id: createId(),
        label: script.name,
        command: script.command,
        env: {},
        trusted: true,
      })),
      createdAt: now,
      updatedAt: now,
      inspection: projectInspection,
    };
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      onError("Bitte gib einen Projektnamen ein.");
      return;
    }

    if (mode === "existing") {
      if (!existingPath.trim()) {
        onError("Bitte wähle den vorhandenen Projektordner aus.");
        return;
      }
      setLoading(true);
      try {
        const result = inspection ?? await inspectProject(existingPath.trim());
        if (!result.exists) throw new Error("Der ausgewählte Projektordner wurde nicht gefunden.");
        onCreate(buildProject(existingPath.trim(), result));
        onClose();
      } catch (error) {
        onError(error instanceof Error ? error.message : String(error));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!parentPath.trim()) {
      onError("Bitte wähle einen Ordner, in dem das neue Projekt erstellt werden soll.");
      return;
    }
    if (!selectedBuiltIn && !selectedCustom) {
      onError("Bitte wähle eine Projektvorlage aus.");
      return;
    }

    setLoading(true);
    try {
      const created = await createProjectFromTemplate(
        parentPath.trim(),
        name.trim(),
        selectedBuiltIn?.id ?? "custom",
        selectedCustom?.sourcePath,
        initGit,
      );
      const result = await inspectProject(created.path);
      onCreate(buildProject(created.path, result));
      onClose();
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Projekt hinzufügen" size="large">
      <form className="form-stack project-create" onSubmit={submit}>
        <div className="creation-mode-tabs" role="tablist" aria-label="Art des Projekts">
          <button type="button" className={mode === "new" ? "active" : ""} onClick={() => setMode("new")}>
            <Icon name="plus" />
            <span><strong>Neues Projekt erstellen</strong><small>Code Deck erzeugt ein startfertiges Grundgerüst.</small></span>
          </button>
          <button type="button" className={mode === "existing" ? "active" : ""} onClick={() => setMode("existing")}>
            <Icon name="folder" />
            <span><strong>Vorhandenen Ordner hinzufügen</strong><small>Ein bereits existierendes Projekt nur verwalten.</small></span>
          </button>
        </div>

        {mode === "new" ? (
          <>
            <section className="creation-section">
              <div className="creation-section__header">
                <div><p className="eyebrow">1. Grundgerüst</p><h3>Welche Art Projekt soll entstehen?</h3><p>Die Dateien werden lokal erstellt. Abhängigkeiten werden bewusst nicht automatisch installiert.</p></div>
                <button className="button button--ghost button--small" type="button" onClick={onOpenTemplateSettings}><Icon name="settings" />Eigene Vorlagen verwalten</button>
              </div>
              <div className="template-picker">
                {builtInProjectTemplates.map((template) => (
                  <button
                    className={`template-option ${templateKey === `builtin:${template.id}` ? "active" : ""}`}
                    type="button"
                    key={template.id}
                    onClick={() => selectTemplate(`builtin:${template.id}`)}
                  >
                    <span className="template-option__icon"><Icon name={template.icon} /></span>
                    <span><strong>{template.name}</strong><small>{template.description}</small><em>{template.details}</em></span>
                    {template.requirements && <b>{template.requirements}</b>}
                  </button>
                ))}
                {projectTemplates.map((template) => (
                  <button
                    className={`template-option template-option--custom ${templateKey === `custom:${template.id}` ? "active" : ""}`}
                    type="button"
                    key={template.id}
                    onClick={() => selectTemplate(`custom:${template.id}`)}
                  >
                    <span className="template-option__icon"><Icon name="layers" /></span>
                    <span><strong>{template.name}</strong><small>{template.description || "Eigene Ordnervorlage"}</small><em>Quelle: {template.sourcePath}</em></span>
                    <b>Eigene Vorlage</b>
                  </button>
                ))}
              </div>
            </section>

            <section className="creation-section">
              <div className="creation-section__header"><div><p className="eyebrow">2. Speicherort</p><h3>Name und Zielordner</h3><p>Code Deck legt im Zielordner einen neuen Unterordner an.</p></div></div>
              <div className="form-grid form-grid--2">
                <div className="form-field">
                  <label htmlFor="new-project-name">Projektname</label>
                  <input id="new-project-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="mein-neues-projekt" autoFocus />
                </div>
                <div className="form-field">
                  <label htmlFor="new-project-parent">Übergeordneter Ordner</label>
                  <div className="input-action-row">
                    <input id="new-project-parent" value={parentPath} onChange={(event) => setParentPath(event.target.value)} placeholder="C:\\Users\\du\\Projects" />
                    <button className="button button--secondary" type="button" onClick={browseParent}><Icon name="folder" />Ordner wählen</button>
                  </div>
                </div>
              </div>
              <div className="path-preview"><Icon name="folder" /><span><small>Neuer Projektpfad</small><code>{joinPreview(parentPath, name)}</code></span></div>
              <label className="checkbox-row">
                <input type="checkbox" checked={initGit} onChange={(event) => setInitGit(event.target.checked)} />
                <span><strong>Git-Repository initialisieren</strong><small>Führt nach dem Erstellen lokal <code>git init</code> aus, sofern Git installiert ist.</small></span>
              </label>
            </section>
          </>
        ) : (
          <section className="creation-section">
            <div className="creation-section__header"><div><p className="eyebrow">Projektordner</p><h3>Vorhandenes Projekt auswählen</h3><p>Code Deck liest nur Metadaten und verändert keine Projektdateien.</p></div></div>
            <div className="form-field">
              <label htmlFor="project-path">Projektordner</label>
              <div className="input-action-row">
                <input id="project-path" value={existingPath} onChange={(event) => setExistingPath(event.target.value)} placeholder="C:\\Users\\...\\mein-projekt" />
                <button className="button button--secondary" type="button" onClick={browseExisting}><Icon name="folder" />Projektordner wählen</button>
              </div>
              <div className="field-inline-actions">
                <button className="text-button" type="button" onClick={refreshInspection} disabled={!existingPath || loading}><Icon name="refresh" />{loading ? "Analysiere…" : "Git, Frameworks und Scripts erkennen"}</button>
              </div>
            </div>
            {inspection && (
              <div className="detection-summary">
                <div><Icon name="check" /><span>{inspection.exists ? "Ordner gefunden" : "Ordner nicht gefunden"}</span></div>
                <div><Icon name="git" /><span>{inspection.isGit ? `Git: ${inspection.branch || "Repository"}` : "Kein Git-Repository"}</span></div>
                <div><Icon name="command" /><span>{inspection.scripts.length} startbare Scripts erkannt</span></div>
              </div>
            )}
          </section>
        )}

        <section className="creation-section creation-section--compact">
          <div className="creation-section__header"><div><p className="eyebrow">3. Anzeige in Code Deck</p><h3>Metadaten und Standardaktion</h3><p>Diese Angaben kannst du später in den Projektdetails ändern.</p></div></div>
          {mode === "existing" && (
            <div className="form-field"><label htmlFor="project-name">Anzeigename</label><input id="project-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Portfolio Website" /></div>
          )}
          <div className="form-grid form-grid--2">
            <div className="form-field">
              <label htmlFor="project-editor">Bevorzugte IDE</label>
              <select id="project-editor" value={editorId} onChange={(event) => setEditorId(event.target.value)}>
                <option value="">Keine IDE festlegen</option>
                {enabledEditors.map((editor) => <option key={editor.id} value={editor.id}>{editor.name}</option>)}
              </select>
              <small>Der große Öffnen-Button verwendet später diese IDE.</small>
            </div>
            <div className="form-field">
              <label htmlFor="project-tags">Tags</label>
              <input id="project-tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="backend, spring, kunde-a" />
              <small>Mehrere Tags mit Komma trennen.</small>
            </div>
          </div>
          <div className="form-field"><label htmlFor="project-description">Beschreibung</label><textarea id="project-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Worum geht es in diesem Projekt?" rows={2} /></div>
          <label className="checkbox-row"><input type="checkbox" checked={favorite} onChange={(event) => setFavorite(event.target.checked)} /><span><strong>Als Favorit markieren</strong><small>Das Projekt erscheint weiter oben auf der Startseite.</small></span></label>
        </section>

        <div className="creation-summary">
          <Icon name={mode === "new" ? "plus" : "folder"} />
          <span><strong>{mode === "new" ? "Code Deck erstellt Dateien und nimmt das Projekt direkt auf." : "Code Deck nimmt den Ordner auf und erkennt verfügbare Aktionen."}</strong><small>{mode === "new" ? "Pakete wie npm-Dependencies oder Maven-Artefakte installierst du anschließend über die erkannten Commands." : "Es werden keine Dateien im ausgewählten Projekt verändert."}</small></span>
        </div>

        <div className="form-actions">
          <button className="button button--ghost" type="button" onClick={onClose}>Abbrechen</button>
          <button className="button button--primary" type="submit" disabled={loading}>
            <Icon name={mode === "new" ? "plus" : "folder"} />
            {loading ? "Bitte warten…" : mode === "new" ? "Projekt erstellen" : "Ordner zu Code Deck hinzufügen"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
