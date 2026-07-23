import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { isPathInside, resolveRoot, resolveSafePath, sanitizeProjectName, tokensMatch } from "./lib.mjs";

test("token comparison is exact and rejects missing values", () => {
  assert.equal(tokensMatch("secret", "secret"), true);
  assert.equal(tokensMatch("secret", "Secret"), false);
  assert.equal(tokensMatch("", ""), false);
});

test("safe paths remain under the configured root", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "codedeck-web-"));
  const root = await resolveRoot(path.join(temporary, "projects"));
  await mkdir(path.join(root, "alpha"));
  assert.equal(await resolveSafePath(root, path.join(root, "alpha"), { directory: true }), path.join(root, "alpha"));
  await assert.rejects(resolveSafePath(root, temporary), /outside CODEDECK_PROJECTS_ROOT/);
});

test("symlinks cannot escape the projects root", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "codedeck-web-link-"));
  const root = await resolveRoot(path.join(temporary, "projects"));
  const outside = await resolveRoot(path.join(temporary, "outside"));
  await symlink(outside, path.join(root, "escape"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(resolveSafePath(root, path.join(root, "escape")), /outside CODEDECK_PROJECTS_ROOT/);
});

test("path helper and project names reject traversal", () => {
  assert.equal(isPathInside("/projects", "/projects/example"), true);
  assert.equal(isPathInside("/projects", "/projectscape"), false);
  assert.equal(sanitizeProjectName("hello-world"), "hello-world");
  assert.throws(() => sanitizeProjectName("../escape"), /invalid characters/);
});
