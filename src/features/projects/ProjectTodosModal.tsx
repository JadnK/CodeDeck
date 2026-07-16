import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../shared/components/Icon";
import { Modal } from "../../shared/components/Modal";
import { useI18n } from "../../shared/i18n/I18n";
import { createId } from "../../shared/lib/storage";
import type { Project, ProjectTodo, TodoPriority, TodoStatus } from "../../shared/types/models";

type SortMode = "manual" | "status" | "priority" | "newest" | "title";

type ProjectTodosModalProps = {
  project?: Project;
  onClose: () => void;
  onUpdate: (project: Project) => void;
  onError: (message: string) => void;
};

const statusOrder: Record<TodoStatus, number> = { new: 0, "in-progress": 1, done: 2 };
const priorityOrder: Record<TodoPriority, number> = { high: 0, normal: 1, low: 2 };

export function ProjectTodosModal({ project, onClose, onUpdate, onError }: ProjectTodosModalProps) {
  const { t, locale } = useI18n();
  const [sortMode, setSortMode] = useState<SortMode>("manual");
  const [editingId, setEditingId] = useState<string>();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TodoStatus>("new");
  const [priority, setPriority] = useState<TodoPriority>("normal");

  useEffect(() => {
    setSortMode("manual");
    setEditingId(undefined);
    setTitle("");
    setDescription("");
    setStatus("new");
    setPriority("normal");
  }, [project?.id]);

  const todos = project?.todos ?? [];
  const sortedTodos = useMemo(() => {
    const result = [...todos];
    if (sortMode === "manual") return result.sort((a, b) => a.order - b.order);
    if (sortMode === "status") return result.sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.order - b.order);
    if (sortMode === "priority") return result.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || a.order - b.order);
    if (sortMode === "newest") return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return result.sort((a, b) => a.title.localeCompare(b.title, locale));
  }, [locale, sortMode, todos]);

  if (!project) return null;
  const currentProject: Project = project;

  const counts = {
    new: todos.filter((todo) => todo.status === "new").length,
    inProgress: todos.filter((todo) => todo.status === "in-progress").length,
    done: todos.filter((todo) => todo.status === "done").length,
  };

  function priorityLabel(value: TodoPriority) {
    if (value === "high") return t("Hoch", "High");
    if (value === "low") return t("Niedrig", "Low");
    return t("Normal", "Normal");
  }

  function updateTodos(nextTodos: ProjectTodo[]) {
    onUpdate({ ...currentProject, todos: nextTodos, updatedAt: new Date().toISOString() });
  }

  function resetForm() {
    setEditingId(undefined);
    setTitle("");
    setDescription("");
    setStatus("new");
    setPriority("normal");
  }

  function saveTodo(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      onError(t("Bitte gib der Aufgabe einen Titel.", "Enter a title for the task."));
      return;
    }

    const timestamp = new Date().toISOString();
    if (editingId) {
      updateTodos(todos.map((todo) => todo.id === editingId ? {
        ...todo,
        title: title.trim(),
        description: description.trim(),
        status,
        priority,
        updatedAt: timestamp,
      } : todo));
    } else {
      const nextOrder = todos.reduce((maximum, todo) => Math.max(maximum, todo.order), -1) + 1;
      updateTodos([...todos, {
        id: createId(),
        title: title.trim(),
        description: description.trim(),
        status,
        priority,
        order: nextOrder,
        createdAt: timestamp,
        updatedAt: timestamp,
      }]);
    }
    resetForm();
  }

  function editTodo(todo: ProjectTodo) {
    setEditingId(todo.id);
    setTitle(todo.title);
    setDescription(todo.description);
    setStatus(todo.status);
    setPriority(todo.priority);
  }

  function setTodoStatus(todoId: string, nextStatus: TodoStatus) {
    const timestamp = new Date().toISOString();
    updateTodos(todos.map((todo) => todo.id === todoId ? { ...todo, status: nextStatus, updatedAt: timestamp } : todo));
  }

  function removeTodo(todo: ProjectTodo) {
    if (!window.confirm(t(`„${todo.title}“ wirklich löschen?`, `Delete “${todo.title}”?`))) return;
    updateTodos(todos.filter((entry) => entry.id !== todo.id).map((entry, order) => ({ ...entry, order })));
    if (editingId === todo.id) resetForm();
  }

  function moveTodo(todoId: string, direction: -1 | 1) {
    const manualTodos = [...todos].sort((a, b) => a.order - b.order);
    const currentIndex = manualTodos.findIndex((todo) => todo.id === todoId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= manualTodos.length) return;
    [manualTodos[currentIndex], manualTodos[targetIndex]] = [manualTodos[targetIndex], manualTodos[currentIndex]];
    updateTodos(manualTodos.map((todo, order) => ({ ...todo, order })));
  }

  return (
    <Modal
      open={Boolean(project)}
      onClose={onClose}
      size="large"
      eyebrow={currentProject.name}
      title={t("Projekt-Todos", "Project todos")}
    >
      <div className="todo-modal">
        <section className="todo-modal__main">
          <div className="todo-toolbar">
            <div className="todo-summary" aria-label={t("Todo-Übersicht", "Todo overview")}>
              <span><i className="todo-status-dot todo-status-dot--new" />{t("Neu", "New")} <b>{counts.new}</b></span>
              <span><i className="todo-status-dot todo-status-dot--in-progress" />{t("In Arbeit", "In progress")} <b>{counts.inProgress}</b></span>
              <span><i className="todo-status-dot todo-status-dot--done" />{t("Erledigt", "Done")} <b>{counts.done}</b></span>
            </div>
            <label className="todo-sort">
              <span>{t("Sortierung", "Sort")}</span>
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                <option value="manual">{t("Manuell", "Manual")}</option>
                <option value="status">Status</option>
                <option value="priority">{t("Priorität", "Priority")}</option>
                <option value="newest">{t("Neueste zuerst", "Newest first")}</option>
                <option value="title">{t("Titel A–Z", "Title A–Z")}</option>
              </select>
            </label>
          </div>

          {sortedTodos.length ? (
            <div className="todo-list">
              {sortedTodos.map((todo) => {
                const manualIndex = [...todos].sort((a, b) => a.order - b.order).findIndex((entry) => entry.id === todo.id);
                return (
                  <article className={`todo-item todo-item--${todo.status}`} key={todo.id}>
                    <div className="todo-item__status">
                      <span className={`todo-status-dot todo-status-dot--${todo.status}`} />
                      <select value={todo.status} onChange={(event) => setTodoStatus(todo.id, event.target.value as TodoStatus)} aria-label={t("Status ändern", "Change status")}>
                        <option value="new">{t("Neu", "New")}</option>
                        <option value="in-progress">{t("In Arbeit", "In progress")}</option>
                        <option value="done">{t("Erledigt", "Done")}</option>
                      </select>
                    </div>
                    <button className="todo-item__content" type="button" onClick={() => editTodo(todo)}>
                      <span className="todo-item__title-row">
                        <strong>{todo.title}</strong>
                        <span className={`todo-priority todo-priority--${todo.priority}`}>{priorityLabel(todo.priority)}</span>
                      </span>
                      {todo.description && <p>{todo.description}</p>}
                      <small>{t("Aktualisiert", "Updated")} {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(todo.updatedAt))}</small>
                    </button>
                    <div className="todo-item__actions">
                      <button className="icon-button icon-button--small" type="button" onClick={() => moveTodo(todo.id, -1)} disabled={sortMode !== "manual" || manualIndex <= 0} title={t("Nach oben", "Move up")}><Icon name="arrow-up" /></button>
                      <button className="icon-button icon-button--small" type="button" onClick={() => moveTodo(todo.id, 1)} disabled={sortMode !== "manual" || manualIndex >= todos.length - 1} title={t("Nach unten", "Move down")}><Icon name="arrow-down" /></button>
                      <button className="icon-button icon-button--small" type="button" onClick={() => editTodo(todo)} title={t("Bearbeiten", "Edit")}><Icon name="edit" /></button>
                      <button className="icon-button icon-button--small todo-item__delete" type="button" onClick={() => removeTodo(todo)} title={t("Löschen", "Delete")}><Icon name="trash" /></button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-state todo-empty">
              <Icon name="list" />
              <h3>{t("Noch keine Todos", "No todos yet")}</h3>
              <p>{t("Lege rechts die erste Aufgabe für dieses Projekt an.", "Create the first task for this project on the right.")}</p>
            </div>
          )}
        </section>

        <form className="panel todo-editor" onSubmit={saveTodo}>
          <div className="panel__header">
            <div><p className="eyebrow">{editingId ? t("Bearbeiten", "Edit") : t("Neue Aufgabe", "New task")}</p><h3>{editingId ? t("Todo ändern", "Edit todo") : t("Todo erstellen", "Create todo")}</h3></div>
            {editingId && <button className="button button--ghost button--small" type="button" onClick={resetForm}>{t("Neu anlegen", "Create new")}</button>}
          </div>
          <div className="form-field">
            <label htmlFor="todo-title">{t("Titel", "Title")}</label>
            <input id="todo-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("Zum Beispiel: Login-Fehler beheben", "For example: Fix login error")} autoFocus />
          </div>
          <div className="form-field">
            <label htmlFor="todo-description">{t("Beschreibung", "Description")}</label>
            <textarea id="todo-description" rows={5} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t("Optional: Details oder nächste Schritte", "Optional: details or next steps")} />
          </div>
          <div className="form-grid form-grid--2">
            <div className="form-field">
              <label htmlFor="todo-status">Status</label>
              <select id="todo-status" value={status} onChange={(event) => setStatus(event.target.value as TodoStatus)}>
                <option value="new">{t("Neu", "New")}</option>
                <option value="in-progress">{t("In Arbeit", "In progress")}</option>
                <option value="done">{t("Erledigt", "Done")}</option>
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="todo-priority">{t("Priorität", "Priority")}</label>
              <select id="todo-priority" value={priority} onChange={(event) => setPriority(event.target.value as TodoPriority)}>
                <option value="low">{t("Niedrig", "Low")}</option>
                <option value="normal">{t("Normal", "Normal")}</option>
                <option value="high">{t("Hoch", "High")}</option>
              </select>
            </div>
          </div>
          <div className="notice"><Icon name="info" /><p>{t("Todos werden nur in Code Deck gespeichert. Deine Projektdateien werden nicht verändert.", "Todos are stored only in Code Deck. Your project files are not changed.")}</p></div>
          <div className="form-actions">
            {editingId && <button className="button button--ghost" type="button" onClick={resetForm}>{t("Abbrechen", "Cancel")}</button>}
            <button className="button button--primary button--grow" type="submit"><Icon name={editingId ? "check" : "plus"} />{editingId ? t("Änderungen speichern", "Save changes") : t("Todo hinzufügen", "Add todo")}</button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
