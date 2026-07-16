use serde::Serialize;
use std::{
    collections::{BTreeSet, HashMap},
    fs,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
};
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(target_os = "windows")]
fn hide_console_window(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
fn hide_console_window(_command: &mut Command) {}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DetectedScript {
    name: String,
    command: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitCommit {
    hash: String,
    message: String,
    date: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectInspection {
    exists: bool,
    languages: Vec<String>,
    frameworks: Vec<String>,
    tools: Vec<String>,
    package_manager: Option<String>,
    scripts: Vec<DetectedScript>,
    is_git: bool,
    branch: Option<String>,
    changed_files: usize,
    last_commit: Option<GitCommit>,
    has_docker: bool,
    markers: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectCandidate {
    name: String,
    path: String,
    markers: Vec<String>,
    languages: Vec<String>,
    frameworks: Vec<String>,
    tools: Vec<String>,
    has_docker: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EditorSuggestion {
    id: String,
    name: String,
    command_template: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProcessOutputEvent {
    run_id: String,
    stream: String,
    line: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProcessExitEvent {
    run_id: String,
    exit_code: Option<i32>,
    success: bool,
}

#[derive(Debug, Serialize)]
struct ProcessStarted {
    pid: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreatedProject {
    name: String,
    path: String,
}

fn display_path(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn project_name(path: &Path) -> String {
    path.file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("Project")
        .to_string()
}

fn marker_names(path: &Path) -> Vec<String> {
    let candidates = [
        (".git", ".git"),
        ("package.json", "package.json"),
        ("Cargo.toml", "Cargo.toml"),
        ("pom.xml", "pom.xml"),
        ("build.gradle", "build.gradle"),
        ("build.gradle.kts", "build.gradle.kts"),
        ("pyproject.toml", "pyproject.toml"),
        ("requirements.txt", "requirements.txt"),
        ("go.mod", "go.mod"),
        ("pubspec.yaml", "pubspec.yaml"),
        ("composer.json", "composer.json"),
        ("Gemfile", "Gemfile"),
        ("Package.swift", "Package.swift"),
        ("CMakeLists.txt", "CMakeLists.txt"),
        ("Makefile", "Makefile"),
        ("Dockerfile", "Dockerfile"),
        ("compose.yml", "compose.yml"),
        ("compose.yaml", "compose.yaml"),
        ("docker-compose.yml", "docker-compose.yml"),
        ("docker-compose.yaml", "docker-compose.yaml"),
    ];

    let mut markers: Vec<String> = candidates
        .iter()
        .filter_map(|(entry, label)| path.join(entry).exists().then(|| (*label).to_string()))
        .collect();

    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let file_name = entry.file_name().to_string_lossy().to_string();
            let lower = file_name.to_ascii_lowercase();
            if lower.ends_with(".sln") || lower.ends_with(".csproj") {
                markers.push(file_name);
            }
        }
    }

    markers.sort();
    markers.dedup();
    markers
}

fn command_output(path: &Path, program: &str, args: &[&str]) -> Option<String> {
    let mut command = Command::new(program);
    command
        .args(args)
        .current_dir(path)
        .stdin(Stdio::null())
        .stderr(Stdio::null());
    hide_console_window(&mut command);
    let output = command.output().ok()?;

    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn package_manager(path: &Path) -> Option<String> {
    if path.join("pnpm-lock.yaml").exists() {
        Some("pnpm".into())
    } else if path.join("yarn.lock").exists() {
        Some("yarn".into())
    } else if path.join("bun.lock").exists() || path.join("bun.lockb").exists() {
        Some("bun".into())
    } else if path.join("package-lock.json").exists() || path.join("package.json").exists() {
        Some("npm".into())
    } else {
        None
    }
}

fn inspect_package_json(
    path: &Path,
    languages: &mut BTreeSet<String>,
    frameworks: &mut BTreeSet<String>,
    tools: &mut BTreeSet<String>,
    scripts: &mut Vec<DetectedScript>,
) {
    let package_path = path.join("package.json");
    let Ok(contents) = fs::read_to_string(package_path) else {
        return;
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&contents) else {
        return;
    };

    let manager = package_manager(path).unwrap_or_else(|| "npm".to_string());
    tools.insert(manager.clone());
    tools.insert("Node.js".to_string());

    if let Some(entries) = value.get("scripts").and_then(|entry| entry.as_object()) {
        let mut names: Vec<_> = entries.keys().cloned().collect();
        names.sort();
        for name in names {
            scripts.push(DetectedScript {
                command: format!("{manager} run {name}"),
                name,
            });
        }
    }

    let mut dependencies = BTreeSet::new();
    for key in ["dependencies", "devDependencies", "peerDependencies"] {
        if let Some(entries) = value.get(key).and_then(|entry| entry.as_object()) {
            dependencies.extend(entries.keys().cloned());
        }
    }

    let framework_mappings = [
        ("react", "React"),
        ("next", "Next.js"),
        ("vue", "Vue"),
        ("nuxt", "Nuxt"),
        ("svelte", "Svelte"),
        ("@sveltejs/kit", "SvelteKit"),
        ("@angular/core", "Angular"),
        ("astro", "Astro"),
        ("solid-js", "SolidJS"),
        ("express", "Express"),
        ("fastify", "Fastify"),
        ("@nestjs/core", "NestJS"),
        ("electron", "Electron"),
        ("@tauri-apps/api", "Tauri"),
    ];

    for (dependency, label) in framework_mappings {
        if dependencies.contains(dependency) {
            frameworks.insert(label.to_string());
        }
    }

    let tool_mappings = [
        ("vite", "Vite"),
        ("webpack", "Webpack"),
        ("parcel", "Parcel"),
        ("esbuild", "esbuild"),
    ];
    for (dependency, label) in tool_mappings {
        if dependencies.contains(dependency) {
            tools.insert(label.to_string());
        }
    }

    if dependencies.contains("typescript") || path.join("tsconfig.json").exists() {
        languages.insert("TypeScript".to_string());
    } else {
        languages.insert("JavaScript".to_string());
    }
}

fn detected_source_languages(root: &Path) -> Vec<String> {
    let mut counts: HashMap<&'static str, usize> = HashMap::new();
    let mut visited_files = 0usize;

    for entry in WalkDir::new(root)
        .max_depth(7)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| !should_skip(entry))
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_file() {
            continue;
        }
        visited_files += 1;
        if visited_files > 6000 {
            break;
        }

        let file_name = entry.file_name().to_string_lossy().to_lowercase();
        if matches!(
            file_name.as_str(),
            "build.gradle.kts" | "settings.gradle.kts" | "vite.config.ts" | "vite.config.js"
        ) {
            continue;
        }

        let extension = entry
            .path()
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();

        let language = match extension.as_str() {
            "ts" | "tsx" => Some("TypeScript"),
            "js" | "jsx" | "mjs" | "cjs" => Some("JavaScript"),
            "rs" => Some("Rust"),
            "java" => Some("Java"),
            "kt" | "kts" => Some("Kotlin"),
            "py" | "pyw" => Some("Python"),
            "go" => Some("Go"),
            "dart" => Some("Dart"),
            "cs" => Some("C#"),
            "c" => Some("C"),
            "cc" | "cpp" | "cxx" | "hpp" | "hxx" => Some("C++"),
            "php" => Some("PHP"),
            "rb" => Some("Ruby"),
            "swift" => Some("Swift"),
            "scala" => Some("Scala"),
            "sh" | "bash" | "zsh" | "fish" => Some("Shell"),
            "html" | "htm" => Some("HTML"),
            "css" | "scss" | "sass" | "less" => Some("CSS"),
            _ => None,
        };

        if let Some(language) = language {
            *counts.entry(language).or_insert(0) += 1;
        }
    }

    let mut languages: Vec<_> = counts.into_iter().collect();
    languages.sort_by(|(left_name, left_count), (right_name, right_count)| {
        right_count
            .cmp(left_count)
            .then_with(|| left_name.cmp(right_name))
    });
    languages
        .into_iter()
        .map(|(language, _)| language.to_string())
        .collect()
}

fn safe_project_name(value: &str) -> Result<String, String> {
    let name = value.trim();
    if name.is_empty() {
        return Err("Der Projektname darf nicht leer sein.".to_string());
    }
    if name == "." || name == ".." || name.contains('/') || name.contains('\\') {
        return Err("Der Projektname darf keine Pfadtrenner enthalten.".to_string());
    }
    if name.chars().any(|character| character.is_control()) {
        return Err("Der Projektname enthält ungültige Zeichen.".to_string());
    }
    Ok(name.to_string())
}

fn package_slug(value: &str) -> String {
    let mut result = String::new();
    let mut previous_dash = false;
    for character in value.chars().flat_map(char::to_lowercase) {
        if character.is_ascii_alphanumeric() {
            result.push(character);
            previous_dash = false;
        } else if !previous_dash && !result.is_empty() {
            result.push('-');
            previous_dash = true;
        }
    }
    let result = result.trim_matches('-').to_string();
    if result.is_empty() {
        "code-deck-project".to_string()
    } else {
        result
    }
}

fn java_package_segment(value: &str) -> String {
    let mut result = String::new();
    for character in value.chars().flat_map(char::to_lowercase) {
        if character.is_ascii_alphanumeric() {
            result.push(character);
        }
    }
    if result.is_empty() {
        "app".to_string()
    } else if result
        .chars()
        .next()
        .is_some_and(|character| character.is_ascii_digit())
    {
        format!("app{result}")
    } else {
        result
    }
}

fn safe_java_package_base(value: Option<&str>) -> Result<String, String> {
    let base = value.unwrap_or("dev.codedeck").trim();
    if base.is_empty() {
        return Ok("dev.codedeck".to_string());
    }

    let segments: Vec<_> = base.split('.').collect();
    if segments.iter().any(|segment| segment.is_empty()) {
        return Err("Das Java Basis-Package enthält einen leeren Abschnitt.".to_string());
    }

    for segment in &segments {
        let mut chars = segment.chars();
        let Some(first) = chars.next() else {
            return Err("Das Java Basis-Package ist ungültig.".to_string());
        };
        if !(first.is_ascii_alphabetic() || first == '_')
            || chars.any(|character| !(character.is_ascii_alphanumeric() || character == '_'))
        {
            return Err(format!(
                "Ungültiger Java-Package-Abschnitt: {segment}. Erlaubt sind Buchstaben, Zahlen und Unterstriche; der Abschnitt darf nicht mit einer Zahl beginnen."
            ));
        }
    }

    Ok(segments.join("."))
}

fn write_project_file(root: &Path, relative: &str, contents: &str) -> Result<(), String> {
    let path = root.join(relative);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Ordner konnte nicht erstellt werden: {error}"))?;
    }
    fs::write(&path, contents).map_err(|error| {
        format!(
            "Datei {} konnte nicht geschrieben werden: {error}",
            display_path(&path)
        )
    })
}

fn create_builtin_template(
    root: &Path,
    name: &str,
    template_id: &str,
    java_package_base: Option<&str>,
) -> Result<(), String> {
    let slug = package_slug(name);
    match template_id {
        "empty" => {
            write_project_file(
                root,
                "README.md",
                &format!("# {name}\n\nNeues Projekt, erstellt mit Code Deck.\n"),
            )?;
            write_project_file(
                root,
                ".gitignore",
                ".idea/\n.vscode/\n.DS_Store\nThumbs.db\n",
            )?;
        }
        "node" => {
            write_project_file(
                root,
                "package.json",
                &format!(
                    r#"{{
  "name": "{slug}",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {{
    "dev": "node --watch src/index.js",
    "start": "node src/index.js",
    "test": "node --test"
  }}
}}
"#
                ),
            )?;
            write_project_file(root, "src/index.js", "const port = Number(process.env.PORT ?? 3000);\n\nconsole.log(`Node.js project is ready on port ${port}.`);\n")?;
            write_project_file(root, ".gitignore", "node_modules/\n.env\n*.log\ndist/\n")?;
            write_project_file(
                root,
                "README.md",
                &format!("# {name}\n\n```bash\nnpm install\nnpm run dev\n```\n"),
            )?;
        }
        "node-typescript" => {
            write_project_file(
                root,
                "package.json",
                &format!(
                    r#"{{
  "name": "{slug}",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {{
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }},
  "devDependencies": {{
    "@types/node": "^24.0.0",
    "tsx": "^4.20.0",
    "typescript": "^5.9.0"
  }}
}}
"#
                ),
            )?;
            write_project_file(
                root,
                "tsconfig.json",
                r#"{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
"#,
            )?;
            write_project_file(root, "src/index.ts", "const port = Number(process.env.PORT ?? 3000);\n\nconsole.log(`TypeScript project is ready on port ${port}.`);\n")?;
            write_project_file(root, ".gitignore", "node_modules/\n.env\n*.log\ndist/\n")?;
            write_project_file(
                root,
                "README.md",
                &format!("# {name}\n\n```bash\nnpm install\nnpm run dev\n```\n"),
            )?;
        }
        "react-vite" => {
            write_project_file(
                root,
                "package.json",
                &format!(
                    r#"{{
  "name": "{slug}",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {{
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  }},
  "dependencies": {{
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }},
  "devDependencies": {{
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^5.0.0",
    "typescript": "^5.9.0",
    "vite": "^7.0.0"
  }}
}}
"#
                ),
            )?;
            write_project_file(
                root,
                "index.html",
                &format!(
                    r#"<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
"#
                ),
            )?;
            write_project_file(root, "src/main.tsx", "import { StrictMode } from \"react\";\nimport { createRoot } from \"react-dom/client\";\nimport { App } from \"./App\";\nimport \"./styles.css\";\n\ncreateRoot(document.getElementById(\"root\")!).render(\n  <StrictMode>\n    <App />\n  </StrictMode>,\n);\n")?;
            write_project_file(
                root,
                "src/App.tsx",
                &format!(
                    r#"export function App() {{
  return (
    <main className="page">
      <p className="eyebrow">Code Deck Template</p>
      <h1>{name}</h1>
      <p>Dein React-Projekt ist startklar.</p>
      <button type="button">Erste Funktion bauen</button>
    </main>
  );
}}
"#
                ),
            )?;
            write_project_file(
                root,
                "src/styles.css",
                r#":root {
  font-family: Inter, system-ui, sans-serif;
  color: #f4f7ff;
  background: #0b1020;
}

body { margin: 0; min-width: 320px; min-height: 100vh; }
button { padding: 0.8rem 1rem; border: 0; border-radius: 0.7rem; font: inherit; cursor: pointer; }
.page { max-width: 720px; margin: 0 auto; padding: 12vh 2rem; }
.eyebrow { color: #8b7cff; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; }
h1 { font-size: clamp(3rem, 9vw, 6rem); margin: 0 0 1rem; }
"#,
            )?;
            write_project_file(
                root,
                "tsconfig.json",
                r#"{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
"#,
            )?;
            write_project_file(
                root,
                "tsconfig.node.json",
                r#"{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true
  },
  "include": ["vite.config.ts"]
}
"#,
            )?;
            write_project_file(root, "vite.config.ts", "import { defineConfig } from \"vite\";\nimport react from \"@vitejs/plugin-react\";\n\nexport default defineConfig({ plugins: [react()] });\n")?;
            write_project_file(
                root,
                "src/vite-env.d.ts",
                "/// <reference types=\"vite/client\" />\n",
            )?;
            write_project_file(root, ".gitignore", "node_modules/\n.env\n*.log\ndist/\n")?;
            write_project_file(
                root,
                "README.md",
                &format!("# {name}\n\n```bash\nnpm install\nnpm run dev\n```\n"),
            )?;
        }
        "spring-boot" => {
            let package_base = safe_java_package_base(java_package_base)?;
            let segment = java_package_segment(name);
            let package = format!("{package_base}.{segment}");
            let package_path = package.replace('.', "/");
            write_project_file(
                root,
                "pom.xml",
                &format!(
                    r#"<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>4.1.0</version>
    <relativePath/>
  </parent>
  <groupId>{package_base}</groupId>
  <artifactId>{slug}</artifactId>
  <version>0.1.0-SNAPSHOT</version>
  <name>{name}</name>
  <properties>
    <java.version>21</java.version>
  </properties>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-test</artifactId>
      <scope>test</scope>
    </dependency>
  </dependencies>
  <build>
    <plugins>
      <plugin>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-maven-plugin</artifactId>
      </plugin>
    </plugins>
  </build>
</project>
"#
                ),
            )?;
            write_project_file(
                root,
                &format!("src/main/java/{package_path}/Application.java"),
                &format!(
                    r#"package {package};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class Application {{
    public static void main(String[] args) {{
        SpringApplication.run(Application.class, args);
    }}
}}
"#
                ),
            )?;
            write_project_file(
                root,
                &format!("src/main/java/{package_path}/HealthController.java"),
                &format!(
                    r#"package {package};

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {{
    @GetMapping("/api/health")
    public Map<String, String> health() {{
        return Map.of("status", "ok", "service", "{slug}");
    }}
}}
"#
                ),
            )?;
            write_project_file(
                root,
                "src/main/resources/application.properties",
                &format!("spring.application.name={slug}\nserver.port=8080\n"),
            )?;
            write_project_file(root, ".gitignore", "target/\n.idea/\n*.iml\n.env\n")?;
            write_project_file(root, "README.md", &format!("# {name}\n\nBenötigt Java 21 und Maven.\n\n```bash\nmvn spring-boot:run\n```\n\nHealth: `http://localhost:8080/api/health`\n"))?;
        }
        "python" => {
            write_project_file(
                root,
                "pyproject.toml",
                &format!(
                    r#"[project]
name = "{slug}"
version = "0.1.0"
description = "Python project created with Code Deck"
requires-python = ">=3.11"

[tool.ruff]
line-length = 100
"#
                ),
            )?;
            write_project_file(root, "main.py", &format!("def main() -> None:\n    print(\"{name} is ready.\")\n\n\nif __name__ == \"__main__\":\n    main()\n"))?;
            write_project_file(
                root,
                ".gitignore",
                "__pycache__/\n.venv/\nvenv/\n*.pyc\n.env\n",
            )?;
            write_project_file(
                root,
                "README.md",
                &format!("# {name}\n\n```bash\npython main.py\n```\n"),
            )?;
        }
        "rust" => {
            write_project_file(
                root,
                "Cargo.toml",
                &format!(
                    r#"[package]
name = "{}"
version = "0.1.0"
edition = "2021"

[dependencies]
"#,
                    slug.replace('-', "_")
                ),
            )?;
            write_project_file(
                root,
                "src/main.rs",
                &format!("fn main() {{\n    println!(\"{name} is ready.\");\n}}\n"),
            )?;
            write_project_file(root, ".gitignore", "/target\n")?;
            write_project_file(
                root,
                "README.md",
                &format!("# {name}\n\n```bash\ncargo run\n```\n"),
            )?;
        }
        _ => return Err(format!("Unbekannte Projektvorlage: {template_id}")),
    }
    Ok(())
}

fn copy_custom_template(source: &Path, destination: &Path) -> Result<(), String> {
    let source = source
        .canonicalize()
        .map_err(|error| format!("Vorlagenordner konnte nicht geöffnet werden: {error}"))?;
    let parent = destination
        .parent()
        .ok_or_else(|| "Ungültiger Zielordner.".to_string())?
        .canonicalize()
        .map_err(|error| format!("Zielordner konnte nicht geöffnet werden: {error}"))?;
    if parent.starts_with(&source) {
        return Err(
            "Der neue Projektordner darf nicht innerhalb des Vorlagenordners liegen.".to_string(),
        );
    }

    for entry in WalkDir::new(&source)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| !should_skip(entry))
    {
        let entry =
            entry.map_err(|error| format!("Vorlage konnte nicht gelesen werden: {error}"))?;
        let relative = entry
            .path()
            .strip_prefix(&source)
            .map_err(|error| format!("Vorlagenpfad ist ungültig: {error}"))?;
        if relative.as_os_str().is_empty() {
            continue;
        }
        let target = destination.join(relative);
        if entry.file_type().is_dir() {
            fs::create_dir_all(&target)
                .map_err(|error| format!("Ordner konnte nicht kopiert werden: {error}"))?;
        } else if entry.file_type().is_file() {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| format!("Ordner konnte nicht erstellt werden: {error}"))?;
            }
            fs::copy(entry.path(), &target).map_err(|error| {
                format!(
                    "Datei {} konnte nicht kopiert werden: {error}",
                    display_path(entry.path())
                )
            })?;
        }
    }
    Ok(())
}

#[tauri::command]
fn create_project_from_template(
    parent_path: String,
    project_name: String,
    template_id: String,
    custom_template_path: Option<String>,
    init_git: bool,
    java_package_base: Option<String>,
) -> Result<CreatedProject, String> {
    let name = safe_project_name(&project_name)?;
    let parent = PathBuf::from(parent_path.trim());
    if !parent.is_dir() {
        return Err(format!(
            "Der Zielordner wurde nicht gefunden: {}",
            display_path(&parent)
        ));
    }
    let destination = parent.join(&name);
    if destination.exists() {
        return Err(format!(
            "Der Projektordner existiert bereits: {}",
            display_path(&destination)
        ));
    }
    fs::create_dir(&destination)
        .map_err(|error| format!("Projektordner konnte nicht erstellt werden: {error}"))?;

    let result = if template_id == "custom" {
        let source = custom_template_path
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| "Für die eigene Vorlage fehlt der Quellordner.".to_string())?;
        copy_custom_template(Path::new(&source), &destination)
    } else {
        create_builtin_template(
            &destination,
            &name,
            &template_id,
            java_package_base.as_deref(),
        )
    };

    if let Err(error) = result {
        let _ = fs::remove_dir_all(&destination);
        return Err(error);
    }

    if init_git && which::which("git").is_ok() {
        let mut command = Command::new("git");
        command
            .args(["init"])
            .current_dir(&destination)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        hide_console_window(&mut command);
        let _ = command.status();
    }

    Ok(CreatedProject {
        name,
        path: display_path(&destination),
    })
}

fn inspect_project_path(root: &Path) -> ProjectInspection {
    let markers = marker_names(root);
    let source_languages = detected_source_languages(root);
    let mut languages = BTreeSet::new();
    let mut frameworks = BTreeSet::new();
    let mut tools = BTreeSet::new();
    let mut scripts = Vec::new();

    for language in &source_languages {
        languages.insert(language.clone());
    }
    inspect_package_json(
        root,
        &mut languages,
        &mut frameworks,
        &mut tools,
        &mut scripts,
    );

    if root.join("Cargo.toml").exists() {
        languages.insert("Rust".to_string());
        tools.insert("Cargo".to_string());
        scripts.extend([
            DetectedScript {
                name: "Run".to_string(),
                command: "cargo run".to_string(),
            },
            DetectedScript {
                name: "Build".to_string(),
                command: "cargo build".to_string(),
            },
            DetectedScript {
                name: "Tests".to_string(),
                command: "cargo test".to_string(),
            },
        ]);
    }

    if root.join("pom.xml").exists() {
        languages.insert("Java".to_string());
        tools.insert("Maven".to_string());
        let pom = fs::read_to_string(root.join("pom.xml")).unwrap_or_default();
        let is_spring_boot = pom.contains("spring-boot") || pom.contains("org.springframework.boot");
        if is_spring_boot {
            frameworks.insert("Spring Boot".to_string());
            scripts.push(DetectedScript {
                name: "Spring Boot starten".to_string(),
                command: "mvn spring-boot:run".to_string(),
            });
        }
        scripts.extend([
            DetectedScript {
                name: "Tests".to_string(),
                command: "mvn test".to_string(),
            },
            DetectedScript {
                name: "Package".to_string(),
                command: "mvn package".to_string(),
            },
        ]);
    }

    let gradle_file = if root.join("build.gradle.kts").exists() {
        Some(root.join("build.gradle.kts"))
    } else if root.join("build.gradle").exists() {
        Some(root.join("build.gradle"))
    } else {
        None
    };
    if let Some(gradle_file) = gradle_file {
        tools.insert("Gradle".to_string());
        if !languages.contains("Kotlin") {
            languages.insert("Java".to_string());
        }
        let gradle = fs::read_to_string(gradle_file).unwrap_or_default();
        if gradle.contains("org.springframework.boot") || gradle.contains("spring-boot") {
            frameworks.insert("Spring Boot".to_string());
            let wrapper = if cfg!(target_os = "windows") && root.join("gradlew.bat").exists() {
                "gradlew.bat"
            } else if root.join("gradlew").exists() {
                "./gradlew"
            } else {
                "gradle"
            };
            scripts.push(DetectedScript {
                name: "Spring Boot starten".to_string(),
                command: format!("{wrapper} bootRun"),
            });
        }
    }

    if root.join("src-tauri").is_dir() {
        frameworks.insert("Tauri".to_string());
    }

    if root.join("pyproject.toml").exists()
        || root.join("requirements.txt").exists()
        || languages.contains("Python")
    {
        languages.insert("Python".to_string());
        if root.join("main.py").exists() {
            scripts.push(DetectedScript {
                name: "Python starten".to_string(),
                command: "python main.py".to_string(),
            });
        } else if root.join("app.py").exists() {
            scripts.push(DetectedScript {
                name: "Python starten".to_string(),
                command: "python app.py".to_string(),
            });
        }
    }

    if root.join("go.mod").exists() {
        languages.insert("Go".to_string());
        tools.insert("Go modules".to_string());
        scripts.push(DetectedScript {
            name: "Go starten".to_string(),
            command: "go run .".to_string(),
        });
    }

    if root.join("pubspec.yaml").exists() {
        languages.insert("Dart".to_string());
        tools.insert("pub".to_string());
        let pubspec = fs::read_to_string(root.join("pubspec.yaml")).unwrap_or_default();
        if pubspec.contains("flutter:") || pubspec.contains("sdk: flutter") {
            frameworks.insert("Flutter".to_string());
            scripts.push(DetectedScript {
                name: "Flutter starten".to_string(),
                command: "flutter run".to_string(),
            });
        }
    }

    let python_manifest = ["pyproject.toml", "requirements.txt"]
        .iter()
        .filter_map(|name| fs::read_to_string(root.join(name)).ok())
        .collect::<Vec<_>>()
        .join("\n")
        .to_ascii_lowercase();
    if !python_manifest.is_empty() {
        if python_manifest.contains("fastapi") {
            frameworks.insert("FastAPI".to_string());
        }
        if python_manifest.contains("flask") {
            frameworks.insert("Flask".to_string());
        }
        if python_manifest.contains("django") {
            frameworks.insert("Django".to_string());
        }
        if python_manifest.contains("[tool.poetry]") {
            tools.insert("Poetry".to_string());
        }
    }
    if root.join("uv.lock").exists() {
        tools.insert("uv".to_string());
    }

    if root.join("composer.json").exists() {
        languages.insert("PHP".to_string());
        tools.insert("Composer".to_string());
        let composer = fs::read_to_string(root.join("composer.json"))
            .unwrap_or_default()
            .to_ascii_lowercase();
        if composer.contains("laravel/framework") {
            frameworks.insert("Laravel".to_string());
        }
        if composer.contains("symfony/") {
            frameworks.insert("Symfony".to_string());
        }
    }

    if root.join("Gemfile").exists() {
        languages.insert("Ruby".to_string());
        tools.insert("Bundler".to_string());
        let gemfile = fs::read_to_string(root.join("Gemfile"))
            .unwrap_or_default()
            .to_ascii_lowercase();
        if gemfile.contains("gem 'rails'") || gemfile.contains("gem \"rails\"") {
            frameworks.insert("Ruby on Rails".to_string());
        }
    }

    if root.join("Package.swift").exists() {
        languages.insert("Swift".to_string());
        tools.insert("Swift Package Manager".to_string());
    }

    if root.join("CMakeLists.txt").exists() {
        tools.insert("CMake".to_string());
    }
    if root.join("Makefile").exists() {
        tools.insert("Make".to_string());
    }

    let has_dotnet_project = fs::read_dir(root)
        .ok()
        .into_iter()
        .flatten()
        .flatten()
        .any(|entry| {
            let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
            name.ends_with(".sln") || name.ends_with(".csproj")
        });
    if has_dotnet_project {
        languages.insert("C#".to_string());
        tools.insert(".NET".to_string());
    }

    let has_docker = root.join("Dockerfile").exists()
        || root.join("docker-compose.yml").exists()
        || root.join("docker-compose.yaml").exists()
        || root.join("compose.yml").exists()
        || root.join("compose.yaml").exists();
    if has_docker {
        tools.insert("Docker".to_string());
    }

    let is_git = root.join(".git").exists()
        || command_output(root, "git", &["rev-parse", "--is-inside-work-tree"])
            .is_some_and(|value| value == "true");

    let (branch, changed_files, last_commit) = if is_git {
        let branch = command_output(root, "git", &["branch", "--show-current"])
            .filter(|value| !value.is_empty())
            .or_else(|| command_output(root, "git", &["rev-parse", "--short", "HEAD"]));
        let changed_files = command_output(root, "git", &["status", "--porcelain"])
            .map(|value| value.lines().filter(|line| !line.trim().is_empty()).count())
            .unwrap_or(0);
        let last_commit = command_output(
            root,
            "git",
            &[
                "log",
                "-1",
                "--date=short",
                "--pretty=format:%h%x1f%s%x1f%ad",
            ],
        )
        .and_then(|value| {
            let mut parts = value.split('\u{1f}');
            Some(GitCommit {
                hash: parts.next()?.to_string(),
                message: parts.next()?.to_string(),
                date: parts.next()?.to_string(),
            })
        });
        (branch, changed_files, last_commit)
    } else {
        (None, 0, None)
    };

    let mut ordered_languages = source_languages;
    for language in languages {
        if !ordered_languages.iter().any(|entry| entry == &language) {
            ordered_languages.push(language);
        }
    }

    ProjectInspection {
        exists: true,
        languages: ordered_languages,
        frameworks: frameworks.into_iter().collect(),
        tools: tools.into_iter().collect(),
        package_manager: package_manager(root),
        scripts,
        is_git,
        branch,
        changed_files,
        last_commit,
        has_docker,
        markers,
    }
}

#[tauri::command]
fn inspect_project(path: String) -> Result<ProjectInspection, String> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Ok(ProjectInspection {
            exists: false,
            languages: vec![],
            frameworks: vec![],
            tools: vec![],
            package_manager: None,
            scripts: vec![],
            is_git: false,
            branch: None,
            changed_files: 0,
            last_commit: None,
            has_docker: false,
            markers: vec![],
        });
    }

    Ok(inspect_project_path(&root))
}

fn should_skip(entry: &walkdir::DirEntry) -> bool {
    if entry.depth() == 0 {
        return false;
    }
    let name = entry.file_name().to_string_lossy();
    entry.file_type().is_dir()
        && matches!(
            name.as_ref(),
            ".git"
                | "node_modules"
                | "target"
                | "dist"
                | "build"
                | ".next"
                | ".nuxt"
                | ".idea"
                | ".vscode"
                | ".venv"
                | "venv"
                | "__pycache__"
        )
}

#[tauri::command]
fn scan_projects(path: String) -> Result<Vec<ProjectCandidate>, String> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err(format!("Der Ordner wurde nicht gefunden: {path}"));
    }

    let mut candidates = Vec::new();
    for entry in WalkDir::new(&root)
        .max_depth(5)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| !should_skip(entry))
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_dir() {
            continue;
        }
        let markers = marker_names(entry.path());
        if markers.is_empty() {
            continue;
        }
        let inspection = inspect_project_path(entry.path());
        candidates.push(ProjectCandidate {
            name: project_name(entry.path()),
            path: display_path(entry.path()),
            markers,
            languages: inspection.languages,
            frameworks: inspection.frameworks,
            tools: inspection.tools,
            has_docker: inspection.has_docker,
        });
        if candidates.len() >= 200 {
            break;
        }
    }

    candidates.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    candidates.dedup_by(|a, b| a.path.eq_ignore_ascii_case(&b.path));
    Ok(candidates)
}

fn push_editor_suggestion(
    suggestions: &mut Vec<EditorSuggestion>,
    id: &str,
    name: &str,
    command_template: String,
) {
    if suggestions.iter().any(|entry| {
        entry.id == id
            || entry
                .command_template
                .eq_ignore_ascii_case(&command_template)
    }) {
        return;
    }

    suggestions.push(EditorSuggestion {
        id: id.to_string(),
        name: name.to_string(),
        command_template,
    });
}

fn editor_candidate(
    suggestions: &mut Vec<EditorSuggestion>,
    id: &str,
    name: &str,
    executable: &str,
    template: &str,
) {
    if which::which(executable).is_ok() {
        push_editor_suggestion(suggestions, id, name, template.to_string());
    }
}

fn executable_template(path: &Path) -> String {
    format!(
        "\"{}\" \"{{projectPath}}\"",
        display_path(path).replace('"', "\\\"")
    )
}

#[cfg(target_os = "windows")]
fn windows_editor_id_from_program(program: &str) -> Option<&'static str> {
    let filename = Path::new(program)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(program)
        .to_ascii_lowercase();
    let stem = filename
        .strip_suffix(".exe")
        .or_else(|| filename.strip_suffix(".cmd"))
        .or_else(|| filename.strip_suffix(".bat"))
        .unwrap_or(&filename);

    match stem {
        "code" | "code-insiders" => Some("vscode"),
        "cursor" => Some("cursor"),
        "windsurf" => Some("windsurf"),
        "zed" => Some("zed"),
        "subl" | "sublime_text" => Some("sublime"),
        "idea" | "idea64" => Some("idea"),
        "webstorm" | "webstorm64" => Some("webstorm"),
        "pycharm" | "pycharm64" => Some("pycharm"),
        "rider" | "rider64" => Some("rider"),
        "clion" | "clion64" => Some("clion"),
        "goland" | "goland64" => Some("goland"),
        "phpstorm" | "phpstorm64" => Some("phpstorm"),
        "rubymine" | "rubymine64" => Some("rubymine"),
        "datagrip" | "datagrip64" => Some("datagrip"),
        "fleet" => Some("fleet"),
        _ => None,
    }
}

#[cfg(target_os = "windows")]
fn windows_editor_metadata(id: &str) -> Option<(&'static str, &'static [&'static str])> {
    match id {
        "vscode" => Some(("VS Code", &["Code.exe", "Code - Insiders.exe"])),
        "cursor" => Some(("Cursor", &["Cursor.exe"])),
        "windsurf" => Some(("Windsurf", &["Windsurf.exe"])),
        "zed" => Some(("Zed", &["Zed.exe"])),
        "sublime" => Some(("Sublime Text", &["sublime_text.exe"])),
        "idea" => Some(("IntelliJ IDEA", &["idea64.exe", "idea.exe"])),
        "webstorm" => Some(("WebStorm", &["webstorm64.exe", "webstorm.exe"])),
        "pycharm" => Some(("PyCharm", &["pycharm64.exe", "pycharm.exe"])),
        "rider" => Some(("Rider", &["rider64.exe", "rider.exe"])),
        "clion" => Some(("CLion", &["clion64.exe", "clion.exe"])),
        "goland" => Some(("GoLand", &["goland64.exe", "goland.exe"])),
        "phpstorm" => Some(("PhpStorm", &["phpstorm64.exe", "phpstorm.exe"])),
        "rubymine" => Some(("RubyMine", &["rubymine64.exe", "rubymine.exe"])),
        "datagrip" => Some(("DataGrip", &["datagrip64.exe", "datagrip.exe"])),
        "fleet" => Some(("JetBrains Fleet", &["fleet.exe"])),
        _ => None,
    }
}

#[cfg(target_os = "windows")]
fn windows_editor_direct_candidates(id: &str) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    let local_app_data = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
    let program_files = std::env::var_os("ProgramFiles").map(PathBuf::from);
    let program_files_x86 = std::env::var_os("ProgramFiles(x86)").map(PathBuf::from);

    match id {
        "vscode" => {
            if let Some(root) = &local_app_data {
                candidates.push(root.join("Programs/Microsoft VS Code/Code.exe"));
                candidates.push(root.join("Programs/Microsoft VS Code Insiders/Code - Insiders.exe"));
                candidates.push(root.join("Microsoft/WindowsApps/code.exe"));
            }
            for root in [program_files.as_ref(), program_files_x86.as_ref()].into_iter().flatten() {
                candidates.push(root.join("Microsoft VS Code/Code.exe"));
                candidates.push(root.join("Microsoft VS Code Insiders/Code - Insiders.exe"));
            }
        }
        "cursor" => {
            if let Some(root) = &local_app_data {
                candidates.push(root.join("Programs/cursor/Cursor.exe"));
                candidates.push(root.join("Programs/Cursor/Cursor.exe"));
            }
        }
        "windsurf" => {
            if let Some(root) = &local_app_data {
                candidates.push(root.join("Programs/Windsurf/Windsurf.exe"));
            }
        }
        "zed" => {
            if let Some(root) = &local_app_data {
                candidates.push(root.join("Programs/Zed/Zed.exe"));
            }
        }
        "sublime" => {
            for root in [program_files.as_ref(), program_files_x86.as_ref()].into_iter().flatten() {
                candidates.push(root.join("Sublime Text/sublime_text.exe"));
            }
        }
        _ => {}
    }

    candidates
}

#[cfg(target_os = "windows")]
fn find_windows_editor_executable(id: &str) -> Option<PathBuf> {
    let (_, filenames) = windows_editor_metadata(id)?;

    for candidate in windows_editor_direct_candidates(id) {
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    let mut roots: Vec<(PathBuf, usize)> = Vec::new();
    for variable in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Some(root) = std::env::var_os(variable) {
            roots.push((PathBuf::from(root).join("JetBrains"), 6));
        }
    }
    if let Some(root) = std::env::var_os("LOCALAPPDATA") {
        let root = PathBuf::from(root);
        roots.push((root.join("Programs"), 5));
        roots.push((root.join("JetBrains/Toolbox/apps"), 10));
    }
    if let Some(root) = std::env::var_os("APPDATA") {
        roots.push((PathBuf::from(root).join("JetBrains/Toolbox/apps"), 10));
    }

    let mut matches = Vec::new();
    for (root, max_depth) in roots {
        if !root.is_dir() {
            continue;
        }
        for entry in WalkDir::new(root)
            .max_depth(max_depth)
            .follow_links(false)
            .into_iter()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_type().is_file())
        {
            let filename = entry.file_name().to_string_lossy();
            if filenames.iter().any(|expected| filename.eq_ignore_ascii_case(expected)) {
                matches.push(entry.into_path());
            }
        }
    }

    matches.sort_by(|left, right| right.to_string_lossy().cmp(&left.to_string_lossy()));
    matches.into_iter().next()
}

#[cfg(target_os = "windows")]
fn detect_platform_editors(suggestions: &mut Vec<EditorSuggestion>) {
    const EDITORS: &[&str] = &[
        "vscode", "cursor", "windsurf", "zed", "sublime", "idea", "webstorm",
        "pycharm", "rider", "clion", "goland", "phpstorm", "rubymine", "datagrip",
        "fleet",
    ];

    let mut found_ids = BTreeSet::new();
    for id in EDITORS {
        let Some((name, _)) = windows_editor_metadata(id) else {
            continue;
        };
        for path in windows_editor_direct_candidates(id) {
            if path.is_file() {
                push_editor_suggestion(suggestions, id, name, executable_template(&path));
                found_ids.insert((*id).to_string());
                break;
            }
        }
    }

    let mut roots: Vec<(PathBuf, usize)> = Vec::new();
    for variable in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Some(root) = std::env::var_os(variable) {
            roots.push((PathBuf::from(root).join("JetBrains"), 6));
        }
    }
    if let Some(root) = std::env::var_os("LOCALAPPDATA") {
        let root = PathBuf::from(root);
        roots.push((root.join("Programs"), 5));
        roots.push((root.join("JetBrains/Toolbox/apps"), 10));
    }
    if let Some(root) = std::env::var_os("APPDATA") {
        roots.push((PathBuf::from(root).join("JetBrains/Toolbox/apps"), 10));
    }

    for (root, max_depth) in roots {
        if !root.is_dir() {
            continue;
        }
        for entry in WalkDir::new(root)
            .max_depth(max_depth)
            .follow_links(false)
            .into_iter()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_type().is_file())
        {
            let filename = entry.file_name().to_string_lossy();
            for id in EDITORS {
                if found_ids.contains(*id) {
                    continue;
                }
                let Some((name, filenames)) = windows_editor_metadata(id) else {
                    continue;
                };
                if filenames.iter().any(|expected| filename.eq_ignore_ascii_case(expected)) {
                    push_editor_suggestion(
                        suggestions,
                        id,
                        name,
                        executable_template(entry.path()),
                    );
                    found_ids.insert((*id).to_string());
                    break;
                }
            }
        }
    }
}

#[cfg(target_os = "macos")]
fn detect_platform_editors(suggestions: &mut Vec<EditorSuggestion>) {
    let mut application_roots = vec![PathBuf::from("/Applications")];
    if let Some(home) = dirs::home_dir() {
        application_roots.push(home.join("Applications"));
    }

    let apps = [
        (
            "vscode",
            "VS Code",
            "Visual Studio Code.app",
            "Visual Studio Code",
        ),
        ("cursor", "Cursor", "Cursor.app", "Cursor"),
        ("windsurf", "Windsurf", "Windsurf.app", "Windsurf"),
        ("zed", "Zed", "Zed.app", "Zed"),
        (
            "sublime",
            "Sublime Text",
            "Sublime Text.app",
            "Sublime Text",
        ),
        (
            "idea",
            "IntelliJ IDEA",
            "IntelliJ IDEA.app",
            "IntelliJ IDEA",
        ),
        ("webstorm", "WebStorm", "WebStorm.app", "WebStorm"),
        ("pycharm", "PyCharm", "PyCharm.app", "PyCharm"),
        ("rider", "Rider", "Rider.app", "Rider"),
        ("clion", "CLion", "CLion.app", "CLion"),
        ("goland", "GoLand", "GoLand.app", "GoLand"),
    ];

    for root in application_roots {
        for (id, name, folder, app_name) in apps {
            if root.join(folder).is_dir() {
                push_editor_suggestion(
                    suggestions,
                    id,
                    name,
                    format!("open -a \"{app_name}\" \"{{projectPath}}\""),
                );
            }
        }
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
fn linux_flatpak_executable() -> Option<PathBuf> {
    for candidate in [
        PathBuf::from("/usr/bin/flatpak"),
        PathBuf::from("/bin/flatpak"),
        PathBuf::from("/usr/local/bin/flatpak"),
    ] {
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    which::which("flatpak").ok()
}

#[cfg(all(unix, not(target_os = "macos")))]
fn flatpak_app_installed(flatpak: &Path, app_id: &str) -> bool {
    let mut command = Command::new(flatpak);
    command
        .args(["info", app_id])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    command.status().map(|status| status.success()).unwrap_or(false)
}

#[cfg(all(unix, not(target_os = "macos")))]
fn flatpak_editor_template(flatpak: &Path, app_id: &str) -> String {
    format!(
        "\"{}\" run {} \"{{projectPath}}\"",
        display_path(flatpak).replace('\"', "\\\""),
        app_id
    )
}

#[cfg(all(unix, not(target_os = "macos")))]
fn detect_platform_editors(suggestions: &mut Vec<EditorSuggestion>) {
    let candidates = [
        ("vscode", "VS Code", "/snap/bin/code"),
        ("cursor", "Cursor", "/usr/bin/cursor"),
        ("zed", "Zed", "/usr/bin/zed"),
        ("sublime", "Sublime Text", "/usr/bin/subl"),
    ];

    for (id, name, path) in candidates {
        let path = PathBuf::from(path);
        if path.is_file() {
            push_editor_suggestion(suggestions, id, name, executable_template(&path));
        }
    }

    let Some(flatpak) = linux_flatpak_executable() else {
        return;
    };

    // Flatpak applications are not exposed as normal executables to an
    // AppImage. Detect them by application ID and launch them through the
    // host flatpak CLI instead.
    let flatpak_editors = [(
        "vscode",
        "VS Code (Flatpak)",
        "com.visualstudio.code",
    )];

    for (id, name, app_id) in flatpak_editors {
        if flatpak_app_installed(&flatpak, app_id) {
            push_editor_suggestion(
                suggestions,
                id,
                name,
                flatpak_editor_template(&flatpak, app_id),
            );
        }
    }
}

#[tauri::command]
fn detect_editors() -> Vec<EditorSuggestion> {
    let mut suggestions = Vec::new();
    let candidates = [
        ("vscode", "VS Code", "code", "code \"{projectPath}\""),
        ("cursor", "Cursor", "cursor", "cursor \"{projectPath}\""),
        (
            "windsurf",
            "Windsurf",
            "windsurf",
            "windsurf \"{projectPath}\"",
        ),
        ("zed", "Zed", "zed", "zed \"{projectPath}\""),
        ("sublime", "Sublime Text", "subl", "subl \"{projectPath}\""),
        (
            "webstorm",
            "WebStorm",
            "webstorm",
            "webstorm \"{projectPath}\"",
        ),
        ("idea", "IntelliJ IDEA", "idea", "idea \"{projectPath}\""),
        ("pycharm", "PyCharm", "pycharm", "pycharm \"{projectPath}\""),
        ("rider", "Rider", "rider", "rider \"{projectPath}\""),
        ("clion", "CLion", "clion", "clion \"{projectPath}\""),
        ("goland", "GoLand", "goland", "goland \"{projectPath}\""),
        (
            "fleet",
            "JetBrains Fleet",
            "fleet",
            "fleet \"{projectPath}\"",
        ),
    ];

    // Prefer absolute platform paths over shell aliases. GUI applications often
    // do not inherit the same PATH as an interactive terminal on Windows.
    detect_platform_editors(&mut suggestions);

    for (id, name, executable, template) in candidates {
        editor_candidate(&mut suggestions, id, name, executable, template);
    }
    suggestions.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    suggestions
}

#[tauri::command]
fn get_desktop_directory() -> Result<String, String> {
    let path = dirs::desktop_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| "Der Desktop-Ordner konnte nicht ermittelt werden.".to_string())?;
    Ok(display_path(&path))
}

fn shell_command(script: &str) -> Command {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let mut command = Command::new("cmd.exe");
        command.args(["/D", "/S", "/C", script]);
        command.creation_flags(CREATE_NO_WINDOW);
        command
    }

    #[cfg(not(target_os = "windows"))]
    {
        use std::os::unix::process::CommandExt;
        let mut command = Command::new("/bin/sh");
        command.args(["-lc", script]);
        command.process_group(0);
        command
    }
}

fn fill_template(template: &str, project_path: &str, project_name: &str) -> String {
    template
        .replace("{projectPath}", &project_path.replace('"', "\\\""))
        .replace("{projectName}", &project_name.replace('"', "\\\""))
}

fn split_command_template(value: &str) -> Result<Vec<String>, String> {
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut characters = value.chars().peekable();

    while let Some(character) = characters.next() {
        if character == '\\' {
            match characters.peek().copied() {
                Some(next) if next == '\\' || next == '"' || next == '\'' => {
                    current.push(characters.next().expect("peeked character must exist"));
                }
                _ => current.push(character),
            }
            continue;
        }

        if let Some(active_quote) = quote {
            if character == active_quote {
                quote = None;
            } else {
                current.push(character);
            }
            continue;
        }

        if character == '"' || character == '\'' {
            quote = Some(character);
        } else if character.is_whitespace() {
            if !current.is_empty() {
                parts.push(std::mem::take(&mut current));
            }
        } else {
            current.push(character);
        }
    }

    if quote.is_some() {
        return Err(
            "Das Command-Template enthält ein nicht geschlossenes Anführungszeichen.".to_string(),
        );
    }
    if !current.is_empty() {
        parts.push(current);
    }

    Ok(parts)
}

fn launch_parts(
    command_template: &str,
    project_path: &str,
    project_name: &str,
) -> Result<(String, Vec<String>), String> {
    const PATH_TOKEN: &str = "__CODE_DECK_PROJECT_PATH__";
    const NAME_TOKEN: &str = "__CODE_DECK_PROJECT_NAME__";

    let tokenized = command_template
        .replace("{projectPath}", PATH_TOKEN)
        .replace("{projectName}", NAME_TOKEN);
    let mut parts = split_command_template(&tokenized)?;
    if parts.is_empty() {
        return Err("Das Command-Template enthält kein Programm.".to_string());
    }

    let replace_tokens = |value: String| {
        value
            .replace(PATH_TOKEN, project_path)
            .replace(NAME_TOKEN, project_name)
    };
    let program = replace_tokens(parts.remove(0));
    let args = parts.into_iter().map(replace_tokens).collect();
    Ok((program, args))
}

fn launch_path_text(path: &Path) -> String {
    let value = path.to_string_lossy().into_owned();

    #[cfg(target_os = "windows")]
    {
        if let Some(network_path) = value.strip_prefix(r"\\?\UNC\") {
            return format!(r"\\{network_path}");
        }
        if let Some(normal_path) = value.strip_prefix(r"\\?\") {
            return normal_path.to_string();
        }
    }

    value
}

fn resolve_launch_program(program: &str) -> Result<PathBuf, String> {
    let explicit = PathBuf::from(program);
    if explicit.is_file() {
        return Ok(explicit);
    }

    #[cfg(target_os = "windows")]
    if let Some(editor_id) = windows_editor_id_from_program(program) {
        if let Some(path) = find_windows_editor_executable(editor_id) {
            return Ok(path);
        }
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    if program.eq_ignore_ascii_case("flatpak") {
        if let Some(path) = linux_flatpak_executable() {
            return Ok(path);
        }
    }

    if let Ok(path) = which::which(program) {
        return Ok(path);
    }

    Err(format!(
        "Das Programm '{program}' wurde nicht gefunden. Öffne Einstellungen → IDEs und starte 'Installierte IDEs suchen', damit Code Deck den vollständigen Installationspfad speichert."
    ))
}

#[tauri::command]
fn launch_template(
    command_template: String,
    project_path: String,
    project_name: String,
) -> Result<(), String> {
    if command_template.trim().is_empty() {
        return Err("Das Command-Template ist leer.".to_string());
    }
    if !command_template.contains("{projectPath}") {
        return Err(
            "Das Command-Template muss den Platzhalter {projectPath} enthalten.".to_string(),
        );
    }

    let requested_path = PathBuf::from(project_path.trim());
    if !requested_path.is_dir() {
        return Err(format!(
            "Projektordner nicht gefunden oder kein Ordner: {}",
            display_path(&requested_path)
        ));
    }

    let canonical_path = fs::canonicalize(&requested_path)
        .map_err(|error| format!("Projektordner konnte nicht aufgelöst werden: {error}"))?;
    let canonical_path_text = launch_path_text(&canonical_path);
    let (program, args) = launch_parts(&command_template, &canonical_path_text, &project_name)?;
    let resolved_program = resolve_launch_program(&program)?;

    #[cfg(all(unix, not(target_os = "macos")))]
    if resolved_program
        .file_name()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("flatpak"))
        && args.first().is_some_and(|value| value == "run")
    {
        let app_id = args
            .get(1)
            .ok_or_else(|| "Im Flatpak-Command fehlt die Anwendungs-ID.".to_string())?;
        if !flatpak_app_installed(&resolved_program, app_id) {
            return Err(format!(
                "Die Flatpak-Anwendung '{app_id}' ist nicht installiert oder für den aktuellen Benutzer nicht sichtbar."
            ));
        }
    }

    let mut command = Command::new(&resolved_program);
    command
        .args(args)
        .current_dir(&canonical_path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    hide_console_window(&mut command);
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| {
            format!(
                "IDE '{}' konnte nicht gestartet werden: {error}",
                display_path(&resolved_program)
            )
        })
}

#[tauri::command]
fn open_terminal(project_path: String, terminal_command: String) -> Result<(), String> {
    let path = PathBuf::from(&project_path);
    if !path.is_dir() {
        return Err(format!("Projektordner nicht gefunden: {project_path}"));
    }

    if !terminal_command.trim().is_empty() {
        let script = fill_template(&terminal_command, &project_path, &project_name(&path));
        return shell_command(&script)
            .current_dir(&path)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Terminal konnte nicht gestartet werden: {error}"));
    }

    #[cfg(target_os = "windows")]
    {
        let change_directory = format!("cd /d \"{}\"", project_path.replace('"', "\"\""));
        Command::new("cmd.exe")
            .args(["/K", &change_directory])
            .current_dir(&path)
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Windows Terminal konnte nicht gestartet werden: {error}"))
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-a", "Terminal", &project_path])
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Terminal konnte nicht gestartet werden: {error}"))
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if which::which("gnome-terminal").is_ok() {
            return Command::new("gnome-terminal")
                .args(["--working-directory", &project_path])
                .spawn()
                .map(|_| ())
                .map_err(|error| format!("Terminal konnte nicht gestartet werden: {error}"));
        }
        if which::which("konsole").is_ok() {
            return Command::new("konsole")
                .args(["--workdir", &project_path])
                .spawn()
                .map(|_| ())
                .map_err(|error| format!("Terminal konnte nicht gestartet werden: {error}"));
        }
        for program in ["x-terminal-emulator", "xterm"] {
            if which::which(program).is_ok() {
                return Command::new(program)
                    .current_dir(&path)
                    .spawn()
                    .map(|_| ())
                    .map_err(|error| format!("Terminal konnte nicht gestartet werden: {error}"));
            }
        }
        Err("Kein unterstütztes Terminal gefunden. Lege in den Einstellungen ein Terminal-Template fest.".to_string())
    }
}

#[tauri::command]
fn open_target(target: String) -> Result<(), String> {
    open::that(&target).map_err(|error| format!("Ziel konnte nicht geöffnet werden: {error}"))
}

#[tauri::command]
fn start_process(
    app: AppHandle,
    run_id: String,
    project_path: String,
    command: String,
    working_dir: Option<String>,
    env: HashMap<String, String>,
) -> Result<ProcessStarted, String> {
    if command.trim().is_empty() {
        return Err("Der Command ist leer.".to_string());
    }

    let project_root = PathBuf::from(&project_path);
    if !project_root.is_dir() {
        return Err(format!("Projektordner nicht gefunden: {project_path}"));
    }

    let run_dir = working_dir
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .map(|value| {
            if value.is_absolute() {
                value
            } else {
                project_root.join(value)
            }
        })
        .unwrap_or(project_root);

    if !run_dir.is_dir() {
        return Err(format!(
            "Arbeitsverzeichnis nicht gefunden: {}",
            display_path(&run_dir)
        ));
    }

    let mut process = shell_command(&command);
    process
        .current_dir(&run_dir)
        .envs(env)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = process
        .spawn()
        .map_err(|error| format!("Command konnte nicht gestartet werden: {error}"))?;
    let pid = child.id();

    if let Some(stdout) = child.stdout.take() {
        let app = app.clone();
        let run_id = run_id.clone();
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                let _ = app.emit(
                    "code-deck://process-output",
                    ProcessOutputEvent {
                        run_id: run_id.clone(),
                        stream: "stdout".to_string(),
                        line,
                    },
                );
            }
        });
    }

    if let Some(stderr) = child.stderr.take() {
        let app = app.clone();
        let run_id = run_id.clone();
        thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                let _ = app.emit(
                    "code-deck://process-output",
                    ProcessOutputEvent {
                        run_id: run_id.clone(),
                        stream: "stderr".to_string(),
                        line,
                    },
                );
            }
        });
    }

    thread::spawn(move || {
        let status = child.wait();
        let (exit_code, success) = match status {
            Ok(status) => (status.code(), status.success()),
            Err(_) => (None, false),
        };
        let _ = app.emit(
            "code-deck://process-exit",
            ProcessExitEvent {
                run_id,
                exit_code,
                success,
            },
        );
    });

    Ok(ProcessStarted { pid })
}

#[tauri::command]
fn stop_process(pid: u32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("taskkill");
        command
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        hide_console_window(&mut command);
        let status = command
            .status()
            .map_err(|error| format!("Prozess konnte nicht beendet werden: {error}"))?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("taskkill meldete einen Fehler für PID {pid}."))
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let group = format!("-{pid}");
        let status = Command::new("kill")
            .args(["-TERM", &group])
            .status()
            .map_err(|error| format!("Prozess konnte nicht beendet werden: {error}"))?;
        if status.success() {
            Ok(())
        } else {
            let fallback = Command::new("kill")
                .args(["-TERM", &pid.to_string()])
                .status()
                .map_err(|error| format!("Prozess konnte nicht beendet werden: {error}"))?;
            fallback
                .success()
                .then_some(())
                .ok_or_else(|| format!("kill meldete einen Fehler für PID {pid}."))
        }
    }
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|error| format!("Datei konnte nicht gelesen werden: {error}"))
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    fs::write(&path, contents)
        .map_err(|error| format!("Datei konnte nicht geschrieben werden: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_project_from_template,
            inspect_project,
            scan_projects,
            detect_editors,
            get_desktop_directory,
            launch_template,
            open_terminal,
            open_target,
            start_process,
            stop_process,
            read_text_file,
            write_text_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Code Deck");
}
