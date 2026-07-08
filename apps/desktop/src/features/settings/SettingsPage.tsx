import type { Editor } from "../../shared/types/editor";

const demoEditors: Editor[] = [
  {
    id: "vscode",
    name: "VS Code",
    commandTemplate: 'code "{projectPath}"',
    enabled: true,
    platform: "all"
  },
  {
    id: "cursor",
    name: "Cursor",
    commandTemplate: 'cursor "{projectPath}"',
    enabled: true,
    platform: "all"
  }
];

export function SettingsPage() {
  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Configuration</p>
          <h2>Settings</h2>
        </div>

        <button className="primary-button" type="button">
          Add editor
        </button>
      </div>

      <section className="panel">
        <h3>Editors</h3>
        <p className="muted">
          Configure IDE commands. Later, Code Deck will replace{" "}
          <code>{"{projectPath}"}</code> with the selected project path.
        </p>

        <div className="editor-list">
          {demoEditors.map((editor) => (
            <article key={editor.id} className="editor-card">
              <div>
                <h4>{editor.name}</h4>
                <code>{editor.commandTemplate}</code>
              </div>

              <span className={editor.enabled ? "badge-success" : "badge-muted"}>
                {editor.enabled ? "Enabled" : "Disabled"}
              </span>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>Storage</h3>
        <p className="muted">
          Local storage is not implemented yet. Next step: save projects and
          editors locally.
        </p>
      </section>
    </section>
  );
}