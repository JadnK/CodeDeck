import { useMemo, useState } from "react";
import type { Project } from "../../shared/types/project";
import { ProjectCard } from "./ProjectCard";

const demoProjects: Project[] = [
  {
    id: "portfolio-site",
    name: "Portfolio Site",
    path: "C:\\Users\\b45632\\Desktop\\Projects\\portfolio-site",
    description: "React portfolio project with personal website.",
    tags: ["frontend", "react", "portfolio"],
    favorite: true,
    preferredEditorId: "vscode",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastOpenedAt: new Date().toISOString()
  },
  {
    id: "api-server",
    name: "API Server",
    path: "C:\\Users\\b45632\\Desktop\\Projects\\api-server",
    description: "Backend playground for REST APIs.",
    tags: ["backend", "node"],
    favorite: false,
    preferredEditorId: "cursor",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export function ProjectsPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return demoProjects;
    }

    return demoProjects.filter((project) => {
      const searchableText = [
        project.name,
        project.path,
        project.description ?? "",
        project.tags.join(" ")
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [searchQuery]);

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Project manager</p>
          <h2>Projects</h2>
        </div>

        <button className="primary-button" type="button">
          Add project
        </button>
      </div>

      <div className="toolbar">
        <input
          className="search-input"
          type="search"
          placeholder="Search by name, path or tag..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />

        <span className="result-count">
          {filteredProjects.length} project
          {filteredProjects.length === 1 ? "" : "s"}
        </span>
      </div>

      {filteredProjects.length === 0 ? (
        <div className="empty-state">
          <h3>No projects found</h3>
          <p>
            Try another search term or add your first local project to Code Deck.
          </p>
        </div>
      ) : (
        <div className="project-list">
          {filteredProjects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </section>
  );
}