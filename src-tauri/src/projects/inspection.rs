use serde::Serialize;
use std::{
    collections::{BTreeSet, HashMap},
    fs,
    path::Path,
};
use walkdir::WalkDir;

use crate::{git::repository::command_output, projects::validation::should_skip};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DetectedScript {
    pub(crate) name: String,
    pub(crate) command: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitCommit {
    pub(crate) hash: String,
    pub(crate) message: String,
    pub(crate) date: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectInspection {
    pub(crate) exists: bool,
    pub(crate) languages: Vec<String>,
    pub(crate) frameworks: Vec<String>,
    pub(crate) tools: Vec<String>,
    pub(crate) package_manager: Option<String>,
    pub(crate) scripts: Vec<DetectedScript>,
    pub(crate) is_git: bool,
    pub(crate) branch: Option<String>,
    pub(crate) changed_files: usize,
    pub(crate) last_commit: Option<GitCommit>,
    pub(crate) has_docker: bool,
    pub(crate) markers: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectCandidate {
    pub(crate) name: String,
    pub(crate) path: String,
    pub(crate) markers: Vec<String>,
    pub(crate) languages: Vec<String>,
    pub(crate) frameworks: Vec<String>,
    pub(crate) tools: Vec<String>,
    pub(crate) has_docker: bool,
}

pub(crate) fn marker_names(path: &Path) -> Vec<String> {
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
        .filter(|&(entry, _)| path.join(entry).exists())
        .map(|(_, label)| (*label).to_string())
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

pub(crate) fn inspect_project_path(root: &Path) -> ProjectInspection {
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
        let is_spring_boot =
            pom.contains("spring-boot") || pom.contains("org.springframework.boot");
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
