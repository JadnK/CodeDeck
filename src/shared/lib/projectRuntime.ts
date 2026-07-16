import type { ProjectInspection } from "../types/models";

const RUN_SCRIPT_NAMES = ["dev", "start", "serve", "preview", "run"];
const BUILD_SCRIPT_NAMES = ["build", "bundle", "package", "compile"];

function findScript(inspection: ProjectInspection | undefined, names: string[]) {
  if (!inspection) return "";
  const scripts = inspection.scripts ?? [];
  for (const name of names) {
    const exact = scripts.find((script) => script.name.toLowerCase() === name);
    if (exact) return exact.command;
  }
  return scripts.find((script) => names.some((name) => script.name.toLowerCase().includes(name)))?.command ?? "";
}

export function suggestRunCommand(inspection?: ProjectInspection) {
  return findScript(inspection, RUN_SCRIPT_NAMES);
}

export function suggestBuildCommand(inspection?: ProjectInspection) {
  return findScript(inspection, BUILD_SCRIPT_NAMES);
}

export function suggestDevPort(inspection?: ProjectInspection) {
  const technologies = [...(inspection?.frameworks ?? []), ...(inspection?.tools ?? [])]
    .map((entry) => entry.toLowerCase());
  if (technologies.includes("angular")) return 4200;
  if (technologies.includes("spring boot")) return 8080;
  if (technologies.some((entry) => ["vite", "astro"].includes(entry))) return 5173;
  if (technologies.some((entry) => ["next.js", "nuxt", "sveltekit"].includes(entry))) return 3000;
  return undefined;
}

function appendScriptArgument(command: string, argument: string) {
  const npmScript = /^npm(?:\.cmd)?\s+run\s+/i.test(command);
  return `${command}${npmScript ? " -- " : " "}${argument}`;
}

export function resolveRuntimeCommand(command: string, port?: number, inspection?: ProjectInspection) {
  const normalized = command.trim();
  if (!normalized) return "";
  if (!port) return normalized.split("{port}").join("").trim();
  if (normalized.includes("{port}")) return normalized.split("{port}").join(String(port));

  const technologies = [...(inspection?.frameworks ?? []), ...(inspection?.tools ?? [])]
    .map((entry) => entry.toLowerCase());
  if (technologies.some((entry) => ["vite", "astro", "angular", "nuxt", "sveltekit"].includes(entry))) {
    return appendScriptArgument(normalized, `--port ${port}`);
  }
  if (technologies.includes("next.js")) {
    return appendScriptArgument(normalized, `-p ${port}`);
  }
  return normalized;
}

export function runtimeEnvironment(port?: number): Record<string, string> {
  if (!port) return {};
  const value = String(port);
  return {
    PORT: value,
    SERVER_PORT: value,
    VITE_PORT: value,
  };
}
