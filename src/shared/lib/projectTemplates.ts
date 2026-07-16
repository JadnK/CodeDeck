import type { BuiltInProjectTemplateId, Language } from "../types/models";

export type BuiltInProjectTemplate = {
  id: BuiltInProjectTemplateId;
  name: string;
  description: string;
  details: string;
  icon: "folder" | "code" | "layers" | "command" | "terminal";
  requirements?: string;
};

type LocalizedTemplate = Omit<BuiltInProjectTemplate, "name" | "description" | "details" | "requirements"> & {
  name: { de: string; en: string };
  description: { de: string; en: string };
  details: { de: string; en: string };
  requirements?: { de: string; en: string };
};

const templates: LocalizedTemplate[] = [
  {
    id: "empty",
    name: { de: "Leeres Projekt", en: "Empty project" },
    description: { de: "Nur Ordner, README und .gitignore.", en: "Folder, README and .gitignore only." },
    details: { de: "Für eigene Setups ohne vorgegebenes Framework.", en: "For custom setups without a predefined framework." },
    icon: "folder",
  },
  {
    id: "node",
    name: { de: "Node.js", en: "Node.js" },
    description: { de: "JavaScript-Startprojekt mit package.json.", en: "JavaScript starter with package.json." },
    details: { de: "Enthält start- und dev-Script sowie src/index.js.", en: "Includes start and dev scripts plus src/index.js." },
    icon: "terminal",
    requirements: { de: "Node.js", en: "Node.js" },
  },
  {
    id: "node-typescript",
    name: { de: "Node.js + TypeScript", en: "Node.js + TypeScript" },
    description: { de: "TypeScript-Backend oder CLI als saubere Basis.", en: "Clean TypeScript base for a backend or CLI." },
    details: { de: "Enthält tsconfig, tsx-Dev-Script und Build-Script.", en: "Includes tsconfig, a tsx dev script and a build script." },
    icon: "code",
    requirements: { de: "Node.js + npm/pnpm", en: "Node.js + npm/pnpm" },
  },
  {
    id: "react-vite",
    name: { de: "React + Vite", en: "React + Vite" },
    description: { de: "Kleine React-Web-App mit TypeScript.", en: "Small React web app with TypeScript." },
    details: { de: "Enthält Vite-Konfiguration, Beispielseite und CSS.", en: "Includes Vite configuration, an example page and CSS." },
    icon: "layers",
    requirements: { de: "Node.js + npm/pnpm", en: "Node.js + npm/pnpm" },
  },
  {
    id: "spring-boot",
    name: { de: "Spring Boot", en: "Spring Boot" },
    description: { de: "REST-API mit Maven und Java 21.", en: "REST API with Maven and Java 21." },
    details: { de: "Enthält Application-Klasse, Health-Endpunkt und Testskeleton.", en: "Includes an application class, health endpoint and test skeleton." },
    icon: "code",
    requirements: { de: "Java 21 + Maven", en: "Java 21 + Maven" },
  },
  {
    id: "python",
    name: { de: "Python", en: "Python" },
    description: { de: "Einfaches Python-CLI-Projekt ohne Fremdpakete.", en: "Simple Python CLI project without third-party packages." },
    details: { de: "Enthält pyproject.toml und eine direkt startbare main.py.", en: "Includes pyproject.toml and a directly runnable main.py." },
    icon: "terminal",
    requirements: { de: "Python 3.11+", en: "Python 3.11+" },
  },
  {
    id: "rust",
    name: { de: "Rust CLI", en: "Rust CLI" },
    description: { de: "Minimales Cargo-Projekt für ein CLI-Tool.", en: "Minimal Cargo project for a CLI tool." },
    details: { de: "Enthält Cargo.toml, src/main.rs und .gitignore.", en: "Includes Cargo.toml, src/main.rs and .gitignore." },
    icon: "command",
    requirements: { de: "Rust + Cargo", en: "Rust + Cargo" },
  },
];

export function getBuiltInProjectTemplates(language: Language): BuiltInProjectTemplate[] {
  return templates.map((template) => ({
    ...template,
    name: template.name[language],
    description: template.description[language],
    details: template.details[language],
    requirements: template.requirements?.[language],
  }));
}
