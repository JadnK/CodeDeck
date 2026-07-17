import { Icon } from "../../shared/components/Icon";
import { useI18n } from "../../shared/i18n/I18n";
import { getDetectedTechnologies } from "../../shared/lib/projectInspection";
import type { Editor, Project, ProjectCommand } from "../../shared/types/models";

type ProjectCardProps = {
  project: Project;
  editor?: Editor;
  onOpenDetails: () => void;
  onOpenEditor: () => void;
  onOpenTodos: () => void;
  onRunCommand: (command: ProjectCommand) => void;
  onToggleFavorite: () => void;
};

export function ProjectCard({
  project,
  editor,
  onOpenDetails,
  onOpenEditor,
  onOpenTodos,
  onRunCommand,
  onToggleFavorite,
}: ProjectCardProps) {
  const { t, locale } = useI18n();
  const quickCommand = project.commands[0];
  const openTodoCount = project.todos.filter((todo) => todo.status !== "done").length;
  const inspection = project.inspection;
  const allBadges = getDetectedTechnologies(inspection);
  const visibleBadges = allBadges.slice(0, 3);
  const remainingBadges = Math.max(0, allBadges.length - visibleBadges.length);

  const relativeDate = (value?: string) => {
    if (!value) return t("Nie geöffnet", "Never opened");
    const diff = Date.now() - new Date(value).getTime();
    const minutes = Math.max(1, Math.round(diff / 60_000));
    if (minutes < 60) return t(`vor ${minutes} Min.`, `${minutes} min ago`);
    const hours = Math.round(minutes / 60);
    if (hours < 24) return t(`vor ${hours} Std.`, `${hours} hr ago`);
    const days = Math.round(hours / 24);
    if (days < 30) return t(`vor ${days} Tagen`, `${days} days ago`);
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
  };

  return (
    <article className="project-card">
      <button
        className={`project-card__favorite ${project.favorite ? "active" : ""}`}
        type="button"
        onClick={onToggleFavorite}
        title={project.favorite ? t("Aus Favoriten entfernen", "Remove from favorites") : t("Als Favorit markieren", "Add to favorites")}
        aria-label={project.favorite ? t("Aus Favoriten entfernen", "Remove from favorites") : t("Als Favorit markieren", "Add to favorites")}
      >
        <Icon name="star" />
      </button>

      <div
        className="project-card__identity"
        role="button"
        tabIndex={0}
        onClick={onOpenDetails}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpenDetails();
          }
        }}
        title={t("Projektdetails öffnen", "Open project details")}
        aria-label={t(`Projektdetails für ${project.name} öffnen`, `Open details for ${project.name}`)}
      >
        <span className="project-icon"><Icon name="folder" /></span>
        <span className="project-card__title">
          <strong className="project-name selectable-text" onClick={(event) => event.stopPropagation()}>{project.name}</strong>
          <small title={project.path}>{project.path}</small>
          {project.description && <span>{project.description}</span>}
        </span>
      </div>

      <div className="project-card__badges" aria-label={t("Erkannte Technologien", "Detected technologies")}>
        {visibleBadges.length > 0 ? (
          <>
            {visibleBadges.map((badge) => <span className={`badge badge--${badge.kind}`} key={`${badge.kind}:${badge.label}`}><i aria-hidden="true" />{badge.label}</span>)}
            {remainingBadges > 0 && <span className="badge badge--muted">+{remainingBadges}</span>}
          </>
        ) : (
          <span className="project-card__meta-muted">{t("Keine Technologie erkannt", "No technology detected")}</span>
        )}
      </div>

      <div className="project-card__meta" title={inspection?.isGit ? t("Git-Status", "Git status") : t("Kein Git-Repository erkannt", "No Git repository detected")}>
        {inspection?.isGit ? (
          <>
            <Icon name="git" />
            <span>{inspection.branch || "Git"}</span>
            {inspection.changedFiles > 0 && <b>{inspection.changedFiles}</b>}
          </>
        ) : (
          <span className="project-card__meta-muted">{t("Kein Git", "No Git")}</span>
        )}
      </div>

      <div className="project-card__last-used" title={t("Zuletzt in einer IDE geöffnet", "Last opened in an IDE")}>
        <Icon name="history" />
        <span>{relativeDate(project.lastOpenedAt)}</span>
      </div>

      <button
        className="project-card__todo-count"
        type="button"
        onClick={onOpenTodos}
        title={t(`${openTodoCount} offene Todos`, `${openTodoCount} open todos`)}
        aria-label={t(`Todos für ${project.name} öffnen: ${openTodoCount} offen`, `Open todos for ${project.name}: ${openTodoCount} open`)}
      >
        <Icon name="list" />
        <span>{openTodoCount}</span>
      </button>

      <div className="project-card__actions">
        <button
          className="button button--secondary button--small project-card__todo-action"
          type="button"
          onClick={onOpenTodos}
          title={t("Todos für dieses Projekt öffnen", "Open todos for this project")}
        >
          <Icon name="list" />
          <span>{t("Todos", "Todos")}</span>
          {openTodoCount > 0 && <b>{openTodoCount}</b>}
        </button>
        {quickCommand && (
          <button
            className="button button--secondary button--small project-card__command-action"
            type="button"
            onClick={() => onRunCommand(quickCommand)}
            title={`${quickCommand.label}: ${quickCommand.command}`}
          >
            <Icon name="play" />
            <span>{t("Start", "Run")}</span>
          </button>
        )}
        <button
          className="button button--primary button--small project-card__primary-action"
          type="button"
          onClick={onOpenEditor}
          disabled={!editor}
          title={editor ? t(`In ${editor.name} öffnen`, `Open in ${editor.name}`) : t("Zuerst eine IDE in den Einstellungen festlegen", "Choose an IDE in Settings first")}
        >
          <Icon name="external" />
          <span>{t("Öffnen", "Open")}</span>
        </button>
        <button className="icon-button icon-button--small" type="button" onClick={onOpenDetails} title={t("Details", "Details")} aria-label={t("Details öffnen", "Open details")}>
          <Icon name="more" />
        </button>
      </div>
    </article>
  );
}
