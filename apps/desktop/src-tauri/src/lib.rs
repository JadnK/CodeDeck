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
    frameworks: Vec<String>,
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
        ("docker-compose.yml", "docker-compose.yml"),
        ("docker-compose.yaml", "docker-compose.yaml"),
    ];

    candidates
        .iter()
        .filter_map(|(entry, label)| path.join(entry).exists().then(|| (*label).to_string()))
        .collect()
}

fn command_output(path: &Path, program: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(program)
        .args(args)
        .current_dir(path)
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .ok()?;

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
    frameworks: &mut BTreeSet<String>,
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

    let mappings = [
        ("react", "React"),
        ("next", "Next.js"),
        ("vue", "Vue"),
        ("nuxt", "Nuxt"),
        ("svelte", "Svelte"),
        ("@sveltejs/kit", "SvelteKit"),
        ("@angular/core", "Angular"),
        ("vite", "Vite"),
        ("astro", "Astro"),
        ("solid-js", "SolidJS"),
        ("express", "Express"),
        ("fastify", "Fastify"),
        ("@nestjs/core", "NestJS"),
        ("electron", "Electron"),
        ("@tauri-apps/api", "Tauri"),
        ("typescript", "TypeScript"),
    ];

    for (dependency, label) in mappings {
        if dependencies.contains(dependency) {
            frameworks.insert(label.to_string());
        }
    }

    frameworks.insert("Node.js".to_string());
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

fn create_builtin_template(root: &Path, name: &str, template_id: &str) -> Result<(), String> {
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
            let segment = java_package_segment(name);
            let package = format!("dev.codedeck.{segment}");
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
  <groupId>dev.codedeck</groupId>
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
        create_builtin_template(&destination, &name, &template_id)
    };

    if let Err(error) = result {
        let _ = fs::remove_dir_all(&destination);
        return Err(error);
    }

    if init_git && which::which("git").is_ok() {
        let _ = Command::new("git")
            .args(["init"])
            .current_dir(&destination)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }

    Ok(CreatedProject {
        name,
        path: display_path(&destination),
    })
}

#[tauri::command]
fn inspect_project(path: String) -> Result<ProjectInspection, String> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Ok(ProjectInspection {
            exists: false,
            frameworks: vec![],
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

    let markers = marker_names(&root);
    let mut frameworks = BTreeSet::new();
    let mut scripts = Vec::new();
    inspect_package_json(&root, &mut frameworks, &mut scripts);

    if root.join("Cargo.toml").exists() {
        frameworks.insert("Rust".to_string());
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
        frameworks.insert("Java".to_string());
        frameworks.insert("Spring Boot".to_string());
        frameworks.insert("Maven".to_string());
        scripts.extend([
            DetectedScript {
                name: "Spring Boot starten".to_string(),
                command: "mvn spring-boot:run".to_string(),
            },
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
    if root.join("build.gradle").exists() || root.join("build.gradle.kts").exists() {
        frameworks.insert("Java".to_string());
        frameworks.insert("Gradle".to_string());
    }
    if root.join("src-tauri").is_dir() {
        frameworks.insert("Tauri".to_string());
    }
    if root.join("pyproject.toml").exists() || root.join("requirements.txt").exists() {
        frameworks.insert("Python".to_string());
        if root.join("main.py").exists() {
            scripts.push(DetectedScript {
                name: "Python starten".to_string(),
                command: "python main.py".to_string(),
            });
        }
    }
    if root.join("go.mod").exists() {
        frameworks.insert("Go".to_string());
    }
    if root.join("pubspec.yaml").exists() {
        frameworks.insert("Flutter".to_string());
    }

    let has_docker = root.join("Dockerfile").exists()
        || root.join("docker-compose.yml").exists()
        || root.join("docker-compose.yaml").exists()
        || root.join("compose.yml").exists()
        || root.join("compose.yaml").exists();
    if has_docker {
        frameworks.insert("Docker".to_string());
    }

    let is_git = root.join(".git").exists()
        || command_output(&root, "git", &["rev-parse", "--is-inside-work-tree"])
            .is_some_and(|value| value == "true");

    let (branch, changed_files, last_commit) = if is_git {
        let branch = command_output(&root, "git", &["branch", "--show-current"])
            .filter(|value| !value.is_empty())
            .or_else(|| command_output(&root, "git", &["rev-parse", "--short", "HEAD"]));
        let changed_files = command_output(&root, "git", &["status", "--porcelain"])
            .map(|value| value.lines().filter(|line| !line.trim().is_empty()).count())
            .unwrap_or(0);
        let last_commit = command_output(
            &root,
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

    Ok(ProjectInspection {
        exists: true,
        frameworks: frameworks.into_iter().collect(),
        package_manager: package_manager(&root),
        scripts,
        is_git,
        branch,
        changed_files,
        last_commit,
        has_docker,
        markers,
    })
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
        candidates.push(ProjectCandidate {
            name: project_name(entry.path()),
            path: display_path(entry.path()),
            markers,
        });
        if candidates.len() >= 500 {
            break;
        }
    }

    candidates.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    candidates.dedup_by(|a, b| a.path.eq_ignore_ascii_case(&b.path));
    Ok(candidates)
}

fn editor_candidate(
    id: &str,
    name: &str,
    executable: &str,
    template: &str,
) -> Option<EditorSuggestion> {
    which::which(executable).ok().map(|_| EditorSuggestion {
        id: id.to_string(),
        name: name.to_string(),
        command_template: template.to_string(),
    })
}

#[tauri::command]
fn detect_editors() -> Vec<EditorSuggestion> {
    let mut suggestions = Vec::new();
    let candidates = [
        ("vscode", "VS Code", "code", "code \"{projectPath}\""),
        ("cursor", "Cursor", "cursor", "cursor \"{projectPath}\""),
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
        (
            "fleet",
            "JetBrains Fleet",
            "fleet",
            "fleet \"{projectPath}\"",
        ),
    ];

    for (id, name, executable, template) in candidates {
        if let Some(suggestion) = editor_candidate(id, name, executable, template) {
            suggestions.push(suggestion);
        }
    }

    suggestions
}

fn shell_command(script: &str) -> Command {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let mut command = Command::new("cmd.exe");
        command.args(["/D", "/S", "/C", script]);
        command.creation_flags(0x08000000);
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

#[tauri::command]
fn launch_template(
    command_template: String,
    project_path: String,
    project_name: String,
) -> Result<(), String> {
    if command_template.trim().is_empty() {
        return Err("Das Command-Template ist leer.".to_string());
    }
    let script = fill_template(&command_template, &project_path, &project_name);
    shell_command(&script)
        .current_dir(&project_path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Command konnte nicht gestartet werden: {error}"))
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
        let status = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
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
        .invoke_handler(tauri::generate_handler![
            create_project_from_template,
            inspect_project,
            scan_projects,
            detect_editors,
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
