import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import {
  access,
  cp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StringDecoder } from "node:string_decoder";
import {
  bearerToken,
  isPathInside,
  json,
  normalizeToken,
  readJsonBody,
  requestUrl,
  resolveRoot,
  resolveSafePath,
  sanitizeProjectName,
  tokensMatch,
} from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hostedRoot = path.resolve(__dirname, "..");
const publicRoot = path.resolve(process.env.CODEDECK_WEB_ROOT || path.join(hostedRoot, "public"));
const host = process.env.CODEDECK_WEB_HOST || "0.0.0.0";
const port = Number.parseInt(process.env.CODEDECK_WEB_PORT || "8080", 10);
const version = process.env.CODEDECK_VERSION || "hosted-dev";
const configuredToken = normalizeToken(process.env.CODEDECK_WEB_TOKEN);
const allowInsecure = process.env.CODEDECK_ALLOW_INSECURE === "true";
const maxBodyBytes = Number.parseInt(process.env.CODEDECK_MAX_BODY_BYTES || `${2 * 1024 * 1024}`, 10);
const maxProcessLogLines = Number.parseInt(process.env.CODEDECK_MAX_PROCESS_LOG_LINES || "500", 10);

if (!configuredToken && !allowInsecure) {
  console.error("CODEDECK_WEB_TOKEN is required. Set a long random token or explicitly set CODEDECK_ALLOW_INSECURE=true.");
  process.exit(1);
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("CODEDECK_WEB_PORT must be a valid TCP port.");
  process.exit(1);
}

const projectRoot = await resolveRoot(process.env.CODEDECK_PROJECTS_ROOT || "/projects");
const dataRoot = await resolveRoot(process.env.CODEDECK_DATA_DIR || "/data");
const dataFile = path.join(dataRoot, "config.json");
const activeProcesses = new Map();
const eventClients = new Set();

const securityHeaders = {
  "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function defaultData() {
  return {
    version: "1",
    projects: [],
    editors: [],
    projectTemplates: [],
    workspaces: [],
    processHistory: [],
    settings: {
      theme: "dark",
      language: "en",
      terminalCommand: "",
      defaultProjectDir: projectRoot,
      onboardingComplete: false,
      confirmImportedCommands: true,
      checkForUpdatesOnStartup: false,
      ideDetectionComplete: true,
      notifyOnCommandCompletion: false,
    },
  };
}

function publicRuntime() {
  return {
    mode: "web",
    version,
    authRequired: Boolean(configuredToken),
    features: {
      projectInspection: true,
      projectScan: true,
      projectCreation: true,
      repositoryClone: true,
      commandRunner: true,
      git: true,
      nativeLaunchers: false,
      desktopUpdater: false,
    },
  };
}

function isAuthorized(request) {
  return !configuredToken || tokensMatch(configuredToken, bearerToken(request));
}

function requireAuthorization(request, response) {
  if (isAuthorized(request)) return true;
  json(response, 401, { error: "A valid CodeDeck access token is required." }, {
    ...securityHeaders,
    "www-authenticate": "Bearer realm=\"CodeDeck\"",
  });
  return false;
}

async function command(program, args, options = {}) {
  const { cwd = projectRoot, env = {}, allowFailure = false, stdin } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...env },
      stdio: [stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const result = {
        code: code ?? -1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (allowFailure || code === 0) resolve(result);
      else reject(new Error(result.stderr.trim() || result.stdout.trim() || `${program} exited with code ${code}`));
    });
    if (stdin !== undefined) {
      child.stdin.end(stdin);
    }
  });
}

async function git(projectPath, args, options = {}) {
  const cwd = await resolveSafePath(projectRoot, projectPath, { directory: true });
  return command("git", ["-c", "core.quotepath=false", ...args], { cwd, ...options });
}

function packageManagerFor(entries) {
  if (entries.has("pnpm-lock.yaml")) return "pnpm";
  if (entries.has("yarn.lock")) return "yarn";
  if (entries.has("bun.lock") || entries.has("bun.lockb")) return "bun";
  return "npm";
}

const ignoredDirectories = new Set([".git", ".idea", ".next", ".nuxt", ".venv", "build", "coverage", "dist", "node_modules", "target", "vendor"]);
const languageByExtension = new Map([
  [".c", "C"], [".cpp", "C++"], [".cs", "C#"], [".css", "CSS"], [".dart", "Dart"], [".go", "Go"],
  [".html", "HTML"], [".java", "Java"], [".js", "JavaScript"], [".jsx", "JavaScript"], [".kt", "Kotlin"],
  [".php", "PHP"], [".py", "Python"], [".rb", "Ruby"], [".rs", "Rust"], [".scala", "Scala"], [".swift", "Swift"],
  [".ts", "TypeScript"], [".tsx", "TypeScript"], [".vue", "Vue"], [".svelte", "Svelte"], [".sh", "Shell"],
]);

async function collectLanguages(basePath, depth = 0, state = { seen: 0, languages: new Set() }) {
  if (depth > 4 || state.seen > 4000) return state.languages;
  const entries = await readdir(basePath, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    state.seen += 1;
    if (state.seen > 4000) break;
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) await collectLanguages(path.join(basePath, entry.name), depth + 1, state);
      continue;
    }
    const language = languageByExtension.get(path.extname(entry.name).toLowerCase());
    if (language) state.languages.add(language);
  }
  return state.languages;
}

async function gitMetadata(projectPath) {
  const isGitResult = await git(projectPath, ["rev-parse", "--is-inside-work-tree"], { allowFailure: true });
  if (isGitResult.code !== 0) return { isGit: false, changedFiles: 0 };
  const [branch, status, lastCommit] = await Promise.all([
    git(projectPath, ["branch", "--show-current"], { allowFailure: true }),
    git(projectPath, ["status", "--porcelain=v1", "-z"], { allowFailure: true }),
    git(projectPath, ["log", "-1", "--format=%H%x00%s%x00%cI"], { allowFailure: true }),
  ]);
  const commitParts = lastCommit.stdout.split("\0");
  return {
    isGit: true,
    branch: branch.stdout.trim() || undefined,
    changedFiles: status.stdout.split("\0").filter(Boolean).length,
    lastCommit: commitParts[0]
      ? { hash: commitParts[0], message: commitParts[1] ?? "", date: commitParts[2]?.trim() ?? "" }
      : undefined,
  };
}

async function inspectProject(projectPath) {
  const resolved = await resolveSafePath(projectRoot, projectPath, { directory: true });
  const dirEntries = await readdir(resolved, { withFileTypes: true });
  const entries = new Set(dirEntries.map((entry) => entry.name));
  const markers = [];
  const frameworks = new Set();
  const tools = new Set();
  let scripts = [];
  let packageManager;

  for (const marker of ["package.json", "Cargo.toml", "pyproject.toml", "requirements.txt", "pom.xml", "build.gradle", "build.gradle.kts", "go.mod", "composer.json", "Dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"]) {
    if (entries.has(marker)) markers.push(marker);
  }

  if (entries.has("package.json")) {
    const packageJson = JSON.parse(await readFile(path.join(resolved, "package.json"), "utf8"));
    packageManager = packageManagerFor(entries);
    const dependencies = { ...(packageJson.dependencies ?? {}), ...(packageJson.devDependencies ?? {}) };
    const allDependencies = new Set(Object.keys(dependencies));
    const frameworkRules = [
      ["react", "React"], ["next", "Next.js"], ["vue", "Vue"], ["nuxt", "Nuxt"], ["svelte", "Svelte"],
      ["@angular/core", "Angular"], ["express", "Express"], ["fastify", "Fastify"], ["nestjs", "NestJS"], ["@nestjs/core", "NestJS"],
      ["vite", "Vite"], ["electron", "Electron"], ["@tauri-apps/api", "Tauri"],
    ];
    for (const [dependency, label] of frameworkRules) if (allDependencies.has(dependency)) frameworks.add(label);
    scripts = Object.entries(packageJson.scripts ?? {}).map(([name]) => ({
      name,
      command: packageManager === "yarn" ? `yarn ${name}` : packageManager === "bun" ? `bun run ${name}` : `${packageManager} run ${name}`,
    }));
  }

  if (entries.has("Cargo.toml")) frameworks.add("Cargo");
  if (entries.has("pom.xml") || entries.has("build.gradle") || entries.has("build.gradle.kts")) frameworks.add("Java");
  if (entries.has("pyproject.toml") || entries.has("requirements.txt")) frameworks.add("Python");
  if (entries.has("go.mod")) frameworks.add("Go");
  const hasDocker = ["Dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"].some((name) => entries.has(name));
  if (hasDocker) tools.add("Docker");
  if (entries.has(".github")) tools.add("GitHub Actions");

  const languages = [...await collectLanguages(resolved)].sort();
  const gitInfo = await gitMetadata(resolved);
  return {
    exists: true,
    languages,
    frameworks: [...frameworks],
    tools: [...tools],
    packageManager,
    scripts,
    ...gitInfo,
    hasDocker,
    markers,
  };
}

async function scanProjects(basePath) {
  const base = await resolveSafePath(projectRoot, basePath, { directory: true });
  const results = [];
  const candidateMarkers = new Set([".git", "package.json", "Cargo.toml", "pyproject.toml", "pom.xml", "build.gradle", "build.gradle.kts", "go.mod", "Dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"]);

  async function walk(current, depth) {
    if (depth > 3 || results.length >= 250) return;
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    const names = new Set(entries.map((entry) => entry.name));
    const markerNames = [...candidateMarkers].filter((name) => names.has(name));
    if (current !== base && markerNames.length > 0) {
      const inspection = await inspectProject(current).catch(() => undefined);
      results.push({
        name: path.basename(current),
        path: current,
        markers: markerNames,
        languages: inspection?.languages,
        frameworks: inspection?.frameworks,
        tools: inspection?.tools,
        hasDocker: inspection?.hasDocker,
      });
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !ignoredDirectories.has(entry.name) && !entry.name.startsWith(".")) {
        await walk(path.join(current, entry.name), depth + 1);
      }
    }
  }

  await walk(base, 0);
  return results.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

async function repositoryStatus(projectPath) {
  const cwd = await resolveSafePath(projectRoot, projectPath, { directory: true });
  const gitDirResult = await git(cwd, ["rev-parse", "--git-dir"], { allowFailure: true });
  if (gitDirResult.code !== 0) throw new Error("The project is not a Git repository.");
  const gitDir = path.resolve(cwd, gitDirResult.stdout.trim());
  const [branchResult, upstreamResult, statusResult] = await Promise.all([
    git(cwd, ["branch", "--show-current"], { allowFailure: true }),
    git(cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], { allowFailure: true }),
    git(cwd, ["status", "--porcelain=v1", "-z"], { allowFailure: true }),
  ]);

  const files = [];
  const records = statusResult.stdout.split("\0").filter(Boolean);
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const indexStatus = record[0] ?? " ";
    const workTreeStatus = record[1] ?? " ";
    let filePath = record.slice(3);
    if ((indexStatus === "R" || indexStatus === "C") && records[index + 1]) {
      filePath = records[index + 1];
      index += 1;
    }
    files.push({
      path: filePath,
      indexStatus,
      workTreeStatus,
      staged: indexStatus !== " " && indexStatus !== "?",
      unstaged: workTreeStatus !== " ",
      untracked: indexStatus === "?" && workTreeStatus === "?",
      conflicted: ["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(`${indexStatus}${workTreeStatus}`),
    });
  }

  let ahead = 0;
  let behind = 0;
  const upstream = upstreamResult.code === 0 ? upstreamResult.stdout.trim() : undefined;
  if (upstream) {
    const counts = await git(cwd, ["rev-list", "--left-right", "--count", `HEAD...${upstream}`], { allowFailure: true });
    const [left, right] = counts.stdout.trim().split(/\s+/).map((value) => Number.parseInt(value, 10) || 0);
    ahead = left;
    behind = right;
  }

  let operation;
  if (await access(path.join(gitDir, "MERGE_HEAD")).then(() => true).catch(() => false)) operation = "merge";
  else if (await access(path.join(gitDir, "rebase-merge")).then(() => true).catch(() => false) || await access(path.join(gitDir, "rebase-apply")).then(() => true).catch(() => false)) operation = "rebase";
  else if (await access(path.join(gitDir, "CHERRY_PICK_HEAD")).then(() => true).catch(() => false)) operation = "cherry-pick";
  else if (await access(path.join(gitDir, "REVERT_HEAD")).then(() => true).catch(() => false)) operation = "revert";

  return { branch: branchResult.stdout.trim() || undefined, upstream, ahead, behind, operation, files };
}

async function createProjectFromTemplate(args) {
  const parent = await resolveSafePath(projectRoot, args.parentPath, { directory: true });
  const name = sanitizeProjectName(args.projectName);
  const destination = await resolveSafePath(projectRoot, path.join(parent, name), { allowMissing: true });
  if (await access(destination).then(() => true).catch(() => false)) throw new Error("A file or directory with this project name already exists.");
  await mkdir(destination, { recursive: false });
  const templateId = String(args.templateId);
  const supportedTemplates = new Set(["empty", "node", "node-typescript", "react-vite", "spring-boot", "python", "rust", "custom"]);
  if (!supportedTemplates.has(templateId)) throw new Error("Unsupported project template.");

  if (templateId === "custom") {
    const source = await resolveSafePath(projectRoot, args.customTemplatePath, { directory: true });
    if (isPathInside(source, destination)) throw new Error("The destination cannot be inside the custom template directory.");
    await cp(source, destination, { recursive: true, force: false, errorOnExist: true });
  } else if (templateId === "node") {
    await writeFile(path.join(destination, "package.json"), `${JSON.stringify({ name: name.toLowerCase().replaceAll(" ", "-"), private: true, version: "0.1.0", scripts: { start: "node index.js" } }, null, 2)}\n`);
    await writeFile(path.join(destination, "index.js"), 'console.log("Hello from CodeDeck");\n');
    await writeFile(path.join(destination, ".gitignore"), "node_modules/\n.env\n");
  } else if (templateId === "node-typescript") {
    await mkdir(path.join(destination, "src"));
    await writeFile(path.join(destination, "package.json"), `${JSON.stringify({ name: name.toLowerCase().replaceAll(" ", "-"), private: true, version: "0.1.0", type: "module", scripts: { build: "tsc", start: "node dist/index.js", dev: "tsx watch src/index.ts" }, devDependencies: { typescript: "^5.8.3", tsx: "^4.20.0" } }, null, 2)}\n`);
    await writeFile(path.join(destination, "tsconfig.json"), `${JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, outDir: "dist" }, include: ["src"] }, null, 2)}\n`);
    await writeFile(path.join(destination, "src", "index.ts"), 'console.log("Hello from CodeDeck");\n');
    await writeFile(path.join(destination, ".gitignore"), "node_modules/\ndist/\n.env\n");
  } else if (templateId === "react-vite") {
    await mkdir(path.join(destination, "src"));
    await writeFile(path.join(destination, "package.json"), `${JSON.stringify({ name: name.toLowerCase().replaceAll(" ", "-"), private: true, version: "0.1.0", type: "module", scripts: { dev: "vite", build: "tsc && vite build", preview: "vite preview" }, dependencies: { "@vitejs/plugin-react": "^4.6.0", vite: "^7.0.4", typescript: "~5.8.3", react: "^19.1.0", "react-dom": "^19.1.0" }, devDependencies: { "@types/react": "^19.1.8", "@types/react-dom": "^19.1.6" } }, null, 2)}\n`);
    await writeFile(path.join(destination, "index.html"), '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n');
    await writeFile(path.join(destination, "src", "main.tsx"), 'import React from "react";\nimport { createRoot } from "react-dom/client";\ncreateRoot(document.getElementById("root")!).render(<main><h1>Hello from CodeDeck</h1></main>);\n');
    await writeFile(path.join(destination, ".gitignore"), "node_modules/\ndist/\n.env\n");
  } else if (templateId === "python") {
    await mkdir(path.join(destination, "src"));
    await writeFile(path.join(destination, "pyproject.toml"), `[project]\nname = "${name.toLowerCase().replaceAll(" ", "-")}"\nversion = "0.1.0"\nrequires-python = ">=3.11"\n`);
    await writeFile(path.join(destination, "src", "main.py"), 'print("Hello from CodeDeck")\n');
    await writeFile(path.join(destination, ".gitignore"), ".venv/\n__pycache__/\n.env\n");
  } else if (templateId === "rust") {
    const cargo = await command("cargo", ["init", "--name", name.toLowerCase().replaceAll(" ", "_"), destination], { allowFailure: true });
    if (cargo.code !== 0) {
      await mkdir(path.join(destination, "src"), { recursive: true });
      await writeFile(path.join(destination, "Cargo.toml"), `[package]\nname = "${name.toLowerCase().replaceAll(" ", "_")}"\nversion = "0.1.0"\nedition = "2024"\n`);
      await writeFile(path.join(destination, "src", "main.rs"), 'fn main() { println!("Hello from CodeDeck"); }\n');
    }
  } else if (templateId === "spring-boot") {
    const packageBase = String(args.javaPackageBase || "dev.codedeck").replace(/[^A-Za-z0-9_.]/g, "");
    const packagePath = packageBase.split(".").join(path.sep);
    const javaRoot = path.join(destination, "src", "main", "java", packagePath);
    await mkdir(javaRoot, { recursive: true });
    await writeFile(path.join(destination, "pom.xml"), `<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion><parent><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-parent</artifactId><version>3.5.0</version></parent><groupId>${packageBase}</groupId><artifactId>${name.toLowerCase().replaceAll(" ", "-")}</artifactId><version>0.1.0</version><dependencies><dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies><build><plugins><plugin><groupId>org.springframework.boot</groupId><artifactId>spring-boot-maven-plugin</artifactId></plugin></plugins></build></project>\n`);
    await writeFile(path.join(javaRoot, "Application.java"), `package ${packageBase};\nimport org.springframework.boot.SpringApplication;\nimport org.springframework.boot.autoconfigure.SpringBootApplication;\n@SpringBootApplication public class Application { public static void main(String[] args) { SpringApplication.run(Application.class, args); } }\n`);
    await writeFile(path.join(destination, ".gitignore"), "target/\n.idea/\n.env\n");
  }

  if (args.initGit) await command("git", ["init", destination]);
  return { name, path: destination };
}

async function cloneRepository(args) {
  const parent = await resolveSafePath(projectRoot, args.parentPath, { directory: true });
  const repositoryUrl = String(args.repositoryUrl ?? "").trim();
  if (!repositoryUrl || repositoryUrl.startsWith("-")) throw new Error("Repository URL is invalid.");
  let inferred = repositoryUrl.replace(/[\\/]+$/, "").split(/[\\/:]/).pop()?.replace(/\.git$/i, "") || "repository";
  inferred = sanitizeProjectName(args.directoryName || inferred);
  const destination = await resolveSafePath(projectRoot, path.join(parent, inferred), { allowMissing: true });
  const cloneArgs = ["clone"];
  if (args.shallow) cloneArgs.push("--depth", "1");
  if (args.branch) cloneArgs.push("--branch", String(args.branch));
  cloneArgs.push("--", repositoryUrl, destination);
  await command("git", cloneArgs, { cwd: parent });
  return { name: inferred, path: destination };
}

function emitEvent(event, payload) {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of eventClients) client.write(data);
}

function streamLines(stream, onLine) {
  const decoder = new StringDecoder("utf8");
  let pending = "";
  stream.on("data", (chunk) => {
    pending += decoder.write(chunk);
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) onLine(line);
  });
  stream.on("end", () => {
    pending += decoder.end();
    if (pending) onLine(pending);
  });
}

async function startProcess(args) {
  const projectPath = await resolveSafePath(projectRoot, args.projectPath, { directory: true });
  const workingDir = args.workingDir
    ? await resolveSafePath(projectRoot, path.resolve(projectPath, args.workingDir), { directory: true })
    : projectPath;
  const runId = typeof args.runId === "string" ? args.runId.trim() : "";
  const commandText = typeof args.command === "string" ? args.command.trim() : "";
  if (!runId) throw new Error("runId is required.");
  if (!commandText) throw new Error("Command is required.");
  if (activeProcesses.has(runId)) throw new Error("A process with this runId is already active.");
  const requestedEnv = args.env && typeof args.env === "object" && !Array.isArray(args.env) ? args.env : {};
  const commandEnv = Object.fromEntries(Object.entries(requestedEnv).map(([key, value]) => [key, String(value)]));
  const shellProgram = process.platform === "win32"
    ? process.env.ComSpec || "cmd.exe"
    : "/bin/sh";
  const child = spawn(commandText, {
    cwd: workingDir,
    env: { ...process.env, ...commandEnv, FORCE_COLOR: "0", NO_COLOR: "1" },
    detached: process.platform !== "win32",
    shell: shellProgram,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const record = { child, runId, logs: [] };
  activeProcesses.set(runId, record);
  const pushLine = (stream, line) => {
    record.logs.push({ stream, line });
    if (record.logs.length > maxProcessLogLines) record.logs.shift();
    emitEvent("process-output", { runId, stream, line });
  };
  streamLines(child.stdout, (line) => pushLine("stdout", line));
  streamLines(child.stderr, (line) => pushLine("stderr", line));
  child.on("error", (error) => pushLine("stderr", `[CodeDeck] ${error.message}`));
  child.on("close", (exitCode, signal) => {
    activeProcesses.delete(runId);
    emitEvent("process-exit", { runId, exitCode: exitCode ?? undefined, success: exitCode === 0 && !signal });
  });
  await new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  return { pid: child.pid };
}

async function stopProcess(args) {
  const pid = Number(args.pid);
  const record = [...activeProcesses.values()].find((entry) => entry.child.pid === pid);
  if (!record) throw new Error("The process is no longer running.");
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    record.child.kill("SIGTERM");
  }
  setTimeout(() => {
    if (!activeProcesses.has(record.runId)) return;
    try { process.kill(-pid, "SIGKILL"); } catch { record.child.kill("SIGKILL"); }
  }, 5_000).unref();
}

async function invoke(commandName, args) {
  switch (commandName) {
    case "inspect_project": return inspectProject(args.path);
    case "scan_projects": return scanProjects(args.path);
    case "create_project_from_template": return createProjectFromTemplate(args);
    case "clone_repository": return cloneRepository(args);
    case "detect_editors": return [];
    case "get_desktop_directory": return projectRoot;
    case "git_init_repository": await git(args.projectPath, ["init"]); return null;
    case "git_status": return repositoryStatus(args.projectPath);
    case "git_branches": {
      const result = await git(args.projectPath, ["for-each-ref", "--format=%(refname:short)", "refs/heads"]);
      return result.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    }
    case "git_diff": return (await git(args.projectPath, ["diff", ...(args.staged ? ["--cached"] : []), "--", args.filePath], { allowFailure: true })).stdout;
    case "git_stage": await git(args.projectPath, ["add", "--", ...args.paths]); return null;
    case "git_unstage": await git(args.projectPath, ["restore", "--staged", "--", ...args.paths]); return null;
    case "git_commit": await git(args.projectPath, ["commit", "-m", String(args.message)]); return null;
    case "git_checkout_branch": await git(args.projectPath, ["checkout", String(args.branch)]); return null;
    case "git_create_branch": await git(args.projectPath, ["checkout", "-b", String(args.branch)]); return null;
    case "git_remote_action": {
      const action = String(args.action);
      if (!["fetch", "pull", "push"].includes(action)) throw new Error("Unsupported Git remote action.");
      return (await git(args.projectPath, [action], { env: { GIT_TERMINAL_PROMPT: "0" } })).stdout.trim();
    }
    case "git_remote_url": {
      const result = await git(args.projectPath, ["remote", "get-url", "origin"], { allowFailure: true });
      return result.code === 0 ? result.stdout.trim() : null;
    }
    case "git_conflict_content": {
      const cwd = await resolveSafePath(projectRoot, args.projectPath, { directory: true });
      const filePath = String(args.filePath);
      const [base, current, incoming, working] = await Promise.all([
        git(cwd, ["show", `:1:${filePath}`], { allowFailure: true }),
        git(cwd, ["show", `:2:${filePath}`], { allowFailure: true }),
        git(cwd, ["show", `:3:${filePath}`], { allowFailure: true }),
        readFile(await resolveSafePath(projectRoot, path.join(cwd, filePath), { allowMissing: true }), "utf8").catch(() => ""),
      ]);
      return { path: filePath, base: base.code === 0 ? base.stdout : undefined, current: current.stdout, incoming: incoming.stdout, workingTree: working, binary: false };
    }
    case "git_resolve_conflict": {
      const cwd = await resolveSafePath(projectRoot, args.projectPath, { directory: true });
      const target = await resolveSafePath(projectRoot, path.join(cwd, String(args.filePath)), { allowMissing: true });
      await writeFile(target, String(args.contents), "utf8");
      await git(cwd, ["add", "--", String(args.filePath)]);
      return null;
    }
    case "git_continue_operation": {
      const status = await repositoryStatus(args.projectPath);
      if (!status.operation) throw new Error("No Git operation is waiting to continue.");
      const operationCommand = status.operation === "cherry-pick" ? "cherry-pick" : status.operation;
      await git(args.projectPath, [operationCommand, "--continue"], { env: { GIT_EDITOR: "true", GIT_SEQUENCE_EDITOR: "true" } });
      return null;
    }
    case "git_abort_operation": {
      const status = await repositoryStatus(args.projectPath);
      if (!status.operation) throw new Error("No Git operation is active.");
      const operationCommand = status.operation === "cherry-pick" ? "cherry-pick" : status.operation;
      await git(args.projectPath, [operationCommand, "--abort"]);
      return null;
    }
    case "start_process": return startProcess(args);
    case "stop_process": await stopProcess(args); return null;
    case "read_text_file": return readFile(await resolveSafePath(projectRoot, args.path), "utf8");
    case "write_text_file": await writeFile(await resolveSafePath(projectRoot, args.path, { allowMissing: true }), String(args.contents), "utf8"); return null;
    case "open_target": {
      const target = String(args.target);
      if (/^https?:\/\//i.test(target)) return null;
      throw new Error("Opening server folders is not available in the browser. Use the mounted projects directory on the server.");
    }
    case "launch_template":
    case "open_terminal":
      throw new Error("Desktop IDE and terminal launchers are unavailable in the hosted web edition. Run project commands from CodeDeck or use SSH/code-server.");
    default: throw new Error(`Unsupported web command: ${commandName}`);
  }
}

async function readStoredData() {
  try {
    return JSON.parse(await readFile(dataFile, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") console.warn(`Could not read ${dataFile}:`, error.message);
    return defaultData();
  }
}

async function writeStoredData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    const error = new Error("CodeDeck data must be a JSON object.");
    error.statusCode = 400;
    throw error;
  }
  const sanitized = structuredClone(data);
  if (sanitized?.settings) delete sanitized.settings.githubToken;
  if (Array.isArray(sanitized?.processHistory)) {
    sanitized.processHistory = sanitized.processHistory.map((entry) =>
      ["starting", "running", "stopping"].includes(entry.status)
        ? { ...entry, status: "stopped", endedAt: entry.endedAt || new Date().toISOString(), pid: undefined }
        : entry,
    );
  }
  const tempFile = `${dataFile}.${process.pid}.tmp`;
  await writeFile(tempFile, `${JSON.stringify(sanitized, null, 2)}\n`, { mode: 0o600 });
  await rename(tempFile, dataFile);
}

async function listDirectories(inputPath) {
  const current = await resolveSafePath(projectRoot, inputPath || projectRoot, { directory: true });
  const entries = await readdir(current, { withFileTypes: true });
  const directories = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const candidate = path.join(current, entry.name);
    const resolved = await realpath(candidate).catch(() => undefined);
    if (resolved && isPathInside(projectRoot, resolved)) directories.push({ name: entry.name, path: resolved });
  }
  directories.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return { root: projectRoot, current, parent: current === projectRoot ? null : path.dirname(current), entries: directories };
}

async function serveStatic(request, response, url) {
  let relativePath = decodeURIComponent(url.pathname);
  if (relativePath === "/") relativePath = "/index.html";
  const candidate = path.resolve(publicRoot, `.${relativePath}`);
  const insidePublic = candidate === publicRoot || candidate.startsWith(`${publicRoot}${path.sep}`);
  let filePath = insidePublic ? candidate : path.join(publicRoot, "index.html");
  let info = await stat(filePath).catch(() => undefined);
  if (!info?.isFile()) {
    filePath = path.join(publicRoot, "index.html");
    info = await stat(filePath).catch(() => undefined);
  }
  if (!info?.isFile()) {
    json(response, 503, { error: "Hosted web assets are missing from hosted/public." }, securityHeaders);
    return;
  }
  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    ...securityHeaders,
    "content-type": mimeTypes.get(extension) || "application/octet-stream",
    "content-length": info.size,
    "cache-control": path.basename(filePath) === "index.html" ? "no-cache" : "public, max-age=31536000, immutable",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
}

const server = http.createServer(async (request, response) => {
  const url = requestUrl(request);
  try {
    if (request.method === "GET" && url.pathname === "/api/health") {
      json(response, 200, { status: "ok", version }, securityHeaders);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/runtime") {
      json(response, 200, publicRuntime(), securityHeaders);
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/auth/verify") {
      if (!requireAuthorization(request, response)) return;
      json(response, 200, { ok: true }, securityHeaders);
      return;
    }
    if (url.pathname.startsWith("/api/") && !requireAuthorization(request, response)) return;

    if (request.method === "GET" && url.pathname === "/api/data") {
      json(response, 200, await readStoredData(), securityHeaders);
      return;
    }
    if (request.method === "PUT" && url.pathname === "/api/data") {
      await writeStoredData(await readJsonBody(request, maxBodyBytes));
      json(response, 200, { ok: true }, securityHeaders);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/fs/list") {
      json(response, 200, await listDirectories(url.searchParams.get("path") || projectRoot), securityHeaders);
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/invoke") {
      const body = await readJsonBody(request, maxBodyBytes);
      const result = await invoke(String(body.command ?? ""), body.args ?? {});
      json(response, 200, { result }, securityHeaders);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/events") {
      response.writeHead(200, {
        ...securityHeaders,
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        connection: "keep-alive",
      });
      response.write(`event: ready\ndata: ${JSON.stringify({ active: activeProcesses.size })}\n\n`);
      eventClients.add(response);
      const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 20_000);
      request.on("close", () => {
        clearInterval(heartbeat);
        eventClients.delete(response);
      });
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      json(response, 404, { error: "API endpoint not found." }, securityHeaders);
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      json(response, 405, { error: "Method not allowed." }, { ...securityHeaders, allow: "GET, HEAD" });
      return;
    }
    await serveStatic(request, response, url);
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 400;
    console.error(`${request.method} ${url.pathname}:`, error);
    json(response, statusCode, { error: error instanceof Error ? error.message : String(error) }, securityHeaders);
  }
});

server.listen(port, host, () => {
  const authMode = configuredToken ? "token authentication" : "INSECURE no-auth mode";
  console.log(`CodeDeck Web ${version} listening on http://${host}:${port}`);
  console.log(`Projects root: ${projectRoot}`);
  console.log(`Data directory: ${dataRoot}`);
  console.log(`Security: ${authMode}`);
});

async function shutdown(signal) {
  console.log(`Received ${signal}; stopping ${activeProcesses.size} child process(es).`);
  for (const { child } of activeProcesses.values()) {
    try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
  }
  for (const client of eventClients) client.end();
  eventClients.clear();
  server.close(() => process.exit(0));
  server.closeAllConnections?.();
  setTimeout(() => process.exit(0), 500).unref();
  setTimeout(() => process.exit(1), 8_000).unref();
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
