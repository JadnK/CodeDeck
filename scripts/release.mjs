#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");

const FILES = {
  packageJson: path.join(ROOT, "package.json"),
  tauriConfig: path.join(ROOT, "src-tauri", "tauri.conf.json"),
  cargoToml: path.join(ROOT, "src-tauri", "Cargo.toml"),
  cargoLock: path.join(ROOT, "src-tauri", "Cargo.lock"),
  changelog: path.join(ROOT, "CHANGELOG.md"),
};

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;

function fail(message) {
  throw new Error(message);
}

function commandName(command) {
  if (process.platform === "win32" && command === "pnpm") {
    return "pnpm.cmd";
  }
  return command;
}

function run(command, args = [], options = {}) {
  const { capture = false, allowFailure = false } = options;
  const result = spawnSync(commandName(command), args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });

  if (result.error) {
    if (allowFailure) {
      return { ok: false, stdout: "", stderr: result.error.message };
    }
    fail(`Could not run ${command}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    if (allowFailure) {
      return {
        ok: false,
        stdout: result.stdout?.trim() ?? "",
        stderr: result.stderr?.trim() ?? "",
      };
    }

    const details = [result.stdout, result.stderr]
      .filter(Boolean)
      .join("\n")
      .trim();
    fail(
      `Command failed: ${command} ${args.join(" ")}${
        details ? `\n${details}` : ""
      }`,
    );
  }

  return {
    ok: true,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
  };
}

function git(args, options = {}) {
  return run("git", args, options);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseSemver(version) {
  const match = SEMVER_PATTERN.exec(version);
  if (!match) {
    fail(
      `Invalid version "${version}". Use semantic versioning such as 1.2.3 or 1.3.0-beta.1.`,
    );
  }

  return {
    raw: version,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split(".") ?? [],
  };
}

function comparePrerelease(left, right) {
  if (left.length === 0 && right.length === 0) return 0;
  if (left.length === 0) return 1;
  if (right.length === 0) return -1;

  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index];
    const b = right[index];

    if (a === undefined) return -1;
    if (b === undefined) return 1;
    if (a === b) continue;

    const aIsNumber = /^\d+$/.test(a);
    const bIsNumber = /^\d+$/.test(b);

    if (aIsNumber && bIsNumber) {
      return Number(a) > Number(b) ? 1 : -1;
    }
    if (aIsNumber !== bIsNumber) {
      return aIsNumber ? -1 : 1;
    }
    return a > b ? 1 : -1;
  }

  return 0;
}

function compareSemver(leftVersion, rightVersion) {
  const left = parseSemver(leftVersion);
  const right = parseSemver(rightVersion);

  for (const key of ["major", "minor", "patch"]) {
    if (left[key] !== right[key]) {
      return left[key] > right[key] ? 1 : -1;
    }
  }

  return comparePrerelease(left.prerelease, right.prerelease);
}

function readCargoPackageVersion() {
  const content = readFileSync(FILES.cargoToml, "utf8");
  const lines = content.split(/\r?\n/);
  let inPackage = false;

  for (const line of lines) {
    const section = /^\s*\[([^\]]+)]\s*$/.exec(line);
    if (section) {
      inPackage = section[1] === "package";
      continue;
    }

    if (inPackage) {
      const version = /^\s*version\s*=\s*"([^"]+)"\s*$/.exec(line);
      if (version) return version[1];
    }
  }

  fail("Could not find [package].version in src-tauri/Cargo.toml.");
}

function writeCargoPackageVersion(version) {
  const original = readFileSync(FILES.cargoToml, "utf8");
  const newline = original.includes("\r\n") ? "\r\n" : "\n";
  const lines = original.split(/\r?\n/);
  let inPackage = false;
  let updated = false;

  const nextLines = lines.map((line) => {
    const section = /^\s*\[([^\]]+)]\s*$/.exec(line);
    if (section) {
      inPackage = section[1] === "package";
      return line;
    }

    if (inPackage && /^\s*version\s*=/.test(line)) {
      updated = true;
      const indentation = line.match(/^\s*/)?.[0] ?? "";
      return `${indentation}version = "${version}"`;
    }

    return line;
  });

  if (!updated) {
    fail("Could not update [package].version in src-tauri/Cargo.toml.");
  }

  writeFileSync(FILES.cargoToml, nextLines.join(newline), "utf8");
}

function readCargoLockVersion() {
  const content = readFileSync(FILES.cargoLock, "utf8");
  const blocks = content.split(/(?=\[\[package]])/);

  for (const block of blocks) {
    if (!/^\[\[package]]/m.test(block)) continue;
    const name = /^name\s*=\s*"([^"]+)"/m.exec(block)?.[1];
    if (name !== "code-deck") continue;
    return /^version\s*=\s*"([^"]+)"/m.exec(block)?.[1] ?? null;
  }

  return null;
}

function getVersions() {
  const packageJson = readJson(FILES.packageJson);
  const tauriConfig = readJson(FILES.tauriConfig);

  return {
    canonical: packageJson.version,
    values: {
      "package.json": packageJson.version,
      "src-tauri/tauri.conf.json": tauriConfig.version,
      "src-tauri/Cargo.toml": readCargoPackageVersion(),
      "src-tauri/Cargo.lock": readCargoLockVersion(),
    },
  };
}

function verifyVersionConsistency(expectedVersion = null) {
  const { canonical, values } = getVersions();
  parseSemver(canonical);
  const expected = expectedVersion ?? canonical;

  if (expectedVersion) parseSemver(expectedVersion);

  const mismatches = Object.entries(values)
    .filter(([, version]) => version !== expected)
    .map(([file, version]) => `- ${file}: ${version ?? "missing"}`);

  if (mismatches.length > 0) {
    fail(
      `Version mismatch. Expected ${expected}:\n${mismatches.join("\n")}\n` +
        "Run the release command instead of editing version files manually.",
    );
  }

  console.log(`Version check passed: ${expected}`);
  return expected;
}

function ensureRequiredFiles() {
  for (const file of Object.values(FILES)) {
    if (!existsSync(file)) {
      fail(`Required file is missing: ${path.relative(ROOT, file)}`);
    }
  }
}

function ensureRepositoryState() {
  const root = git(["rev-parse", "--show-toplevel"], { capture: true }).stdout;
  if (path.resolve(root) !== ROOT) {
    fail(`Run this command from the CodeDeck repository at ${ROOT}.`);
  }

  const status = git(["status", "--porcelain"], { capture: true }).stdout;
  if (status) {
    fail(
      "The working tree is not clean. Commit or stash all changes before preparing a release.",
    );
  }

  const branch = git(["branch", "--show-current"], { capture: true }).stdout;
  if (branch !== "main") {
    fail(`Releases must be prepared from main. Current branch: ${branch || "detached HEAD"}.`);
  }

  git(["fetch", "origin", "main", "--tags", "--prune"]);

  const upstreamResult = git(
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    { capture: true, allowFailure: true },
  );

  if (!upstreamResult.ok) {
    fail("The current main branch has no upstream. Set it with: git push -u origin main");
  }

  const [behindText, aheadText] = git(
    ["rev-list", "--left-right", "--count", `${upstreamResult.stdout}...HEAD`],
    { capture: true },
  ).stdout.split(/\s+/);

  const behind = Number(behindText);
  const ahead = Number(aheadText);
  if (behind !== 0 || ahead !== 0) {
    fail(
      `main must match ${upstreamResult.stdout} before a release. Behind: ${behind}, ahead: ${ahead}.`,
    );
  }

  return branch;
}

function latestVersionTag() {
  const tags = git(
    ["tag", "--merged", "HEAD", "--list", "v*", "--sort=-v:refname"],
    { capture: true },
  ).stdout
    .split(/\r?\n/)
    .map((tag) => tag.trim())
    .filter(Boolean);

  return tags.find((tag) => SEMVER_PATTERN.test(tag.replace(/^v/, ""))) ?? null;
}

function repositoryUrl() {
  const remote = git(["config", "--get", "remote.origin.url"], { capture: true }).stdout;

  const httpsMatch = /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/.exec(remote);
  if (httpsMatch) {
    return `https://github.com/${httpsMatch[1]}/${httpsMatch[2]}`;
  }

  const sshMatch = /^(?:git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+)\/([^/]+?)(?:\.git)?$/.exec(
    remote,
  );
  if (sshMatch) {
    return `https://github.com/${sshMatch[1]}/${sshMatch[2]}`;
  }

  fail(`Could not derive the GitHub repository URL from origin: ${remote}`);
}

function scopeLabel(scope) {
  if (!scope) return "";

  const known = new Map([
    ["api", "API"],
    ["ci", "CI"],
    ["git", "Git"],
    ["github", "GitHub"],
    ["ui", "UI"],
    ["ux", "UX"],
  ]);

  const normalized = scope.toLowerCase();
  const label =
    known.get(normalized) ??
    normalized
      .split(/[-_/]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

  return `${label}: `;
}

function sentence(text) {
  const clean = text.trim().replace(/[.!?]+$/, "");
  if (!clean) return "";
  return `${clean.charAt(0).toUpperCase()}${clean.slice(1)}.`;
}

function collectChanges(previousTag) {
  const range = previousTag ? `${previousTag}..HEAD` : "HEAD";
  const raw = git(
    [
      "log",
      range,
      "--no-merges",
      "--pretty=format:%s%x1f%b%x1e",
    ],
    { capture: true },
  ).stdout;

  const groups = {
    Added: [],
    Changed: [],
    Fixed: [],
    Security: [],
  };

  for (const record of raw.split("\x1e")) {
    const [rawSubject = "", body = ""] = record.split("\x1f");
    const subject = rawSubject.trim();
    if (!subject) continue;
    if (/^chore(?:\([^)]*\))?:\s*(?:prepare|release)\b/i.test(subject)) continue;
    if (/^docs(?:\([^)]*\))?:\s*add .*release notes/i.test(subject)) continue;

    const conventional = /^([a-zA-Z]+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/.exec(subject);
    const type = conventional?.[1]?.toLowerCase() ?? "changed";
    const scope = conventional?.[2] ?? "";
    const description = conventional?.[4] ?? subject;
    const breaking = Boolean(conventional?.[3]) || /BREAKING[ -]CHANGE:/i.test(body);

    let group = "Changed";
    if (type === "feat") group = "Added";
    if (type === "fix") group = "Fixed";
    if (type === "security") group = "Security";

    const prefix = breaking ? "Breaking: " : scopeLabel(scope);
    const bullet = `- ${prefix}${sentence(description)}`;
    if (!groups[group].includes(bullet)) {
      groups[group].push(bullet);
    }
  }

  const total = Object.values(groups).reduce((sum, entries) => sum + entries.length, 0);
  if (total === 0) {
    fail(
      `No release changes were found in ${range}. Use conventional commit messages such as feat:, fix: or docs:.`,
    );
  }

  return groups;
}

function renderSections(groups, headingLevel = 3) {
  const prefix = "#".repeat(headingLevel);
  return Object.entries(groups)
    .filter(([, entries]) => entries.length > 0)
    .map(([heading, entries]) => `${prefix} ${heading}\n\n${entries.join("\n")}`)
    .join("\n\n");
}

function updateChangelog(version, previousTag, groups, repoUrl) {
  let changelog = readFileSync(FILES.changelog, "utf8").replace(/\r\n/g, "\n");
  if (new RegExp(`^## \\[${version.replace(/\./g, "\\.")}\\]`, "m").test(changelog)) {
    fail(`CHANGELOG.md already contains a ${version} section.`);
  }

  const date = new Date().toISOString().slice(0, 10);
  const section = `## [${version}] - ${date}\n\n${renderSections(groups)}\n\n`;
  const unreleasedStart = changelog.search(/^## \[Unreleased\]/m);

  if (unreleasedStart >= 0) {
    const remaining = changelog.slice(unreleasedStart);
    const nextReleaseOffset = remaining.slice(1).search(/^## \[(?!Unreleased\])/m);
    const nextRelease =
      nextReleaseOffset >= 0 ? unreleasedStart + 1 + nextReleaseOffset : changelog.length;
    const emptyUnreleased = [
      "## [Unreleased]",
      "",
      "### Added",
      "",
      "### Changed",
      "",
      "### Fixed",
      "",
      "### Security",
      "",
      "",
    ].join("\n");
    changelog = `${changelog.slice(0, unreleasedStart)}${emptyUnreleased}${section}${changelog.slice(nextRelease)}`;
  } else {
    const firstRelease = changelog.search(/^## \[/m);
    if (firstRelease >= 0) {
      changelog = `${changelog.slice(0, firstRelease)}${section}${changelog.slice(firstRelease)}`;
    } else {
      changelog = `${changelog.trimEnd()}\n\n${section}`;
    }
  }

  const lines = changelog.trimEnd().split("\n");
  const newLinkPattern = new RegExp(`^\\[${version.replace(/\./g, "\\.")}\\]:`);
  const filtered = lines.filter((line) => !newLinkPattern.test(line));
  const unreleasedIndex = filtered.findIndex((line) => /^\[Unreleased\]:/.test(line));
  const unreleasedLink = `[Unreleased]: ${repoUrl}/compare/v${version}...HEAD`;
  const versionLink = previousTag
    ? `[${version}]: ${repoUrl}/compare/${previousTag}...v${version}`
    : `[${version}]: ${repoUrl}/releases/tag/v${version}`;

  if (unreleasedIndex >= 0) {
    filtered[unreleasedIndex] = unreleasedLink;
    filtered.splice(unreleasedIndex + 1, 0, versionLink);
  } else {
    filtered.push("", unreleasedLink, versionLink);
  }

  writeFileSync(FILES.changelog, `${filtered.join("\n")}\n`, "utf8");
}

function writeReleaseNotes(version, groups) {
  const notesPath = path.join(ROOT, `RELEASE_NOTES_v${version}.md`);
  if (existsSync(notesPath)) {
    fail(`${path.basename(notesPath)} already exists.`);
  }

  const notes = [
    `# CodeDeck v${version}`,
    "",
    "This release was generated from the conventional commits added since the previous version.",
    "",
    renderSections(groups, 2),
    "",
    "## Updating",
    "",
    "Existing users can install this release through CodeDeck's update screen after the GitHub release is published. New users can download the appropriate installer from GitHub Releases.",
    "",
  ].join("\n");

  writeFileSync(notesPath, notes, "utf8");
  return notesPath;
}

function updateVersionFiles(version) {
  const packageJson = readJson(FILES.packageJson);
  packageJson.version = version;
  writeJson(FILES.packageJson, packageJson);

  const tauriConfig = readJson(FILES.tauriConfig);
  tauriConfig.version = version;
  writeJson(FILES.tauriConfig, tauriConfig);

  writeCargoPackageVersion(version);

  console.log("Updating Cargo.lock and checking the Rust package...");
  run("cargo", ["check", "--manifest-path", "src-tauri/Cargo.toml"]);
}

function runReleaseChecks() {
  console.log("Running release checks...");
  run("pnpm", ["build"]);
  run("cargo", [
    "fmt",
    "--manifest-path",
    "src-tauri/Cargo.toml",
    "--all",
    "--",
    "--check",
  ]);
  run("cargo", [
    "clippy",
    "--manifest-path",
    "src-tauri/Cargo.toml",
    "--all-targets",
    "--all-features",
    "--locked",
    "--",
    "-D",
    "warnings",
  ]);
  run("cargo", [
    "test",
    "--manifest-path",
    "src-tauri/Cargo.toml",
    "--all-targets",
    "--all-features",
    "--locked",
  ]);
  git(["diff", "--check"]);
}

function snapshotFiles(files) {
  return new Map(
    files.map((file) => [
      file,
      existsSync(file) ? readFileSync(file) : null,
    ]),
  );
}

function restoreFiles(snapshot) {
  for (const [file, content] of snapshot.entries()) {
    if (content === null) {
      rmSync(file, { force: true });
    } else {
      writeFileSync(file, content);
    }
  }
}

function usage() {
  console.log(`Usage:
  pnpm release <version> [--push] [--skip-checks]
  pnpm version:check

Examples:
  pnpm release 1.2.3
  pnpm release 1.2.3 --push
  pnpm version:check`);
}

function main() {
  ensureRequiredFiles();

  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    usage();
    return;
  }

  if (args.includes("--check")) {
    verifyVersionConsistency();
    return;
  }

  const version = args.find((argument) => !argument.startsWith("--"));
  const push = args.includes("--push");
  const skipChecks = args.includes("--skip-checks");

  if (!version) {
    usage();
    fail("Missing release version.");
  }
  parseSemver(version);

  const branch = ensureRepositoryState();
  const currentVersion = verifyVersionConsistency();
  const previousTag = latestVersionTag();
  const previousTagVersion = previousTag?.replace(/^v/, "") ?? null;

  if (compareSemver(version, currentVersion) <= 0) {
    fail(`The new version ${version} must be greater than package.json version ${currentVersion}.`);
  }
  if (previousTagVersion && compareSemver(version, previousTagVersion) <= 0) {
    fail(`The new version ${version} must be greater than the latest tag ${previousTag}.`);
  }

  const tag = `v${version}`;
  if (git(["tag", "--list", tag], { capture: true }).stdout) {
    fail(`Tag ${tag} already exists.`);
  }

  const groups = collectChanges(previousTag);
  const repoUrl = repositoryUrl();
  const releaseNotesPath = path.join(ROOT, `RELEASE_NOTES_v${version}.md`);
  const snapshot = snapshotFiles([
    FILES.packageJson,
    FILES.tauriConfig,
    FILES.cargoToml,
    FILES.cargoLock,
    FILES.changelog,
    releaseNotesPath,
  ]);

  let committed = false;
  try {
    updateVersionFiles(version);
    updateChangelog(version, previousTag, groups, repoUrl);
    writeReleaseNotes(version, groups);
    verifyVersionConsistency(version);

    if (!skipChecks) {
      runReleaseChecks();
    } else {
      console.warn("Warning: release checks were skipped.");
    }

    git(["add", "-A"]);
    git(["commit", "-m", `chore(release): prepare v${version}`]);
    committed = true;
    git(["tag", "-a", tag, "-m", `CodeDeck ${tag}`]);

    if (push) {
      git(["push", "--atomic", "origin", branch, tag]);
      console.log(`\nReleased ${tag}. GitHub Actions will now build the release draft.`);
    } else {
      console.log(`\nPrepared ${tag} locally.`);
      console.log(`Push the commit and tag with:\n  git push --atomic origin ${branch} ${tag}`);
    }
  } catch (error) {
    if (!committed) {
      restoreFiles(snapshot);
      console.error("Release preparation failed. Modified release files were restored.");
    }
    throw error;
  }
}

try {
  main();
} catch (error) {
  console.error(`\nRelease error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
