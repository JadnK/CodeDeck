import type { Project } from "../../shared/types/project";

type ProjectCardProps = {
  project: Project;
};

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <article className="project-card">
      <div className="project-card-main">
        <div>
          <div className="project-title-row">
            <h3>{project.name}</h3>

            {project.favorite && (
              <span className="favorite-badge" title="Favorite">
                ★ Favorite
              </span>
            )}
          </div>

          {project.description && (
            <p className="project-description">{project.description}</p>
          )}

          <p className="project-path">{project.path}</p>
        </div>

        <div className="project-actions">
          <button className="secondary-button" type="button">
            Open IDE
          </button>

          <button className="ghost-button" type="button">
            Details
          </button>
        </div>
      </div>

      <div className="tag-list">
        {project.tags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
          </span>
        ))}
      </div>
    </article>
  );
}