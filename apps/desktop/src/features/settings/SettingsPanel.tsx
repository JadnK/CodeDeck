import { useEffect, useState } from "react";
import { Icon } from "../../shared/components/Icon";
import { Modal } from "../../shared/components/Modal";
import { chooseDirectory, detectEditors } from "../../shared/lib/tauri";
import { createId } from "../../shared/lib/storage";
import type { AppSettings, Editor, EditorSuggestion } from "../../shared/types/models";

type SettingsPanelProps = {
  open: boolean;
  editors: Editor[];
  settings: AppSettings;
  onClose: () => void;
  onEditorsChange: (editors: Editor[]) => void;
  onSettingsChange: (settings: AppSettings) => void;
  onExport: () => void;
  onImport: () => void;
  onResetOnboarding: () => void;
  onError: (message: string) => void;
};

export function SettingsPanel({
  open,
  editors,
  settings,
  onClose,
  onEditorsChange,
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

  useEffect(() => {
    if (!open) return;
    setName("");
    setTemplate('"{projectPath}"');
    setEditingId(undefined);
  }, [open]);

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
    setName("");
    setTemplate('"{projectPath}"');
    setEditingId(undefined);
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

  return (
    <Modal open={open} onClose={onClose} title="Einstellungen" eyebrow="Code Deck" size="large">
      <div className="settings-sections">
        <section className="settings-section">
          <div className="settings-section__header"><div><Icon name="sun" /><span><strong>Darstellung</strong><small>Theme und Oberfläche</small></span></div></div>
          <div className="segmented-control">
            {(["dark", "light", "system"] as const).map((theme) => (
              <button type="button" className={settings.theme === theme ? "active" : ""} key={theme} onClick={() => onSettingsChange({ ...settings, theme })}>
                <Icon name={theme === "light" ? "sun" : theme === "dark" ? "moon" : "settings"} />
                {theme === "dark" ? "Dunkel" : theme === "light" ? "Hell" : "System"}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__header"><div><Icon name="code" /><span><strong>IDEs & Editoren</strong><small>Globale Launcher mit Platzhaltern</small></span></div><button className="button button--ghost button--small" type="button" onClick={runDetection} disabled={detecting}><Icon name="refresh" />{detecting ? "Suche…" : "Automatisch erkennen"}</button></div>
          {suggestions.length > 0 && <div className="suggestion-row">{suggestions.map((suggestion) => <button key={suggestion.id} type="button" onClick={() => addSuggestion(suggestion)}><Icon name="plus" /><span><strong>{suggestion.name}</strong><code>{suggestion.commandTemplate}</code></span></button>)}</div>}
          <div className="editor-settings-grid">
            <form className="settings-card" onSubmit={submitEditor}>
              <h3>{editingId ? "IDE bearbeiten" : "IDE hinzufügen"}</h3>
              <div className="form-field"><label htmlFor="editor-name">Name</label><input id="editor-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="VS Code" /></div>
              <div className="form-field"><label htmlFor="editor-template">Command-Template</label><input id="editor-template" value={template} onChange={(event) => setTemplate(event.target.value)} placeholder={'code "{projectPath}"'} /><small>Platzhalter: {'{projectPath}'} und {'{projectName}'}</small></div>
              <div className="form-actions">{editingId && <button className="button button--ghost" type="button" onClick={() => { setEditingId(undefined); setName(""); setTemplate('"{projectPath}"'); }}>Abbrechen</button>}<button className="button button--primary" type="submit"><Icon name={editingId ? "check" : "plus"} />{editingId ? "Speichern" : "Hinzufügen"}</button></div>
            </form>
            <div className="settings-card">
              <h3>Gespeicherte IDEs</h3>
              <div className="editor-list">
                {editors.map((editor) => (
                  <article key={editor.id} className="editor-row">
                    <label className="switch"><input type="checkbox" checked={editor.enabled} onChange={(event) => onEditorsChange(editors.map((entry) => entry.id === editor.id ? { ...entry, enabled: event.target.checked } : entry))} /><span /></label>
                    <div><strong>{editor.name}</strong><code>{editor.commandTemplate}</code></div>
                    <button className="icon-button icon-button--small" type="button" onClick={() => edit(editor)}><Icon name="edit" /></button>
                    <button className="icon-button icon-button--small icon-button--danger" type="button" onClick={() => onEditorsChange(editors.filter((entry) => entry.id !== editor.id))}><Icon name="trash" /></button>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__header"><div><Icon name="terminal" /><span><strong>Terminal & Projekte</strong><small>Standardordner und optionaler Terminal-Befehl</small></span></div></div>
          <div className="form-grid form-grid--2">
            <div className="form-field"><label htmlFor="default-project-dir">Standard-Projektordner</label><div className="input-action-row"><input id="default-project-dir" value={settings.defaultProjectDir} onChange={(event) => onSettingsChange({ ...settings, defaultProjectDir: event.target.value })} placeholder="C:\\Users\\du\\Projects" /><button className="button button--secondary" type="button" onClick={browseDefaultDirectory}><Icon name="folder" />Wählen</button></div></div>
            <div className="form-field"><label htmlFor="terminal-command">Terminal-Template (optional)</label><input id="terminal-command" value={settings.terminalCommand} onChange={(event) => onSettingsChange({ ...settings, terminalCommand: event.target.value })} placeholder={'wt.exe -d "{projectPath}"'} /><small>Leer lassen, um das System-Terminal zu nutzen.</small></div>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__header"><div><Icon name="download" /><span><strong>Backup & Sicherheit</strong><small>Lokale Konfiguration importieren oder exportieren</small></span></div></div>
          <label className="checkbox-row"><input type="checkbox" checked={settings.confirmImportedCommands} onChange={(event) => onSettingsChange({ ...settings, confirmImportedCommands: event.target.checked })} /><span><strong>Importierte Commands vor dem ersten Start bestätigen</strong><small>Verhindert, dass unbekannte Befehle versehentlich ausgeführt werden.</small></span></label>
          <div className="button-row"><button className="button button--secondary" type="button" onClick={onExport}><Icon name="download" />Konfiguration exportieren</button><button className="button button--secondary" type="button" onClick={onImport}><Icon name="upload" />Konfiguration importieren</button><button className="button button--ghost" type="button" onClick={onResetOnboarding}><Icon name="refresh" />Onboarding erneut zeigen</button></div>
        </section>
      </div>
    </Modal>
  );
}
