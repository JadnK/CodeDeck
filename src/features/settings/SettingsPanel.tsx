import { useEffect, useState } from "react";
import { Icon } from "../../shared/components/Icon";
import { Modal } from "../../shared/components/Modal";
import { chooseDirectory, detectEditors } from "../../shared/lib/tauri";
import { createId } from "../../shared/lib/storage";
import type {
  AppSettings,
  CustomProjectTemplate,
  Editor,
  EditorSuggestion,
} from "../../shared/types/models";

type SettingsPanelProps = {
  open: boolean;
  editors: Editor[];
  projectTemplates: CustomProjectTemplate[];
  settings: AppSettings;
  onClose: () => void;
  onEditorsChange: (editors: Editor[]) => void;
  onProjectTemplatesChange: (templates: CustomProjectTemplate[]) => void;
  onSettingsChange: (settings: AppSettings) => void;
  onExport: () => void;
  onImport: () => void;
  onResetOnboarding: () => void;
  onError: (message: string) => void;
};

export function SettingsPanel({
  open,
  editors,
  projectTemplates,
  settings,
  onClose,
  onEditorsChange,
  onProjectTemplatesChange,
  onSettingsChange,
  onExport,
  onImport,
  onResetOnboarding,
  onError,
}: SettingsPanelProps) {
  const [name, setName] = useState("");
  const [template, setTemplate] = useState('"{projectPath}"');
  const [editingId, setEditingId] = useState<string>();
  const [suggestions, setSuggestions] = useState<EditorSuggestion[]>([]);
  const [detecting, setDetecting] = useState(false);

  const [projectTemplateName, setProjectTemplateName] = useState("");
  const [projectTemplateDescription, setProjectTemplateDescription] = useState("");
  const [projectTemplatePath, setProjectTemplatePath] = useState("");
  const [projectTemplateTags, setProjectTemplateTags] = useState("");
  const [projectTemplateEditorId, setProjectTemplateEditorId] = useState("");
  const [editingProjectTemplateId, setEditingProjectTemplateId] = useState<string>();

  useEffect(() => {
    if (!open) return;
    resetEditorForm();
    resetProjectTemplateForm();
  }, [open]);

  function resetEditorForm() {
    setName("");
    setTemplate('"{projectPath}"');
    setEditingId(undefined);
  }

  function resetProjectTemplateForm() {
    setProjectTemplateName("");
    setProjectTemplateDescription("");
    setProjectTemplatePath("");
    setProjectTemplateTags("");
    setProjectTemplateEditorId("");
    setEditingProjectTemplateId(undefined);
  }

  function submitEditor(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !template.trim()) {
      onError("Bitte gib einen IDE-Namen und ein Command-Template an.");
      return;
    }
    const next = editingId
      ? editors.map((editor) => editor.id === editingId ? { ...editor, name: name.trim(), commandTemplate: template.trim() } : editor)
      : [...editors, { id: createId(), name: name.trim(), commandTemplate: template.trim(), enabled: true }];
    onEditorsChange(next);
    resetEditorForm();
  }

  function edit(editor: Editor) {
    setEditingId(editor.id);
    setName(editor.name);
    setTemplate(editor.commandTemplate);
  }

  async function browseDefaultDirectory() {
    try {
      const path = await chooseDirectory(settings.defaultProjectDir);
      if (path) onSettingsChange({ ...settings, defaultProjectDir: path });
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }

  async function runDetection() {
    setDetecting(true);
    try {
      setSuggestions(await detectEditors());
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setDetecting(false);
    }
  }

  function addSuggestion(suggestion: EditorSuggestion) {
    if (editors.some((editor) => editor.commandTemplate === suggestion.commandTemplate)) return;
    onEditorsChange([...editors, { ...suggestion, enabled: true, detected: true }]);
  }

  async function browseTemplateDirectory() {
    try {
      const path = await chooseDirectory(projectTemplatePath || settings.defaultProjectDir);
      if (path) {
        setProjectTemplatePath(path);
        setProjectTemplateName((current) => current || path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "Eigene Vorlage");
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }

  function submitProjectTemplate(event: React.FormEvent) {
    event.preventDefault();
    if (!projectTemplateName.trim() || !projectTemplatePath.trim()) {
      onError("Bitte gib einen Vorlagennamen an und wähle einen Quellordner.");
      return;
    }
    const now = new Date().toISOString();
    const entry: CustomProjectTemplate = {
      id: editingProjectTemplateId ?? createId(),
      name: projectTemplateName.trim(),
      description: projectTemplateDescription.trim(),
      sourcePath: projectTemplatePath.trim(),
      tags: projectTemplateTags.split(",").map((tag) => tag.trim()).filter(Boolean),
      preferredEditorId: projectTemplateEditorId || undefined,
      createdAt: editingProjectTemplateId
        ? projectTemplates.find((templateEntry) => templateEntry.id === editingProjectTemplateId)?.createdAt ?? now
        : now,
      updatedAt: now,
    };
    onProjectTemplatesChange(editingProjectTemplateId
      ? projectTemplates.map((templateEntry) => templateEntry.id === editingProjectTemplateId ? entry : templateEntry)
      : [...projectTemplates, entry]);
    resetProjectTemplateForm();
  }

  function editProjectTemplate(templateEntry: CustomProjectTemplate) {
    setEditingProjectTemplateId(templateEntry.id);
    setProjectTemplateName(templateEntry.name);
    setProjectTemplateDescription(templateEntry.description);
    setProjectTemplatePath(templateEntry.sourcePath);
    setProjectTemplateTags(templateEntry.tags.join(", "));
    setProjectTemplateEditorId(templateEntry.preferredEditorId ?? "");
  }

  function deleteProjectTemplate(templateEntry: CustomProjectTemplate) {
    if (!window.confirm(`Vorlage „${templateEntry.name}“ aus Code Deck entfernen? Der Quellordner bleibt unverändert.`)) return;
    onProjectTemplatesChange(projectTemplates.filter((entry) => entry.id !== templateEntry.id));
    if (editingProjectTemplateId === templateEntry.id) resetProjectTemplateForm();
  }

  return (
    <Modal open={open} onClose={onClose} title="Einstellungen" size="large">
      <div className="settings-sections">
        <section className="settings-section">
          <div className="settings-section__header"><div><Icon name="sun" /><span><strong>Darstellung</strong><small>Hell, dunkel oder automatisch nach Betriebssystem</small></span></div></div>
          <div className="segmented-control">
            {(["dark", "light", "system"] as const).map((theme) => (
              <button type="button" className={settings.theme === theme ? "active" : ""} key={theme} onClick={() => onSettingsChange({ ...settings, theme })}>
                <Icon name={theme === "light" ? "sun" : theme === "dark" ? "moon" : "settings"} />
                {theme === "dark" ? "Dunkel" : theme === "light" ? "Hell" : "System übernehmen"}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__header">
            <div><Icon name="code" /><span><strong>IDEs & Editoren</strong><small>Legt fest, womit der Button „In IDE öffnen“ ein Projekt startet</small></span></div>
            <button className="button button--ghost button--small" type="button" onClick={runDetection} disabled={detecting}><Icon name="refresh" />{detecting ? "Installierte IDEs werden gesucht…" : "Installierte IDEs erkennen"}</button>
          </div>
          <div className="settings-help"><Icon name="info" /><p><strong>Command-Template:</strong> Ein Betriebssystem-Befehl, der den Projektpfad enthält. Beispiel: <code>code "{'{projectPath}'}"</code>. Code Deck ersetzt den Platzhalter beim Öffnen.</p></div>
          {suggestions.length > 0 && <div className="suggestion-row">{suggestions.map((suggestion) => <button key={suggestion.id} type="button" onClick={() => addSuggestion(suggestion)}><Icon name="plus" /><span><strong>{suggestion.name} hinzufügen</strong><code>{suggestion.commandTemplate}</code></span></button>)}</div>}
          <div className="editor-settings-grid">
            <form className="settings-card" onSubmit={submitEditor}>
              <h3>{editingId ? "IDE bearbeiten" : "Weitere IDE hinzufügen"}</h3>
              <div className="form-field"><label htmlFor="editor-name">Anzeigename</label><input id="editor-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="VS Code" /></div>
              <div className="form-field"><label htmlFor="editor-template">Startbefehl</label><input id="editor-template" value={template} onChange={(event) => setTemplate(event.target.value)} placeholder={'code "{projectPath}"'} /><small>Verfügbare Platzhalter: {'{projectPath}'} und {'{projectName}'}</small></div>
              <div className="form-actions">{editingId && <button className="button button--ghost" type="button" onClick={resetEditorForm}>Bearbeitung abbrechen</button>}<button className="button button--primary" type="submit"><Icon name={editingId ? "check" : "plus"} />{editingId ? "IDE-Änderungen speichern" : "IDE hinzufügen"}</button></div>
            </form>
            <div className="settings-card">
              <h3>Gespeicherte IDEs</h3>
              <div className="editor-list">
                {editors.map((editor) => (
                  <article key={editor.id} className="editor-row editor-row--clear">
                    <label className="switch" title={editor.enabled ? "IDE ist aktiv" : "IDE ist deaktiviert"}><input type="checkbox" checked={editor.enabled} onChange={(event) => onEditorsChange(editors.map((entry) => entry.id === editor.id ? { ...entry, enabled: event.target.checked } : entry))} /><span /></label>
                    <div><strong>{editor.name}</strong><code>{editor.commandTemplate}</code><small>{editor.enabled ? "Kann Projekten zugeordnet werden" : "Wird bei der Projektauswahl ausgeblendet"}</small></div>
                    <button className="button button--ghost button--small" type="button" onClick={() => edit(editor)}><Icon name="edit" />Bearbeiten</button>
                    <button className="button button--ghost button--small button--danger-text" type="button" onClick={() => onEditorsChange(editors.filter((entry) => entry.id !== editor.id))}><Icon name="trash" />Entfernen</button>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="settings-section" id="project-template-settings">
          <div className="settings-section__header"><div><Icon name="layers" /><span><strong>Eigene Projektvorlagen</strong><small>Einen lokalen Ordner als wiederverwendbares Projekt-Grundgerüst speichern</small></span></div></div>
          <div className="settings-help"><Icon name="info" /><p>Beim Erstellen eines Projekts kopiert Code Deck den Inhalt des Quellordners. Große oder generierte Ordner wie <code>node_modules</code>, <code>.git</code>, <code>target</code>, <code>dist</code> und <code>build</code> werden ausgelassen. Der Quellordner selbst bleibt unverändert.</p></div>
          <div className="editor-settings-grid">
            <form className="settings-card" onSubmit={submitProjectTemplate}>
              <h3>{editingProjectTemplateId ? "Projektvorlage bearbeiten" : "Projektvorlage anlegen"}</h3>
              <div className="form-field"><label htmlFor="project-template-name">Name der Vorlage</label><input id="project-template-name" value={projectTemplateName} onChange={(event) => setProjectTemplateName(event.target.value)} placeholder="Meine Spring-Basis" /></div>
              <div className="form-field"><label htmlFor="project-template-description">Kurze Erklärung</label><input id="project-template-description" value={projectTemplateDescription} onChange={(event) => setProjectTemplateDescription(event.target.value)} placeholder="Spring API mit Security und Docker Compose" /></div>
              <div className="form-field"><label htmlFor="project-template-path">Quellordner</label><div className="input-action-row"><input id="project-template-path" value={projectTemplatePath} onChange={(event) => setProjectTemplatePath(event.target.value)} placeholder="C:\\Users\\du\\Templates\\spring-api" /><button className="button button--secondary" type="button" onClick={browseTemplateDirectory}><Icon name="folder" />Vorlagenordner wählen</button></div><small>Dieser Ordner wird später in einen neuen Projektordner kopiert.</small></div>
              <div className="form-grid form-grid--2">
                <div className="form-field"><label htmlFor="project-template-tags">Standard-Tags</label><input id="project-template-tags" value={projectTemplateTags} onChange={(event) => setProjectTemplateTags(event.target.value)} placeholder="spring, backend, java" /></div>
                <div className="form-field"><label htmlFor="project-template-editor">Standard-IDE</label><select id="project-template-editor" value={projectTemplateEditorId} onChange={(event) => setProjectTemplateEditorId(event.target.value)}><option value="">Keine Vorgabe</option>{editors.filter((editor) => editor.enabled).map((editor) => <option key={editor.id} value={editor.id}>{editor.name}</option>)}</select></div>
              </div>
              <div className="form-actions">{editingProjectTemplateId && <button className="button button--ghost" type="button" onClick={resetProjectTemplateForm}>Bearbeitung abbrechen</button>}<button className="button button--primary" type="submit"><Icon name={editingProjectTemplateId ? "check" : "plus"} />{editingProjectTemplateId ? "Vorlage speichern" : "Vorlage hinzufügen"}</button></div>
            </form>
            <div className="settings-card">
              <h3>Gespeicherte Projektvorlagen</h3>
              {projectTemplates.length ? <div className="template-settings-list">{projectTemplates.map((templateEntry) => (
                <article key={templateEntry.id}>
                  <div className="template-settings-list__icon"><Icon name="layers" /></div>
                  <div><strong>{templateEntry.name}</strong><small>{templateEntry.description || "Keine Beschreibung"}</small><code>{templateEntry.sourcePath}</code>{templateEntry.tags.length > 0 && <span>{templateEntry.tags.join(" · ")}</span>}</div>
                  <div className="template-settings-list__actions"><button className="button button--ghost button--small" type="button" onClick={() => editProjectTemplate(templateEntry)}><Icon name="edit" />Bearbeiten</button><button className="button button--ghost button--small button--danger-text" type="button" onClick={() => deleteProjectTemplate(templateEntry)}><Icon name="trash" />Entfernen</button></div>
                </article>
              ))}</div> : <div className="empty-state empty-state--compact"><Icon name="layers" /><p>Noch keine eigene Vorlage gespeichert.</p><small>Die eingebauten Vorlagen Node.js, React, Spring Boot, Python und Rust stehen trotzdem immer zur Verfügung.</small></div>}
            </div>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__header"><div><Icon name="terminal" /><span><strong>Terminal & Projektordner</strong><small>Standardwerte für neue und vorhandene Projekte</small></span></div></div>
          <div className="form-grid form-grid--2">
            <div className="form-field"><label htmlFor="default-project-dir">Standard-Projektordner</label><div className="input-action-row"><input id="default-project-dir" value={settings.defaultProjectDir} onChange={(event) => onSettingsChange({ ...settings, defaultProjectDir: event.target.value })} placeholder="C:\\Users\\du\\Projects" /><button className="button button--secondary" type="button" onClick={browseDefaultDirectory}><Icon name="folder" />Ordner wählen</button></div><small>Dieser Ordner wird beim Erstellen neuer Projekte vorausgewählt.</small></div>
            <div className="form-field"><label htmlFor="terminal-command">Terminal-Startbefehl (optional)</label><input id="terminal-command" value={settings.terminalCommand} onChange={(event) => onSettingsChange({ ...settings, terminalCommand: event.target.value })} placeholder={'wt.exe -d "{projectPath}"'} /><small>Leer lassen, um das Standardterminal des Betriebssystems zu verwenden.</small></div>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__header"><div><Icon name="download" /><span><strong>Backup & Sicherheit</strong><small>Alle Projekte, IDEs, Workspaces und Vorlagen sichern</small></span></div></div>
          <label className="checkbox-row"><input type="checkbox" checked={settings.confirmImportedCommands} onChange={(event) => onSettingsChange({ ...settings, confirmImportedCommands: event.target.checked })} /><span><strong>Importierte Commands vor dem ersten Start bestätigen</strong><small>Verhindert, dass unbekannte Befehle versehentlich ausgeführt werden.</small></span></label>
          <div className="button-row"><button className="button button--secondary" type="button" onClick={onExport}><Icon name="download" />Backup als JSON exportieren</button><button className="button button--secondary" type="button" onClick={onImport}><Icon name="upload" />Backup aus JSON importieren</button><button className="button button--ghost" type="button" onClick={onResetOnboarding}><Icon name="refresh" />Einführung erneut anzeigen</button></div>
        </section>
      </div>
    </Modal>
  );
}
