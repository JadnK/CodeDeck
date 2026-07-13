import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../shared/components/Icon";
import { Modal } from "../../shared/components/Modal";
import { chooseDirectory, inspectProject } from "../../shared/lib/tauri";
import { createId } from "../../shared/lib/storage";
import type { Editor, Project, ProjectInspection } from "../../shared/types/models";

type ProjectCreateModalProps = {
  open: boolean;
  editors: Editor[];
  defaultProjectDir: string;
  onClose: () => void;
  onCreate: (project: Project) => void;
  onError: (message: string) => void;
};

function folderName(path: string) {
  return path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "Neues Projekt";
}

export function ProjectCreateModal({
  open,
  editors,
  defaultProjectDir,
  onClose,
  onCreate,
  onError,
}: ProjectCreateModalProps) {
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [editorId, setEditorId] = useState("");
  const [favorite, setFavorite] = useState(false);
  const [inspection, setInspection] = useState<ProjectInspection>();
  const [loading, setLoading] = useState(false);

  const enabledEditors = useMemo(() => editors.filter((editor) => editor.enabled), [editors]);

  useEffect(() => {
    if (!open) return;
    setPath("");
    setName("");
    setDescription("");
    setTags("");
    setEditorId(enabledEditors[0]?.id ?? "");
    setFavorite(false);
    setInspection(undefined);
  }, [open, enabledEditors]);

  async function browse() {
    try {
      const selected = await chooseDirectory(defaultProjectDir);
      if (!selected) return;
      setPath(selected);
      setName((current) => current || folderName(selected));
      setLoading(true);
      const result = await inspectProject(selected);
      setInspection(result);
      if (result.frameworks.length) setTags(result.frameworks.join(", "));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function refreshInspection() {
    if (!path.trim()) return;
    setLoading(true);
    try {
      const result = await inspectProject(path.trim());
      setInspection(result);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!path.trim() || !name.trim()) {
      onError("Bitte wähle einen Projektordner und gib einen Namen ein.");
      return;
    }
    const now = new Date().toISOString();
    onCreate({
      id: createId(),
      name: name.trim(),
      path: path.trim(),
      description: description.trim(),
      tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      favorite,
      archived: false,
      preferredEditorId: editorId || undefined,
      commands: inspection?.scripts.slice(0, 6).map((script) => ({
        id: createId(),
        label: script.name,
        command: script.command,
        env: {},
        trusted: true,
      })) ?? [],
      createdAt: now,
      updatedAt: now,
      inspection,
    });
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Projekt hinzufügen" eyebrow="Lokales Projekt" size="medium">
      <form className="form-stack" onSubmit={submit}>
        <div className="form-field">
          <label htmlFor="project-path">Projektordner</label>
          <div className="input-action-row">
            <input id="project-path" value={path} onChange={(event) => setPath(event.target.value)} placeholder="C:\\Users\\...\\mein-projekt" />
            <button className="button button--secondary" type="button" onClick={browse}>
              <Icon name="folder" />
              Auswählen
            </button>
          </div>
          <div className="field-inline-actions">
            <button className="text-button" type="button" onClick={refreshInspection} disabled={!path || loading}>
              <Icon name="refresh" />
              {loading ? "Analysiere…" : "Projekt neu analysieren"}
            </button>
          </div>
        </div>

        {inspection && (
          <div className="detection-summary">
            <div><Icon name="check" /><span>{inspection.exists ? "Ordner erkannt" : "Ordner nicht gefunden"}</span></div>
            <div><Icon name="git" /><span>{inspection.isGit ? `Git: ${inspection.branch || "Repository"}` : "Kein Git-Repository"}</span></div>
            <div><Icon name="command" /><span>{inspection.scripts.length} Scripts erkannt</span></div>
          </div>
        )}

        <div className="form-grid form-grid--2">
          <div className="form-field">
            <label htmlFor="project-name">Name</label>
            <input id="project-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Portfolio Website" />
          </div>
          <div className="form-field">
            <label htmlFor="project-editor">Bevorzugte IDE</label>
            <select id="project-editor" value={editorId} onChange={(event) => setEditorId(event.target.value)}>
              <option value="">Keine IDE</option>
              {enabledEditors.map((editor) => <option key={editor.id} value={editor.id}>{editor.name}</option>)}
            </select>
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="project-description">Beschreibung</label>
          <textarea id="project-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Worum geht es in diesem Projekt?" rows={3} />
        </div>

        <div className="form-field">
          <label htmlFor="project-tags">Tags</label>
          <input id="project-tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="frontend, react, portfolio" />
          <small>Mehrere Tags mit Komma trennen.</small>
        </div>

        <label className="checkbox-row">
          <input type="checkbox" checked={favorite} onChange={(event) => setFavorite(event.target.checked)} />
          <span>
            <strong>Als Favorit markieren</strong>
            <small>Das Projekt erscheint zuerst auf der Startseite.</small>
          </span>
        </label>

        <div className="form-actions">
          <button className="button button--ghost" type="button" onClick={onClose}>Abbrechen</button>
          <button className="button button--primary" type="submit" disabled={loading}>
            <Icon name="plus" />
            Projekt hinzufügen
          </button>
        </div>
      </form>
    </Modal>
  );
}
