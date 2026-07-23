import { createHash, timingSafeEqual } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;

export function normalizeToken(value) {
  return typeof value === "string" ? value.trim() : "";
}

function digest(value) {
  return createHash("sha256").update(value).digest();
}

export function tokensMatch(expected, received) {
  const normalizedExpected = normalizeToken(expected);
  const normalizedReceived = normalizeToken(received);
  if (!normalizedExpected || !normalizedReceived) return false;
  return timingSafeEqual(digest(normalizedExpected), digest(normalizedReceived));
}

export function bearerToken(request) {
  const header = request.headers.authorization;
  if (typeof header !== "string") return "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() ?? "";
}

export function isPathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function nearestExistingParent(candidate) {
  let current = path.resolve(candidate);
  for (;;) {
    try {
      await access(current, fsConstants.F_OK);
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) throw new Error(`No existing parent found for ${candidate}`);
      current = parent;
    }
  }
}

export async function resolveRoot(rootPath) {
  const resolved = path.resolve(rootPath);
  await mkdir(resolved, { recursive: true });
  return realpath(resolved);
}

export async function resolveSafePath(root, input, options = {}) {
  const { allowMissing = false, directory = false } = options;
  const requested = typeof input === "string" && input.trim() ? input.trim() : root;
  const candidate = path.isAbsolute(requested)
    ? path.resolve(requested)
    : path.resolve(root, requested);

  let canonical;
  if (allowMissing) {
    const existingParent = await nearestExistingParent(candidate);
    const canonicalParent = await realpath(existingParent);
    const remainder = path.relative(existingParent, candidate);
    canonical = path.resolve(canonicalParent, remainder);
  } else {
    canonical = await realpath(candidate);
  }

  if (!isPathInside(root, canonical)) {
    throw new Error(`Path is outside CODEDECK_PROJECTS_ROOT: ${requested}`);
  }

  if (!allowMissing || candidate === canonical) {
    const info = await stat(canonical).catch(() => undefined);
    if (!info && !allowMissing) throw new Error(`Path does not exist: ${requested}`);
    if (directory && info && !info.isDirectory()) throw new Error(`Path is not a directory: ${requested}`);
  }

  return canonical;
}

export async function readJsonBody(request, maxBytes = DEFAULT_MAX_BODY_BYTES) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error("Request body must contain valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

export function json(response, statusCode, value, headers = {}) {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    ...headers,
  });
  response.end(body);
}

export function requestUrl(request) {
  return new URL(request.url ?? "/", "http://localhost");
}

export function sanitizeProjectName(value) {
  const name = String(value ?? "").trim();
  if (!name || name === "." || name === ".." || /[\\/\0]/.test(name)) {
    throw new Error("Project name contains invalid characters.");
  }
  return name;
}

export function quoteShell(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}
