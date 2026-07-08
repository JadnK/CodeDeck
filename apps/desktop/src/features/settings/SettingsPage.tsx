import { useState } from "react";
import type { Editor } from "../../shared/types/editor";

type SettingsPageProps = {
  editors: Editor[];
  onAddEditor: (data: { name: string; path: string }) => void;
  onDeleteEditor: (editorId: string) => void;
  onBack: () => void;
};

export function SettingsPage({
  editors,
  onAddEditor,
  onDeleteEditor,
  onBack
}: SettingsPageProps) {
  const [name, setName] = useState("");
  const [path, setPath] = useState("");

  function submitEditor(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim() || !path.trim()) {
      return;
    }

    onAddEditor({
      name: name.trim(),
      path: path.trim()
    });

    setName("");
    setPath("");
  }

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>IDEs</h1>
        </div>

        <button className="icon-button" type="button" onClick={onBack}>
          Zurück
        </button>
      </header>

      <section className="settings-layout">
        <form className="settings-card" onSubmit={submitEditor}>
          <h2>IDE hinzufügen</h2>

          <label>
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="VS Code"
            />
          </label>

          <label>
            Pfad oder Command
            <input
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder='code oder C:\...\Code.exe'
            />
          </label>

          <button className="primary-button" type="submit">
            Speichern
          </button>
        </form>

        <section className="settings-card">
          <h2>Gespeicherte IDEs</h2>

          {editors.length === 0 ? (
            <p className="hint">Noch keine IDE gespeichert.</p>
          ) : (
            <div className="editor-list">
              {editors.map((editor) => (
                <article key={editor.id} className="editor-row">
                  <div>
                    <strong>{editor.name}</strong>
                    <code>{editor.path}</code>
                  </div>

                  <button
                    className="danger-button"
                    type="button"
                    onClick={() => onDeleteEditor(editor.id)}
                  >
                    Löschen
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}