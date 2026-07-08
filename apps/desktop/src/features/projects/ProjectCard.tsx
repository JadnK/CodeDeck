import type { Editor } from "../../shared/types/editor";
import type { Project } from "../../shared/types/project";

type ProjectCardProps = {
  project: Project;
  editor?: Editor;
  onDelete: () => void;
};

export function ProjectCard({ project, editor, onDelete }: ProjectCardProps) {
  function openProject() {
    alert(
      `Später öffnet Code Deck:\n\n${project.path}\n\nmit:\n${editor?.path ?? "Keine IDE"}`
    );
  }

  return (
    <article className="project-card">
      <div>
        <h2>{project.name}</h2>
        <p className="project-path">{project.path}</p>

        <div className="project-meta">
          <span>{editor?.name ?? "Keine IDE"}</span>
        </div>
      </div>

      <div className="card-actions">
        <button className="primary-button" type="button" onClick={openProject}>
          Öffnen
        </button>

        <button className="danger-button" type="button" onClick={onDelete}>
          Löschen
        </button>
      </div>
    </article>
  );
}