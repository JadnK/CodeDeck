use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};
use walkdir::WalkDir;

use crate::{
    platform::launchers::hide_console_window,
    projects::validation::{
        display_path, java_package_segment, package_slug, safe_java_package_base,
        safe_project_name, should_skip,
    },
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreatedProject {
    pub(crate) name: String,
    pub(crate) path: String,
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

pub(crate) fn create_project_from_template(
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
