import { useEffect, useMemo, useState } from "react";
import { ProjectsPage } from "../features/projects/ProjectsPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import type { Editor } from "../shared/types/editor";
import type { Project } from "../shared/types/project";

const PROJECTS_KEY = "code-deck-projects";
const EDITORS_KEY = "code-deck-editors";

export function App() {
  const [view, setView] = useState<"projects" | "settings">("projects");
  const [projects, setProjects] = useState<Project[]>([]);
  const [editors, setEditors] = useState<Editor[]>([]);

  useEffect(() => {
    const savedProjects = localStorage.getItem(PROJECTS_KEY);
    const savedEditors = localStorage.getItem(EDITORS_KEY);

    if (savedProjects) {
      setProjects(JSON.parse(savedProjects));
    }

    if (savedEditors) {
      setEditors(JSON.parse(savedEditors));
    } else {
      setEditors([
        {
          id: "vscode",
          name: "VS Code",
          path: "code"
        }
      ]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    localStorage.setItem(EDITORS_KEY, JSON.stringify(editors));
  }, [editors]);

  const editorById = useMemo(() => {
    return new Map(editors.map((editor) => [editor.id, editor]));
  }, [editors]);

  function addProject(data: {
    name: string;
    path: string;
    editorId: string;
  }) {
    const newProject: Project = {
      id: crypto.randomUUID(),
      name: data.name,
      path: data.path,
      editorId: data.editorId,
      createdAt: new Date().toISOString()
    };

    setProjects((currentProjects) => [newProject, ...currentProjects]);
  }

  function deleteProject(projectId: string) {
    setProjects((currentProjects) =>
      currentProjects.filter((project) => project.id !== projectId)
    );
  }

  function addEditor(data: { name: string; path: string }) {
    const newEditor: Editor = {
      id: crypto.randomUUID(),
      name: data.name,
      path: data.path
    };

    setEditors((currentEditors) => [...currentEditors, newEditor]);
  }

  function deleteEditor(editorId: string) {
    setEditors((currentEditors) =>
      currentEditors.filter((editor) => editor.id !== editorId)
    );
  }

  return (
    <div className="app">
      {view === "projects" && (
        <ProjectsPage
          projects={projects}
          editors={editors}
          editorById={editorById}
          onAddProject={addProject}
          onDeleteProject={deleteProject}
          onOpenSettings={() => setView("settings")}
        />
      )}

      {view === "settings" && (
        <SettingsPage
          editors={editors}
          onAddEditor={addEditor}
          onDeleteEditor={deleteEditor}
          onBack={() => setView("projects")}
        />
      )}
    </div>
  );
}