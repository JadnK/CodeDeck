import { useState } from "react";
import type { Editor } from "../../shared/types/editor";
import type { Project } from "../../shared/types/project";
import { ProjectCard } from "./ProjectCard";

type ProjectsPageProps = {
  projects: Project[];
  editors: Editor[];
  editorById: Map<string, Editor>;
  onAddProject: (data: {
    name: string;
    path: string;
    editorId: string;
  }) => void;
  onDeleteProject: (projectId: string) => void;
  onOpenSettings: () => void;
};

export function ProjectsPage({
  projects,
  editors,
  editorById,
  onAddProject,
  onDeleteProject,
  onOpenSettings
}: ProjectsPageProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [editorId, setEditorId] = useState("");

  function submitProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim() || !path.trim() || !editorId) {
      return;
    }

    onAddProject({
      name: name.trim(),
      path: path.trim(),
      editorId
    });

    setName("");
    setPath("");
    setEditorId("");
    setIsCreateOpen(false);
  }

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Code Deck</p>
          <h1>Meine Projekte</h1>
        </div>

        <button className="icon-button" type="button" onClick={onOpenSettings}>
          Settings
        </button>
      </header>

      {projects.length === 0 ? (
        <section className="empty">
          <h2>Noch keine Projekte</h2>
          <p>Erstelle dein erstes Projekt über den Plus-Button unten rechts.</p>
        </section>
      ) : (
        <section className="project-grid">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              editor={editorById.get(project.editorId)}
              onDelete={() => onDeleteProject(project.id)}
            />
          ))}
        </section>
      )}

      <button
        className="floating-button"
        type="button"
        onClick={() => setIsCreateOpen(true)}
      >
        +
      </button>

      {isCreateOpen && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={submitProject}>
            <h2>Neues Projekt</h2>

            <label>
              Projektname
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="z. B. Portfolio Website"
              />
            </label>

            <label>
              Projektpfad
              <input
                value={path}
                onChange={(event) => setPath(event.target.value)}
                placeholder="C:\Users\...\mein-projekt"
              />
            </label>

            <label>
              IDE
              <select
                value={editorId}
                onChange={(event) => setEditorId(event.target.value)}
              >
                <option value="">IDE auswählen</option>

                {editors.map((editor) => (
                  <option key={editor.id} value={editor.id}>
                    {editor.name}
                  </option>
                ))}
              </select>
            </label>

            {editors.length === 0 && (
              <p className="hint">
                Du musst zuerst in den Settings eine IDE anlegen.
              </p>
            )}

            <div className="modal-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setIsCreateOpen(false)}
              >
                Abbrechen
              </button>

              <button className="primary-button" type="submit">
                Erstellen
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}