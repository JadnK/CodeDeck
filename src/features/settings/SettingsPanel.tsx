import { useEffect, useState } from "react";
import { Icon, type IconName } from "../../shared/components/Icon";
import { Modal } from "../../shared/components/Modal";
import { useI18n } from "../../shared/i18n/I18n";
import {
  chooseDirectory,
  detectEditors,
  getDesktopDirectory,
  launchTemplate,
} from "../../shared/lib/tauri";
import { createId } from "../../shared/lib/storage";
import { mergeEditorSuggestions } from "../../shared/lib/editors";
import type {
  AppSettings,
  CustomProjectTemplate,
  Editor,
  EditorSuggestion,
} from "../../shared/types/models";

export type SettingsSection = "general" | "editors" | "templates" | "projects" | "updates" | "backup";

type SettingsPanelProps = {
  open: boolean;
  editors: Editor[];
  projectTemplates: CustomProjectTemplate[];
  settings: AppSettings;
  currentVersion: string;
  checkingForUpdates: boolean;
  initialSection?: SettingsSection;
  onClose: () => void;
  onEditorsChange: (editors: Editor[]) => void;
  onProjectTemplatesChange: (templates: CustomProjectTemplate[]) => void;
  onSettingsChange: (settings: AppSettings) => void;
  onExport: () => void;
  onImport: () => void;
  onResetOnboarding: () => void;
  onCheckForUpdates: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

type SettingsNavItem = {
  id: SettingsSection;
  icon: IconName;
  label: string;
  description: string;
};

export function SettingsPanel({
  open,
  editors,
  projectTemplates,
  settings,
  currentVersion,
  checkingForUpdates,
  initialSection = "general",
  onClose,
  onEditorsChange,
  onProjectTemplatesChange,
  onSettingsChange,
  onExport,
  onImport,
  onResetOnboarding,
  onCheckForUpdates,
  onSuccess,
  onError,
}: SettingsPanelProps) {
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState('code "{projectPath}"');
  const [editingId, setEditingId] = useState<string>();
  const [suggestions, setSuggestions] = useState<EditorSuggestion[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [detectionFinished, setDetectionFinished] = useState(false);
  const [testingEditorId, setTestingEditorId] = useState<string>();

  const [projectTemplateName, setProjectTemplateName] = useState("");
  const [projectTemplateDescription, setProjectTemplateDescription] = useState("");
  const [projectTemplatePath, setProjectTemplatePath] = useState("");
  const [projectTemplateEditorId, setProjectTemplateEditorId] = useState("");
  const [editingProjectTemplateId, setEditingProjectTemplateId] = useState<string>();

  const navItems: SettingsNavItem[] = [
    {
      id: "general",
      icon: "settings",
      label: t("Allgemein", "General"),
      description: t("Sprache & Darstellung", "Language & appearance"),
    },
    {
      id: "editors",
      icon: "code",
      label: t("IDEs & Editoren", "IDEs & editors"),
      description: t("Startbefehle verwalten", "Manage launch commands"),
    },
    {
      id: "templates",
      icon: "layers",
      label: t("Projektvorlagen", "Project templates"),
      description: t("Eigene Grundgerüste", "Custom starters"),
    },
    {
      id: "projects",
      icon: "terminal",
      label: t("Projekte & Terminal", "Projects & terminal"),
      description: t("Ordner und Standardwerte", "Folders and defaults"),
    },
    {
      id: "updates",
      icon: "refresh",
      label: t("Updates", "Updates"),
      description: t("Version & Aktualisierung", "Version & updates"),
    },
    {
      id: "backup",
      icon: "download",
      label: t("Backup & Sicherheit", "Backup & security"),
      description: t("Import, Export, Schutz", "Import, export, safety"),
    },
  ];

  useEffect(() => {
    if (!open) return;
    setActiveSection(initialSection);
    resetEditorForm();
    resetProjectTemplateForm();
    setSuggestions([]);
    setDetectionFinished(false);
  }, [open, initialSection]);

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
    setDetectionFinished(false);
    try {
      const found = await detectEditors();
      const merged = mergeEditorSuggestions(editors, found);
      const changedCount = merged.filter((editor, index) => {
        const previous = editors[index];
        return !previous || previous.commandTemplate !== editor.commandTemplate;
      }).length;
      onEditorsChange(merged);
      setSuggestions([]);
      onSettingsChange({ ...settings, ideDetectionComplete: true });
      setDetectionFinished(true);
      if (found.length > 0) {
        onSuccess(t(
          changedCount > 0
            ? `${changedCount} IDE-Eintrag${changedCount === 1 ? " wurde" : "e wurden"} hinzugefügt oder repariert.`
            : "Die gespeicherten IDE-Pfade sind bereits aktuell.",
          changedCount > 0
            ? `${changedCount} IDE entr${changedCount === 1 ? "y was" : "ies were"} added or repaired.`
            : "The saved IDE paths are already up to date.",
        ));
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setDetecting(false);
    }
  }

  function addSuggestion(suggestion: EditorSuggestion) {
    if (editors.some((editor) =>
      editor.id === suggestion.id ||
      editor.commandTemplate.toLowerCase() === suggestion.commandTemplate.toLowerCase(),
    )) return;
    onEditorsChange([...editors, { ...suggestion, enabled: true, detected: true }]);
    setSuggestions((current) => current.filter((entry) => entry.id !== suggestion.id));
    onSettingsChange({ ...settings, ideDetectionComplete: true });
  }

  async function testEditor(editor: Editor) {
    setTestingEditorId(editor.id);
    try {
      const desktopPath = await getDesktopDirectory();
      await launchTemplate(editor.commandTemplate, desktopPath, "Desktop");
      onSuccess(t(
        `${editor.name} wurde mit deinem Desktop-Ordner geöffnet.`,
        `${editor.name} was opened with your Desktop folder.`,
      ));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setTestingEditorId(undefined);
    }
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
      <div className="settings-layout">
        <aside className="settings-sidebar">
          <div className="settings-sidebar__intro">
            <strong>Code Deck</strong>
            <small>{t("Anwendung konfigurieren", "Configure application")}</small>
          </div>
          <nav className="settings-nav" aria-label={t("Einstellungsbereiche", "Settings sections")}>
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={activeSection === item.id ? "active" : ""}
                onClick={() => setActiveSection(item.id)}
                aria-current={activeSection === item.id ? "page" : undefined}
              >
                <Icon name={item.icon} />
                <span><strong>{item.label}</strong><small>{item.description}</small></span>
              </button>
            ))}
          </nav>
          <div className="settings-sidebar__version">
            <span>{t("Installiert", "Installed")}</span>
            <strong>v{currentVersion}</strong>
          </div>
        </aside>

        <div className="settings-content">
          {activeSection === "general" && (
            <section className="settings-page">
              <div className="settings-page__header">
                <Icon name="settings" />
                <div><p className="eyebrow">Code Deck</p><h3>{t("Allgemein", "General")}</h3><small>{t("Sprache und Darstellung der Anwendung", "Application language and appearance")}</small></div>
              </div>
              <div className="settings-section settings-section--plain">
                <div className="form-grid form-grid--2 settings-preferences">
                  <div className="form-field">
                    <label htmlFor="app-language">{t("Sprache", "Language")}</label>
                    <select id="app-language" value={settings.language} onChange={(event) => onSettingsChange({ ...settings, language: event.target.value as AppSettings["language"] })}>
                      <option value="de">Deutsch</option>
                      <option value="en">English</option>
                    </select>
                    <small>{t("Die Oberfläche wird sofort umgestellt und lokal gespeichert.", "The interface updates immediately and is stored locally.")}</small>
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
                    <small>{t("System folgt automatisch der Darstellung des Betriebssystems.", "System automatically follows the operating-system appearance.")}</small>
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeSection === "editors" && (
            <section className="settings-page">
              <div className="settings-page__header settings-page__header--actions">
                <Icon name="code" />
                <div><p className="eyebrow">Launcher</p><h3>{t("IDEs & Editoren", "IDEs & editors")}</h3><small>{t("Legt fest, womit Projekte geöffnet werden", "Controls which applications open projects")}</small></div>
                <button className="button button--ghost button--small" type="button" onClick={runDetection} disabled={detecting}><Icon name="refresh" />{detecting ? t("Suche läuft…", "Detecting…") : t("IDEs erkennen", "Detect IDEs")}</button>
              </div>
              <div className="settings-help"><Icon name="info" /><p><strong>{t("Command-Template", "Command template")}:</strong> {t("Ein Startbefehl mit dem Platzhalter", "A launch command containing the placeholder")} <code>{'{projectPath}'}</code>, {t("zum Beispiel", "for example")} <code>code "{'{projectPath}'}"</code>.</p></div>
              {suggestions.length > 0 && <div className="suggestion-row">{suggestions.map((suggestion) => <button key={suggestion.id} type="button" onClick={() => addSuggestion(suggestion)}><Icon name="plus" /><span><strong>{t(`${suggestion.name} hinzufügen`, `Add ${suggestion.name}`)}</strong><code>{suggestion.commandTemplate}</code></span></button>)}</div>}
              {detectionFinished && suggestions.length === 0 && <div className="settings-inline-status"><Icon name="check" /><span>{t("IDE-Suche abgeschlossen. Gefundene Pfade wurden übernommen oder repariert.", "IDE scan completed. Detected paths were added or repaired.")}</span></div>}
              <div className="editor-settings-grid">
                <form className="settings-card" onSubmit={submitEditor}>
                  <h3>{editingId ? t("IDE bearbeiten", "Edit IDE") : t("Weitere IDE hinzufügen", "Add another IDE")}</h3>
                  <div className="form-field"><label htmlFor="editor-name">{t("Anzeigename", "Display name")}</label><input id="editor-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="VS Code" /></div>
                  <div className="form-field"><label htmlFor="editor-template">{t("Startbefehl", "Launch command")}</label><input id="editor-template" value={template} onChange={(event) => setTemplate(event.target.value)} placeholder={'code "{projectPath}"'} /><small>{t("Platzhalter", "Placeholders")}: {'{projectPath}'} {t("und", "and")} {'{projectName}'}</small></div>
                  <div className="form-actions">{editingId && <button className="button button--ghost" type="button" onClick={resetEditorForm}>{t("Abbrechen", "Cancel")}</button>}<button className="button button--primary" type="submit"><Icon name={editingId ? "check" : "plus"} />{editingId ? t("Speichern", "Save") : t("IDE hinzufügen", "Add IDE")}</button></div>
                </form>
                <div className="settings-card">
                  <h3>{t("Gespeicherte IDEs", "Saved IDEs")}</h3>
                  <div className="editor-list">
                    {editors.map((editor) => (
                      <article key={editor.id} className="editor-row editor-row--clear">
                        <label className="switch" title={editor.enabled ? t("IDE ist aktiv", "IDE is enabled") : t("IDE ist deaktiviert", "IDE is disabled")}><input type="checkbox" checked={editor.enabled} onChange={(event) => onEditorsChange(editors.map((entry) => entry.id === editor.id ? { ...entry, enabled: event.target.checked } : entry))} /><span /></label>
                        <div><strong>{editor.name}</strong><code>{editor.commandTemplate}</code><small>{editor.enabled ? t("Kann Projekten zugeordnet werden", "Can be assigned to projects") : t("Bei der Projektauswahl ausgeblendet", "Hidden from project selection")}</small></div>
                        <button className="button button--secondary button--small" type="button" onClick={() => void testEditor(editor)} disabled={testingEditorId === editor.id}><Icon name={testingEditorId === editor.id ? "refresh" : "play"} />{testingEditorId === editor.id ? t("Test läuft…", "Testing…") : t("Testen", "Test")}</button>
                        <button className="button button--ghost button--small" type="button" onClick={() => edit(editor)}><Icon name="edit" />{t("Bearbeiten", "Edit")}</button>
                        <button className="button button--ghost button--small button--danger-text" type="button" onClick={() => onEditorsChange(editors.filter((entry) => entry.id !== editor.id))}><Icon name="trash" />{t("Entfernen", "Remove")}</button>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeSection === "templates" && (
            <section className="settings-page" id="project-template-settings">
              <div className="settings-page__header">
                <Icon name="layers" />
                <div><p className="eyebrow">Scaffolding</p><h3>{t("Eigene Projektvorlagen", "Custom project templates")}</h3><small>{t("Lokale Ordner als wiederverwendbare Grundgerüste", "Reusable starters from local folders")}</small></div>
              </div>
              <div className="settings-help"><Icon name="info" /><p>{t("Beim Erstellen kopiert Code Deck den Inhalt des Quellordners. Generierte Ordner wie", "When creating a project, Code Deck copies the source folder. Generated folders such as")} <code>node_modules</code>, <code>.git</code>, <code>target</code>, <code>dist</code> {t("und", "and")} <code>build</code> {t("werden ausgelassen.", "are skipped.")}</p></div>
              <div className="editor-settings-grid">
                <form className="settings-card" onSubmit={submitProjectTemplate}>
                  <h3>{editingProjectTemplateId ? t("Projektvorlage bearbeiten", "Edit project template") : t("Projektvorlage anlegen", "Create project template")}</h3>
                  <div className="form-field"><label htmlFor="project-template-name">{t("Name der Vorlage", "Template name")}</label><input id="project-template-name" value={projectTemplateName} onChange={(event) => setProjectTemplateName(event.target.value)} placeholder="Meine Spring-Basis" /></div>
                  <div className="form-field"><label htmlFor="project-template-description">{t("Kurze Erklärung", "Short description")}</label><input id="project-template-description" value={projectTemplateDescription} onChange={(event) => setProjectTemplateDescription(event.target.value)} placeholder="Spring API mit Security und Docker Compose" /></div>
                  <div className="form-field"><label htmlFor="project-template-path">{t("Quellordner", "Source folder")}</label><div className="input-action-row"><input id="project-template-path" value={projectTemplatePath} onChange={(event) => setProjectTemplatePath(event.target.value)} placeholder="C:\\Users\\du\\Templates\\spring-api" /><button className="button button--secondary" type="button" onClick={browseTemplateDirectory}><Icon name="folder" />{t("Ordner wählen", "Choose folder")}</button></div><small>{t("Der Quellordner selbst bleibt unverändert.", "The source folder itself remains unchanged.")}</small></div>
                  <div className="form-field"><label htmlFor="project-template-editor">{t("Standard-IDE", "Default IDE")}</label><select id="project-template-editor" value={projectTemplateEditorId} onChange={(event) => setProjectTemplateEditorId(event.target.value)}><option value="">{t("Keine Vorgabe", "No default")}</option>{editors.filter((editor) => editor.enabled).map((editor) => <option key={editor.id} value={editor.id}>{editor.name}</option>)}</select></div>
                  <div className="form-actions">{editingProjectTemplateId && <button className="button button--ghost" type="button" onClick={resetProjectTemplateForm}>{t("Abbrechen", "Cancel")}</button>}<button className="button button--primary" type="submit"><Icon name={editingProjectTemplateId ? "check" : "plus"} />{editingProjectTemplateId ? t("Vorlage speichern", "Save template") : t("Vorlage hinzufügen", "Add template")}</button></div>
                </form>
                <div className="settings-card">
                  <h3>{t("Gespeicherte Projektvorlagen", "Saved project templates")}</h3>
                  {projectTemplates.length ? <div className="template-settings-list">{projectTemplates.map((templateEntry) => (
                    <article key={templateEntry.id}>
                      <div className="template-settings-list__icon"><Icon name="layers" /></div>
                      <div><strong>{templateEntry.name}</strong><small>{templateEntry.description || t("Keine Beschreibung", "No description")}</small><code>{templateEntry.sourcePath}</code></div>
                      <div className="template-settings-list__actions"><button className="button button--ghost button--small" type="button" onClick={() => editProjectTemplate(templateEntry)}><Icon name="edit" />{t("Bearbeiten", "Edit")}</button><button className="button button--ghost button--small button--danger-text" type="button" onClick={() => deleteProjectTemplate(templateEntry)}><Icon name="trash" />{t("Entfernen", "Remove")}</button></div>
                    </article>
                  ))}</div> : <div className="empty-state empty-state--compact"><Icon name="layers" /><p>{t("Noch keine eigene Vorlage gespeichert.", "No custom template saved yet.")}</p><small>{t("Die eingebauten Vorlagen bleiben immer verfügbar.", "Built-in templates remain available.")}</small></div>}
                </div>
              </div>
            </section>
          )}

          {activeSection === "projects" && (
            <section className="settings-page">
              <div className="settings-page__header">
                <Icon name="terminal" />
                <div><p className="eyebrow">Defaults</p><h3>{t("Projekte & Terminal", "Projects & terminal")}</h3><small>{t("Standardordner und Terminal-Startbefehl", "Default folder and terminal launch command")}</small></div>
              </div>
              <div className="settings-section settings-section--plain">
                <div className="form-field"><label htmlFor="default-project-dir">{t("Standard-Projektordner", "Default project folder")}</label><div className="input-action-row"><input id="default-project-dir" value={settings.defaultProjectDir} onChange={(event) => onSettingsChange({ ...settings, defaultProjectDir: event.target.value })} placeholder="C:\\Users\\du\\Projects" /><button className="button button--secondary" type="button" onClick={browseDefaultDirectory}><Icon name="folder" />{t("Ordner wählen", "Choose folder")}</button></div><small>{t("Dieser Ordner wird beim Erstellen neuer Projekte vorausgewählt.", "This folder is preselected when creating new projects.")}</small></div>
                <div className="form-field"><label htmlFor="terminal-command">{t("Terminal-Startbefehl (optional)", "Terminal launch command (optional)")}</label><input id="terminal-command" value={settings.terminalCommand} onChange={(event) => onSettingsChange({ ...settings, terminalCommand: event.target.value })} placeholder={'wt.exe -d "{projectPath}"'} /><small>{t("Leer lassen, um das Standardterminal des Betriebssystems zu verwenden.", "Leave empty to use the operating-system default terminal.")}</small></div>
              </div>
            </section>
          )}

          {activeSection === "updates" && (
            <section className="settings-page">
              <div className="settings-page__header">
                <Icon name="refresh" />
                <div><p className="eyebrow">Release</p><h3>{t("Updates", "Updates")}</h3><small>{t("Neue Versionen sicher über GitHub Releases installieren", "Install new versions securely through GitHub Releases")}</small></div>
              </div>
              <div className="settings-section settings-section--plain">
                <div className="update-settings-row">
                  <div className="update-settings-row__version"><span>{t("Installierte Version", "Installed version")}</span><strong>{currentVersion}</strong></div>
                  <label className="checkbox-row checkbox-row--compact"><input type="checkbox" checked={settings.checkForUpdatesOnStartup} onChange={(event) => onSettingsChange({ ...settings, checkForUpdatesOnStartup: event.target.checked })} /><span><strong>{t("Bei jedem Start nach Updates suchen", "Check for updates on every launch")}</strong><small>{t("Nur veröffentlichte und signierte Releases werden angeboten.", "Only published and signed releases are offered.")}</small></span></label>
                  <button className="button button--secondary" type="button" onClick={onCheckForUpdates} disabled={checkingForUpdates}><Icon name="refresh" />{checkingForUpdates ? t("Update wird gesucht…", "Checking for update…") : t("Jetzt prüfen", "Check now")}</button>
                </div>
              </div>
            </section>
          )}

          {activeSection === "backup" && (
            <section className="settings-page">
              <div className="settings-page__header">
                <Icon name="download" />
                <div><p className="eyebrow">Local data</p><h3>{t("Backup & Sicherheit", "Backup & security")}</h3><small>{t("Projekte, IDEs, Startsets und Vorlagen sichern", "Back up projects, IDEs, launch sets and templates")}</small></div>
              </div>
              <div className="settings-section settings-section--plain">
                <label className="checkbox-row"><input type="checkbox" checked={settings.confirmImportedCommands} onChange={(event) => onSettingsChange({ ...settings, confirmImportedCommands: event.target.checked })} /><span><strong>{t("Importierte Commands vor dem ersten Start bestätigen", "Confirm imported commands before first run")}</strong><small>{t("Verhindert, dass unbekannte Befehle versehentlich ausgeführt werden.", "Prevents unknown commands from being run accidentally.")}</small></span></label>
                <div className="settings-backup-actions"><button className="button button--secondary" type="button" onClick={onExport}><Icon name="download" />{t("JSON exportieren", "Export JSON")}</button><button className="button button--secondary" type="button" onClick={onImport}><Icon name="upload" />{t("JSON importieren", "Import JSON")}</button><button className="button button--ghost" type="button" onClick={onResetOnboarding}><Icon name="refresh" />{t("Einführung erneut anzeigen", "Show onboarding again")}</button></div>
              </div>
            </section>
          )}
        </div>
      </div>
    </Modal>
  );
}
