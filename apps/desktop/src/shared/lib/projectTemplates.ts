import type { BuiltInProjectTemplateId } from "../types/models";

export type BuiltInProjectTemplate = {
  id: BuiltInProjectTemplateId;
  name: string;
  description: string;
  details: string;
  tags: string[];
  icon: "folder" | "code" | "layers" | "command" | "terminal";
  requirements?: string;
};

export const builtInProjectTemplates: BuiltInProjectTemplate[] = [
  {
    id: "empty",
    name: "Leeres Projekt",
    description: "Nur Ordner, README und .gitignore.",
    details: "Für eigene Setups ohne vorgegebenes Framework.",
    tags: [],
    icon: "folder",
  },
  {
    id: "node",
    name: "Node.js",
    description: "JavaScript-Startprojekt mit package.json.",
    details: "Enthält start- und dev-Script sowie src/index.js.",
    tags: ["Node.js", "JavaScript"],
    icon: "terminal",
    requirements: "Node.js",
  },
  {
    id: "node-typescript",
    name: "Node.js + TypeScript",
    description: "TypeScript-Backend oder CLI als saubere Basis.",
    details: "Enthält tsconfig, tsx-Dev-Script und Build-Script.",
    tags: ["Node.js", "TypeScript"],
    icon: "code",
    requirements: "Node.js + npm/pnpm",
  },
  {
    id: "react-vite",
    name: "React + Vite",
    description: "Kleine React-Web-App mit TypeScript.",
    details: "Enthält Vite-Konfiguration, Beispielseite und CSS.",
    tags: ["React", "Vite", "TypeScript"],
    icon: "layers",
    requirements: "Node.js + npm/pnpm",
  },
  {
    id: "spring-boot",
    name: "Spring Boot",
    description: "REST-API mit Maven und Java 21.",
    details: "Enthält Application-Klasse, Health-Endpunkt und Testskeleton.",
    tags: ["Java", "Spring Boot", "Maven"],
    icon: "code",
    requirements: "Java 21 + Maven",
  },
  {
    id: "python",
    name: "Python",
    description: "Einfaches Python-CLI-Projekt ohne Fremdpakete.",
    details: "Enthält pyproject.toml und eine direkt startbare main.py.",
    tags: ["Python"],
    icon: "terminal",
    requirements: "Python 3.11+",
  },
  {
    id: "rust",
    name: "Rust CLI",
    description: "Minimales Cargo-Projekt für ein CLI-Tool.",
    details: "Enthält Cargo.toml, src/main.rs und .gitignore.",
    tags: ["Rust", "Cargo"],
    icon: "command",
    requirements: "Rust + Cargo",
  },
];
