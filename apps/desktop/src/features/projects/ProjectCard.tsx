import { Icon } from "../../shared/components/Icon";
import type { Editor, Project, ProjectCommand } from "../../shared/types/models";

type ProjectCardProps = {
  project: Project;
  editor?: Editor;
  onOpenDetails: () => void;
  onOpenEditor: () => void;
  onRunCommand: (command: ProjectCommand) => void;
  onToggleFavorite: () => void;
};

function relativeDate(value?: string) {
  if (!value) return "Noch nicht geöffnet";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(diff / 60_000));
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.round(hours / 24);
  if (days < 30) return `vor ${days} Tagen`;
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(value));
}

export function ProjectCard({
  project,
  editor,
  onOpenDetails,
  onOpenEditor,
  onRunCommand,
  onToggleFavorite,
}: ProjectCardProps) {
  const quickCommand = project.commands[0];
  const inspection = project.inspection;
  const badges = [...(inspection?.frameworks ?? []), ...project.tags].slice(0, 4);

  return (
    <article className="project-card" onDoubleClick={onOpenDetails}>
      <header className="project-card__header">
        <button
          className={`project-icon ${project.favorite ? "project-icon--favorite" : ""}`}
          type="button"
          onClick={onToggleFavorite}
          aria-label={project.favorite ? "Favorit entfernen" : "Als Favorit markieren"}
        >
          <Icon name={project.favorite ? "star" : "code"} />
        </button>
        <button className="icon-button icon-button--small" type="button" onClick={onOpenDetails} aria-label="Projektdetails öffnen">
          <Icon name="more" />
        </button>
      </header>

      <button className="project-card__main" type="button" onClick={onOpenDetails}>
        <h2>{project.name}</h2>
        <p className="project-card__path">{project.path}</p>
        {project.description && <p className="project-card__description">{project.description}</p>}
      </button>

      <div className="badge-row">
        {badges.length ? (
          badges.map((badge) => <span className="badge" key={badge}>{badge}</span>)
        ) : (
          <span className="badge badge--muted">Ohne Tags</span>
        )}
      </div>

      <div className="project-card__status">
        <span>
          <Icon name="history" />
          {relativeDate(project.lastOpenedAt)}
        </span>
        {inspection?.isGit && (
          <span>
            <Icon name="git" />
            {inspection.branch || "Git"}
            {inspection.changedFiles > 0 && <b>{inspection.changedFiles}</b>}
          </span>
        )}
      </div>

      <footer className="project-card__footer">
        <button className="button button--primary button--grow" type="button" onClick={onOpenEditor} disabled={!editor}>
          <Icon name="external" />
          {editor ? `In ${editor.name} öffnen` : "Keine IDE"}
        </button>
        {quickCommand && (
          <button className="button button--ghost button--icon" type="button" onClick={() => onRunCommand(quickCommand)} title={quickCommand.label}>
            <Icon name="play" />
          </button>
        )}
      </footer>
    </article>
  );
}
