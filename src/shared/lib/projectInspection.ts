import type { ProjectCandidate, ProjectInspection } from "../types/models";

export type TechnologyKind = "language" | "framework" | "tool";

export type DetectedTechnology = {
  label: string;
  kind: TechnologyKind;
};

type DetectionSource = Pick<ProjectInspection, "frameworks" | "languages" | "tools" | "hasDocker"> | Pick<ProjectCandidate, "frameworks" | "languages" | "tools" | "hasDocker">;

export function getDetectedTechnologies(source?: DetectionSource): DetectedTechnology[] {
  if (!source) return [];

  const result: DetectedTechnology[] = [];
  const seen = new Set<string>();
  const add = (label: string, kind: TechnologyKind) => {
    const normalized = label.trim();
    if (!normalized || seen.has(normalized.toLowerCase())) return;
    seen.add(normalized.toLowerCase());
    result.push({ label: normalized, kind });
  };

  for (const language of source.languages ?? []) add(language, "language");
  for (const framework of source.frameworks ?? []) {
    // Older saved inspections may still contain Docker in frameworks.
    if (framework.toLowerCase() !== "docker") add(framework, "framework");
  }
  for (const tool of source.tools ?? []) add(tool, "tool");
  if (source.hasDocker) add("Docker", "tool");

  return result;
}

export function getDetectionSearchTerms(source?: DetectionSource): string[] {
  return getDetectedTechnologies(source).map((entry) => entry.label);
}
