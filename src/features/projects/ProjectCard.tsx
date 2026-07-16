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
  if (!value) return "Nie geöffnet";
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
  const allBadges = Array.from(new Set([...(inspection?.frameworks ?? []), ...project.tags]));
  const visibleBadges = allBadges.slice(0, 2);
  const remainingBadges = Math.max(0, allBadges.length - visibleBadges.length);

  return (
    <article className="project-card">
      <button
        className={`project-card__favorite ${project.favorite ? "active" : ""}`}
        type="button"
        onClick={onToggleFavorite}
        title={project.favorite ? "Aus Favoriten entfernen" : "Als Favorit markieren"}
        aria-label={project.favorite ? "Aus Favoriten entfernen" : "Als Favorit markieren"}
      >
        <Icon name="star" />
      </button>

      <button className="project-card__identity" type="button" onClick={onOpenDetails} title="Projektdetails öffnen">
        <span className="project-icon"><Icon name="folder" /></span>
        <span className="project-card__title">
          <strong>{project.name}</strong>
          <small title={project.path}>{project.path}</small>
          {project.description && <span>{project.description}</span>}
        </span>
      </button>

      <div className="project-card__badges" aria-label="Technologien und Tags">
        {visibleBadges.length > 0 ? (
          <>
            {visibleBadges.map((badge) => <span className="badge" key={badge}>{badge}</span>)}
            {remainingBadges > 0 && <span className="badge badge--muted">+{remainingBadges}</span>}
          </>
        ) : (
          <span className="project-card__meta-muted">Keine Tags</span>
        )}
      </div>

      <div className="project-card__meta" title={inspection?.isGit ? "Git-Status" : "Kein Git-Repository erkannt"}>
        {inspection?.isGit ? (
          <>
            <Icon name="git" />
            <span>{inspection.branch || "Git"}</span>
            {inspection.changedFiles > 0 && <b>{inspection.changedFiles}</b>}
          </>
        ) : (
          <span className="project-card__meta-muted">Kein Git</span>
        )}
      </div>

      <div className="project-card__last-used" title="Zuletzt in einer IDE geöffnet">
        <Icon name="history" />
        <span>{relativeDate(project.lastOpenedAt)}</span>
      </div>

      <div className="project-card__actions">
        {quickCommand && (
          <button
            className="button button--secondary button--small project-card__command-action"
            type="button"
            onClick={() => onRunCommand(quickCommand)}
            title={`${quickCommand.label}: ${quickCommand.command}`}
          >
            <Icon name="play" />
            <span>Start</span>
          </button>
        )}
        <button
          className="button button--primary button--small project-card__primary-action"
          type="button"
          onClick={onOpenEditor}
          disabled={!editor}
          title={editor ? `In ${editor.name} öffnen` : "Zuerst eine IDE in den Einstellungen festlegen"}
        >
          <Icon name="external" />
          <span>Öffnen</span>
        </button>
        <button className="icon-button icon-button--small" type="button" onClick={onOpenDetails} title="Details" aria-label="Details öffnen">
          <Icon name="more" />
        </button>
      </div>
    </article>
  );
}
