import { useEffect, useState } from "react";
import { Icon } from "../../shared/components/Icon";
import { Modal } from "../../shared/components/Modal";
import { useI18n } from "../../shared/i18n/I18n";
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
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [template, setTemplate] = useState('code "{projectPath}"');
  const [editingId, setEditingId] = useState<string>();
  const [suggestions, setSuggestions] = useState<EditorSuggestion[]>([]);
  const [detecting, setDetecting] = useState(false);

  const [projectTemplateName, setProjectTemplateName] = useState("");
  const [projectTemplateDescription, setProjectTemplateDescription] = useState("");
  const [projectTemplatePath, setProjectTemplatePath] = useState("");
  const [projectTemplateEditorId, setProjectTemplateEditorId] = useState("");
  const [editingProjectTemplateId, setEditingProjectTemplateId] = useState<string>();

  useEffect(() => {
    if (!open) return;
    resetEditorForm();
    resetProjectTemplateForm();
  }, [open]);

  function resetEditorForm() {
    setName("");
    setTemplate('code "{projectPath}"');
    setEditingId(undefined);
  }

  function resetProjectTemplateForm() {
    setProjectTemplateName("");
    setProjectTemplateDescription("");
    setProjectTemplatePath("");
    setProjectTemplateEditorId("");
    setEditingProjectTemplateId(undefined);
  }

  function submitEditor(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !template.trim()) {
      onError(t("Bitte gib einen IDE-Namen und ein Command-Template an.", "Enter an IDE name and a command template."));
      return;
    }
    if (!template.includes("{projectPath}")) {
      onError(t("Das Command-Template muss den Platzhalter {projectPath} enthalten.", "The command template must include the {projectPath} placeholder."));
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
        setProjectTemplateName((current) => current || path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || t("Eigene Vorlage", "Custom template"));
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }

  function submitProjectTemplate(event: React.FormEvent) {
    event.preventDefault();
    if (!projectTemplateName.trim() || !projectTemplatePath.trim()) {
      onError(t("Bitte gib einen Vorlagennamen an und wähle einen Quellordner.", "Enter a template name and choose a source folder."));
      return;
    }
    const now = new Date().toISOString();
    const entry: CustomProjectTemplate = {
      id: editingProjectTemplateId ?? createId(),
      name: projectTemplateName.trim(),
      description: projectTemplateDescription.trim(),
      sourcePath: projectTemplatePath.trim(),
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
    setProjectTemplateEditorId(templateEntry.preferredEditorId ?? "");
  }

  function deleteProjectTemplate(templateEntry: CustomProjectTemplate) {
    if (!window.confirm(t(`Vorlage „${templateEntry.name}“ aus Code Deck entfernen? Der Quellordner bleibt unverändert.`, `Remove template “${templateEntry.name}” from Code Deck? The source folder will remain unchanged.`))) return;
    onProjectTemplatesChange(projectTemplates.filter((entry) => entry.id !== templateEntry.id));
    if (editingProjectTemplateId === templateEntry.id) resetProjectTemplateForm();
  }

  return (
    <Modal open={open} onClose={onClose} title={t("Einstellungen", "Settings")} size="large">
      <div className="settings-sections">
        <section className="settings-section">
          <div className="settings-section__header"><div><Icon name="settings" /><span><strong>{t("Oberfläche", "Interface")}</strong><small>{t("Sprache und Darstellung der Anwendung", "Application language and appearance")}</small></span></div></div>
          <div className="form-grid form-grid--2 settings-preferences">
            <div className="form-field">
              <label htmlFor="app-language">{t("Sprache", "Language")}</label>
              <select id="app-language" value={settings.language} onChange={(event) => onSettingsChange({ ...settings, language: event.target.value as AppSettings["language"] })}>
                <option value="de">Deutsch</option>
                <option value="en">English</option>
              </select>
              <small>{t("Die Oberfläche wird sofort umgestellt und die Auswahl lokal gespeichert.", "The interface updates immediately and the selection is stored locally.")}</small>
            </div>
            <div className="form-field">
              <label>{t("Darstellung", "Appearance")}</label>
              <div className="segmented-control">
                {(["dark", "light", "system"] as const).map((theme) => (
                  <button type="button" className={settings.theme === theme ? "active" : ""} key={theme} onClick={() => onSettingsChange({ ...settings, theme })}>
                    <Icon name={theme === "light" ? "sun" : theme === "dark" ? "moon" : "settings"} />
                    {theme === "dark" ? t("Dunkel", "Dark") : theme === "light" ? t("Hell", "Light") : t("System", "System")}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__header">
            <div><Icon name="code" /><span><strong>{t("IDEs & Editoren", "IDEs & editors")}</strong><small>{t("Legt fest, womit der Button „In IDE öffnen“ ein Projekt startet", "Controls which application opens a project")}</small></span></div>
            <button className="button button--ghost button--small" type="button" onClick={runDetection} disabled={detecting}><Icon name="refresh" />{detecting ? t("Installierte IDEs werden gesucht…", "Detecting installed IDEs…") : t("Installierte IDEs erkennen", "Detect installed IDEs")}</button>
          </div>
          <div className="settings-help"><Icon name="info" /><p><strong>{t("Command-Template", "Command template")}:</strong> {t("Ein Betriebssystem-Befehl, der den Projektpfad enthält. Beispiel:", "An operating-system command containing the project path. Example:")} <code>code "{'{projectPath}'}"</code>. {t("Code Deck ersetzt den Platzhalter beim Öffnen.", "Code Deck replaces the placeholder when opening the project.")}</p></div>
          {suggestions.length > 0 && <div className="suggestion-row">{suggestions.map((suggestion) => <button key={suggestion.id} type="button" onClick={() => addSuggestion(suggestion)}><Icon name="plus" /><span><strong>{t(`${suggestion.name} hinzufügen`, `Add ${suggestion.name}`)}</strong><code>{suggestion.commandTemplate}</code></span></button>)}</div>}
          <div className="editor-settings-grid">
            <form className="settings-card" onSubmit={submitEditor}>
              <h3>{editingId ? t("IDE bearbeiten", "Edit IDE") : t("Weitere IDE hinzufügen", "Add another IDE")}</h3>
              <div className="form-field"><label htmlFor="editor-name">{t("Anzeigename", "Display name")}</label><input id="editor-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="VS Code" /></div>
              <div className="form-field"><label htmlFor="editor-template">{t("Startbefehl", "Launch command")}</label><input id="editor-template" value={template} onChange={(event) => setTemplate(event.target.value)} placeholder={'code "{projectPath}"'} /><small>{t("Verfügbare Platzhalter", "Available placeholders")}: {'{projectPath}'} {t("und", "and")} {'{projectName}'}</small></div>
              <div className="form-actions">{editingId && <button className="button button--ghost" type="button" onClick={resetEditorForm}>{t("Bearbeitung abbrechen", "Cancel editing")}</button>}<button className="button button--primary" type="submit"><Icon name={editingId ? "check" : "plus"} />{editingId ? t("IDE-Änderungen speichern", "Save IDE changes") : t("IDE hinzufügen", "Add IDE")}</button></div>
            </form>
            <div className="settings-card">
              <h3>{t("Gespeicherte IDEs", "Saved IDEs")}</h3>
              <div className="editor-list">
                {editors.map((editor) => (
                  <article key={editor.id} className="editor-row editor-row--clear">
                    <label className="switch" title={editor.enabled ? t("IDE ist aktiv", "IDE is enabled") : t("IDE ist deaktiviert", "IDE is disabled")}><input type="checkbox" checked={editor.enabled} onChange={(event) => onEditorsChange(editors.map((entry) => entry.id === editor.id ? { ...entry, enabled: event.target.checked } : entry))} /><span /></label>
                    <div><strong>{editor.name}</strong><code>{editor.commandTemplate}</code><small>{editor.enabled ? t("Kann Projekten zugeordnet werden", "Can be assigned to projects") : t("Wird bei der Projektauswahl ausgeblendet", "Hidden from project selection")}</small></div>
                    <button className="button button--ghost button--small" type="button" onClick={() => edit(editor)}><Icon name="edit" />{t("Bearbeiten", "Edit")}</button>
                    <button className="button button--ghost button--small button--danger-text" type="button" onClick={() => onEditorsChange(editors.filter((entry) => entry.id !== editor.id))}><Icon name="trash" />{t("Entfernen", "Remove")}</button>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="settings-section" id="project-template-settings">
          <div className="settings-section__header"><div><Icon name="layers" /><span><strong>{t("Eigene Projektvorlagen", "Custom project templates")}</strong><small>{t("Einen lokalen Ordner als wiederverwendbares Projekt-Grundgerüst speichern", "Save a local folder as a reusable project starter")}</small></span></div></div>
          <div className="settings-help"><Icon name="info" /><p>{t("Beim Erstellen eines Projekts kopiert Code Deck den Inhalt des Quellordners. Große oder generierte Ordner wie", "When creating a project, Code Deck copies the source folder contents. Large or generated folders such as")} <code>node_modules</code>, <code>.git</code>, <code>target</code>, <code>dist</code> {t("und", "and")} <code>build</code> {t("werden ausgelassen. Der Quellordner selbst bleibt unverändert.", "are skipped. The source folder itself remains unchanged.")}</p></div>
          <div className="editor-settings-grid">
            <form className="settings-card" onSubmit={submitProjectTemplate}>
              <h3>{editingProjectTemplateId ? t("Projektvorlage bearbeiten", "Edit project template") : t("Projektvorlage anlegen", "Create project template")}</h3>
              <div className="form-field"><label htmlFor="project-template-name">{t("Name der Vorlage", "Template name")}</label><input id="project-template-name" value={projectTemplateName} onChange={(event) => setProjectTemplateName(event.target.value)} placeholder="Meine Spring-Basis" /></div>
              <div className="form-field"><label htmlFor="project-template-description">{t("Kurze Erklärung", "Short description")}</label><input id="project-template-description" value={projectTemplateDescription} onChange={(event) => setProjectTemplateDescription(event.target.value)} placeholder="Spring API mit Security und Docker Compose" /></div>
              <div className="form-field"><label htmlFor="project-template-path">{t("Quellordner", "Source folder")}</label><div className="input-action-row"><input id="project-template-path" value={projectTemplatePath} onChange={(event) => setProjectTemplatePath(event.target.value)} placeholder="C:\\Users\\du\\Templates\\spring-api" /><button className="button button--secondary" type="button" onClick={browseTemplateDirectory}><Icon name="folder" />{t("Vorlagenordner wählen", "Choose template folder")}</button></div><small>{t("Dieser Ordner wird später in einen neuen Projektordner kopiert.", "This folder will be copied into a new project folder later.")}</small></div>
              <div className="form-field"><label htmlFor="project-template-editor">{t("Standard-IDE", "Default IDE")}</label><select id="project-template-editor" value={projectTemplateEditorId} onChange={(event) => setProjectTemplateEditorId(event.target.value)}><option value="">{t("Keine Vorgabe", "No default")}</option>{editors.filter((editor) => editor.enabled).map((editor) => <option key={editor.id} value={editor.id}>{editor.name}</option>)}</select></div>
              <div className="form-actions">{editingProjectTemplateId && <button className="button button--ghost" type="button" onClick={resetProjectTemplateForm}>{t("Bearbeitung abbrechen", "Cancel editing")}</button>}<button className="button button--primary" type="submit"><Icon name={editingProjectTemplateId ? "check" : "plus"} />{editingProjectTemplateId ? t("Vorlage speichern", "Save template") : t("Vorlage hinzufügen", "Add template")}</button></div>
            </form>
            <div className="settings-card">
              <h3>{t("Gespeicherte Projektvorlagen", "Saved project templates")}</h3>
              {projectTemplates.length ? <div className="template-settings-list">{projectTemplates.map((templateEntry) => (
                <article key={templateEntry.id}>
                  <div className="template-settings-list__icon"><Icon name="layers" /></div>
                  <div><strong>{templateEntry.name}</strong><small>{templateEntry.description || t("Keine Beschreibung", "No description")}</small><code>{templateEntry.sourcePath}</code></div>
                  <div className="template-settings-list__actions"><button className="button button--ghost button--small" type="button" onClick={() => editProjectTemplate(templateEntry)}><Icon name="edit" />{t("Bearbeiten", "Edit")}</button><button className="button button--ghost button--small button--danger-text" type="button" onClick={() => deleteProjectTemplate(templateEntry)}><Icon name="trash" />{t("Entfernen", "Remove")}</button></div>
                </article>
              ))}</div> : <div className="empty-state empty-state--compact"><Icon name="layers" /><p>{t("Noch keine eigene Vorlage gespeichert.", "No custom template saved yet.")}</p><small>{t("Die eingebauten Vorlagen Node.js, React, Spring Boot, Python und Rust stehen trotzdem immer zur Verfügung.", "The built-in Node.js, React, Spring Boot, Python and Rust templates are always available.")}</small></div>}
            </div>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__header"><div><Icon name="terminal" /><span><strong>{t("Terminal & Projektordner", "Terminal & project folders")}</strong><small>{t("Standardwerte für neue und vorhandene Projekte", "Defaults for new and existing projects")}</small></span></div></div>
          <div className="form-grid form-grid--2">
            <div className="form-field"><label htmlFor="default-project-dir">{t("Standard-Projektordner", "Default project folder")}</label><div className="input-action-row"><input id="default-project-dir" value={settings.defaultProjectDir} onChange={(event) => onSettingsChange({ ...settings, defaultProjectDir: event.target.value })} placeholder="C:\\Users\\du\\Projects" /><button className="button button--secondary" type="button" onClick={browseDefaultDirectory}><Icon name="folder" />{t("Ordner wählen", "Choose folder")}</button></div><small>{t("Dieser Ordner wird beim Erstellen neuer Projekte vorausgewählt.", "This folder is preselected when creating new projects.")}</small></div>
            <div className="form-field"><label htmlFor="terminal-command">{t("Terminal-Startbefehl (optional)", "Terminal launch command (optional)")}</label><input id="terminal-command" value={settings.terminalCommand} onChange={(event) => onSettingsChange({ ...settings, terminalCommand: event.target.value })} placeholder={'wt.exe -d "{projectPath}"'} /><small>{t("Leer lassen, um das Standardterminal des Betriebssystems zu verwenden.", "Leave empty to use the operating system default terminal.")}</small></div>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__header"><div><Icon name="download" /><span><strong>{t("Backup & Sicherheit", "Backup & security")}</strong><small>{t("Alle Projekte, IDEs, Workspaces und Vorlagen sichern", "Back up projects, IDEs, workspaces and templates")}</small></span></div></div>
          <label className="checkbox-row"><input type="checkbox" checked={settings.confirmImportedCommands} onChange={(event) => onSettingsChange({ ...settings, confirmImportedCommands: event.target.checked })} /><span><strong>{t("Importierte Commands vor dem ersten Start bestätigen", "Confirm imported commands before first run")}</strong><small>{t("Verhindert, dass unbekannte Befehle versehentlich ausgeführt werden.", "Prevents unknown commands from being run accidentally.")}</small></span></label>
          <div className="button-row"><button className="button button--secondary" type="button" onClick={onExport}><Icon name="download" />{t("Backup als JSON exportieren", "Export JSON backup")}</button><button className="button button--secondary" type="button" onClick={onImport}><Icon name="upload" />{t("Backup aus JSON importieren", "Import JSON backup")}</button><button className="button button--ghost" type="button" onClick={onResetOnboarding}><Icon name="refresh" />{t("Einführung erneut anzeigen", "Show onboarding again")}</button></div>
        </section>
      </div>
    </Modal>
  );
}
