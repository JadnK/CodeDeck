import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../shared/components/Icon";
import { Modal } from "../../shared/components/Modal";
import { useI18n } from "../../shared/i18n/I18n";
import { getBuiltInProjectTemplates } from "../../shared/lib/projectTemplates";
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

function folderName(path: string, fallback: string) {
  return path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || fallback;
}

function joinPreview(parent: string, name: string) {
  if (!parent.trim()) return name.trim();
  const separator = parent.includes("\\") && !parent.includes("/") ? "\\" : "/";
  return `${parent.replace(/[\\/]+$/, "")}${separator}${name.trim() || "my-project"}`;
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
  const { t, language } = useI18n();
  const builtInProjectTemplates = getBuiltInProjectTemplates(language);
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
      setName((current) => current || folderName(selected, t("Neues Projekt", "New project")));
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
      onError(t("Bitte gib einen Projektnamen ein.", "Enter a project name."));
      return;
    }

    if (mode === "existing") {
      if (!existingPath.trim()) {
        onError(t("Bitte wähle den vorhandenen Projektordner aus.", "Choose the existing project folder."));
        return;
      }
      setLoading(true);
      try {
        const result = inspection ?? await inspectProject(existingPath.trim());
        if (!result.exists) throw new Error(t("Der ausgewählte Projektordner wurde nicht gefunden.", "The selected project folder could not be found."));
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
      onError(t("Bitte wähle einen Ordner, in dem das neue Projekt erstellt werden soll.", "Choose a folder in which the new project should be created."));
      return;
    }
    if (!selectedBuiltIn && !selectedCustom) {
      onError(t("Bitte wähle eine Projektvorlage aus.", "Choose a project template."));
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
    <Modal open={open} onClose={onClose} title={t("Projekt hinzufügen", "Add project")} size="large">
      <form className="form-stack project-create" onSubmit={submit}>
        <div className="creation-mode-tabs" role="tablist" aria-label={t("Art des Projekts", "Project type")}>
          <button type="button" className={mode === "new" ? "active" : ""} onClick={() => setMode("new")}>
            <Icon name="plus" />
            <span><strong>{t("Neues Projekt erstellen", "Create new project")}</strong><small>{t("Code Deck erzeugt ein startfertiges Grundgerüst.", "Code Deck creates a ready-to-use starter.")}</small></span>
          </button>
          <button type="button" className={mode === "existing" ? "active" : ""} onClick={() => setMode("existing")}>
            <Icon name="folder" />
            <span><strong>{t("Vorhandenen Ordner hinzufügen", "Add existing folder")}</strong><small>{t("Ein bereits existierendes Projekt nur verwalten.", "Manage a project that already exists.")}</small></span>
          </button>
        </div>

        {mode === "new" ? (
          <>
            <section className="creation-section">
              <div className="creation-section__header">
                <div><p className="eyebrow">{t("1. Grundgerüst", "1. Starter")}</p><h3>{t("Welche Art Projekt soll entstehen?", "What kind of project should be created?")}</h3><p>{t("Die Dateien werden lokal erstellt. Abhängigkeiten werden bewusst nicht automatisch installiert.", "Files are created locally. Dependencies are intentionally not installed automatically.")}</p></div>
                <button className="button button--ghost button--small" type="button" onClick={onOpenTemplateSettings}><Icon name="settings" />{t("Eigene Vorlagen verwalten", "Manage custom templates")}</button>
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
                    <span><strong>{template.name}</strong><small>{template.description || t("Eigene Ordnervorlage", "Custom folder template")}</small><em>{t("Quelle", "Source")}: {template.sourcePath}</em></span>
                    <b>{t("Eigene Vorlage", "Custom template")}</b>
                  </button>
                ))}
              </div>
            </section>

            <section className="creation-section">
              <div className="creation-section__header"><div><p className="eyebrow">{t("2. Speicherort", "2. Location")}</p><h3>{t("Name und Zielordner", "Name and destination folder")}</h3><p>{t("Code Deck legt im Zielordner einen neuen Unterordner an.", "Code Deck creates a new subfolder in the destination folder.")}</p></div></div>
              <div className="form-grid form-grid--2">
                <div className="form-field">
                  <label htmlFor="new-project-name">{t("Projektname", "Project name")}</label>
                  <input id="new-project-name" value={name} onChange={(event) => setName(event.target.value)} placeholder={t("mein-neues-projekt", "my-new-project")} autoFocus />
                </div>
                <div className="form-field">
                  <label htmlFor="new-project-parent">{t("Übergeordneter Ordner", "Parent folder")}</label>
                  <div className="input-action-row">
                    <input id="new-project-parent" value={parentPath} onChange={(event) => setParentPath(event.target.value)} placeholder="C:\\Users\\du\\Projects" />
                    <button className="button button--secondary" type="button" onClick={browseParent}><Icon name="folder" />{t("Ordner wählen", "Choose folder")}</button>
                  </div>
                </div>
              </div>
              <div className="path-preview"><Icon name="folder" /><span><small>{t("Neuer Projektpfad", "New project path")}</small><code>{joinPreview(parentPath, name)}</code></span></div>
              <label className="checkbox-row">
                <input type="checkbox" checked={initGit} onChange={(event) => setInitGit(event.target.checked)} />
                <span><strong>{t("Git-Repository initialisieren", "Initialize Git repository")}</strong><small>{t("Führt nach dem Erstellen lokal", "Runs locally after creation")} <code>git init</code> {t("aus, sofern Git installiert ist.", "if Git is installed.")}</small></span>
              </label>
            </section>
          </>
        ) : (
          <section className="creation-section">
            <div className="creation-section__header"><div><p className="eyebrow">{t("Projektordner", "Project folder")}</p><h3>{t("Vorhandenes Projekt auswählen", "Select existing project")}</h3><p>{t("Code Deck liest nur Metadaten und verändert keine Projektdateien.", "Code Deck only reads metadata and does not change project files.")}</p></div></div>
            <div className="form-field">
              <label htmlFor="project-path">{t("Projektordner", "Project folder")}</label>
              <div className="input-action-row">
                <input id="project-path" value={existingPath} onChange={(event) => setExistingPath(event.target.value)} placeholder="C:\\Users\\...\\my-project" />
                <button className="button button--secondary" type="button" onClick={browseExisting}><Icon name="folder" />{t("Projektordner wählen", "Choose project folder")}</button>
              </div>
              <div className="field-inline-actions">
                <button className="text-button" type="button" onClick={refreshInspection} disabled={!existingPath || loading}><Icon name="refresh" />{loading ? t("Analysiere…", "Inspecting…") : t("Git, Frameworks und Scripts erkennen", "Detect Git, frameworks and scripts")}</button>
              </div>
            </div>
            {inspection && (
              <div className="detection-summary">
                <div><Icon name="check" /><span>{inspection.exists ? t("Ordner gefunden", "Folder found") : t("Ordner nicht gefunden", "Folder not found")}</span></div>
                <div><Icon name="git" /><span>{inspection.isGit ? `Git: ${inspection.branch || t("Repository", "Repository")}` : t("Kein Git-Repository", "No Git repository")}</span></div>
                <div><Icon name="command" /><span>{t(`${inspection.scripts.length} startbare Scripts erkannt`, `${inspection.scripts.length} runnable scripts detected`)}</span></div>
              </div>
            )}
          </section>
        )}

        <section className="creation-section creation-section--compact">
          <div className="creation-section__header"><div><p className="eyebrow">{t("3. Anzeige in Code Deck", "3. Display in Code Deck")}</p><h3>{t("Metadaten und Standardaktion", "Metadata and default action")}</h3><p>{t("Diese Angaben kannst du später in den Projektdetails ändern.", "You can change these values later in the project details.")}</p></div></div>
          {mode === "existing" && (
            <div className="form-field"><label htmlFor="project-name">{t("Anzeigename", "Display name")}</label><input id="project-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Portfolio Website" /></div>
          )}
          <div className="form-grid form-grid--2">
            <div className="form-field">
              <label htmlFor="project-editor">{t("Bevorzugte IDE", "Preferred IDE")}</label>
              <select id="project-editor" value={editorId} onChange={(event) => setEditorId(event.target.value)}>
                <option value="">{t("Keine IDE festlegen", "Do not set an IDE")}</option>
                {enabledEditors.map((editor) => <option key={editor.id} value={editor.id}>{editor.name}</option>)}
              </select>
              <small>{t("Der große Öffnen-Button verwendet später diese IDE.", "The main Open button will use this IDE.")}</small>
            </div>
            <div className="form-field">
              <label htmlFor="project-tags">{t("Tags", "Tags")}</label>
              <input id="project-tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="backend, spring, kunde-a" />
              <small>{t("Mehrere Tags mit Komma trennen.", "Separate multiple tags with commas.")}</small>
            </div>
          </div>
          <div className="form-field"><label htmlFor="project-description">{t("Beschreibung", "Description")}</label><textarea id="project-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t("Worum geht es in diesem Projekt?", "What is this project about?")} rows={2} /></div>
          <label className="checkbox-row"><input type="checkbox" checked={favorite} onChange={(event) => setFavorite(event.target.checked)} /><span><strong>{t("Als Favorit markieren", "Mark as favorite")}</strong><small>{t("Das Projekt erscheint weiter oben auf der Startseite.", "The project appears higher on the home page.")}</small></span></label>
        </section>

        <div className="creation-summary">
          <Icon name={mode === "new" ? "plus" : "folder"} />
          <span><strong>{mode === "new" ? t("Code Deck erstellt Dateien und nimmt das Projekt direkt auf.", "Code Deck creates the files and adds the project immediately.") : t("Code Deck nimmt den Ordner auf und erkennt verfügbare Aktionen.", "Code Deck adds the folder and detects available actions.")}</strong><small>{mode === "new" ? t("Pakete wie npm-Dependencies oder Maven-Artefakte installierst du anschließend über die erkannten Commands.", "Install packages such as npm dependencies or Maven artifacts afterwards using the detected commands.") : t("Es werden keine Dateien im ausgewählten Projekt verändert.", "No files in the selected project are changed.")}</small></span>
        </div>

        <div className="form-actions">
          <button className="button button--ghost" type="button" onClick={onClose}>{t("Abbrechen", "Cancel")}</button>
          <button className="button button--primary" type="submit" disabled={loading}>
            <Icon name={mode === "new" ? "plus" : "folder"} />
            {loading ? t("Bitte warten…", "Please wait…") : mode === "new" ? t("Projekt erstellen", "Create project") : t("Ordner zu Code Deck hinzufügen", "Add folder to Code Deck")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
