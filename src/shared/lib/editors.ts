import type { Editor, EditorSuggestion } from "../types/models";

const KNOWN_EDITOR_KEYS = [
  "vscode",
  "cursor",
  "windsurf",
  "zed",
  "sublime",
  "idea",
  "webstorm",
  "pycharm",
  "rider",
  "clion",
  "goland",
  "phpstorm",
  "rubymine",
  "datagrip",
  "fleet",
] as const;

type KnownEditorKey = (typeof KNOWN_EDITOR_KEYS)[number];

function firstCommandPart(commandTemplate: string) {
  const value = commandTemplate.trim();
  if (!value) return "";
  if (value.startsWith('"')) {
    const closingQuote = value.indexOf('"', 1);
    return closingQuote > 1 ? value.slice(1, closingQuote) : value.slice(1);
  }
  if (value.startsWith("'")) {
    const closingQuote = value.indexOf("'", 1);
    return closingQuote > 1 ? value.slice(1, closingQuote) : value.slice(1);
  }
  return value.split(/\s+/, 1)[0] ?? "";
}

function editorKeyFromText(value: string): KnownEditorKey | undefined {
  const text = value.toLowerCase();
  if (/(visual studio code|vs\s*code|\bvscode\b|\bcode(?:\.exe)?\b)/.test(text)) return "vscode";
  if (/\bcursor\b/.test(text)) return "cursor";
  if (/\bwindsurf\b/.test(text)) return "windsurf";
  if (/\bzed\b/.test(text)) return "zed";
  if (/(sublime|\bsubl\b)/.test(text)) return "sublime";
  if (/(intellij|idea64|\bidea\b)/.test(text)) return "idea";
  if (/\bwebstorm\b/.test(text)) return "webstorm";
  if (/\bpycharm\b/.test(text)) return "pycharm";
  if (/\brider\b/.test(text)) return "rider";
  if (/\bclion\b/.test(text)) return "clion";
  if (/\bgoland\b/.test(text)) return "goland";
  if (/\bphpstorm\b/.test(text)) return "phpstorm";
  if (/\brubymine\b/.test(text)) return "rubymine";
  if (/\bdatagrip\b/.test(text)) return "datagrip";
  if (/\bfleet\b/.test(text)) return "fleet";
  return undefined;
}

export function editorKey(editor: Pick<Editor, "id" | "name" | "commandTemplate">) {
  return editorKeyFromText(`${editor.id} ${editor.name} ${firstCommandPart(editor.commandTemplate)}`);
}

function isExplicitProgram(program: string) {
  return program.includes("/") || program.includes("\\") || /^[a-z]:/i.test(program);
}

export function editorNeedsPathRepair(editor: Pick<Editor, "id" | "name" | "commandTemplate">) {
  const key = editorKey(editor);
  if (!key) return false;
  const program = firstCommandPart(editor.commandTemplate);
  if (!program) return true;
  if (isExplicitProgram(program)) return false;
  if (program.toLowerCase() === "open" && /\s-a\s/i.test(editor.commandTemplate)) return false;
  return true;
}

function suggestionIsMoreReliable(suggestion: EditorSuggestion) {
  const program = firstCommandPart(suggestion.commandTemplate);
  return isExplicitProgram(program) || (program.toLowerCase() === "open" && /\s-a\s/i.test(suggestion.commandTemplate));
}

export function mergeEditorSuggestions(editors: Editor[], suggestions: EditorSuggestion[]) {
  const next = editors.map((editor) => ({ ...editor }));

  for (const suggestion of suggestions) {
    const suggestionKey = editorKey(suggestion);
    const existingIndex = next.findIndex((editor) => {
      if (editor.id === suggestion.id) return true;
      if (editor.commandTemplate.trim().toLowerCase() === suggestion.commandTemplate.trim().toLowerCase()) return true;
      const existingKey = editorKey(editor);
      return Boolean(existingKey && suggestionKey && existingKey === suggestionKey);
    });

    if (existingIndex === -1) {
      next.push({ ...suggestion, enabled: true, detected: true });
      continue;
    }

    const existing = next[existingIndex];
    if (editorNeedsPathRepair(existing) && suggestionIsMoreReliable(suggestion)) {
      next[existingIndex] = {
        ...existing,
        commandTemplate: suggestion.commandTemplate,
        detected: true,
      };
    }
  }

  return next;
}
