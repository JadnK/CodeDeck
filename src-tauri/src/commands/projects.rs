use std::{
    path::PathBuf,
    process::{Command, Stdio},
};
use walkdir::WalkDir;

use crate::{
    platform::launchers::{self, hide_console_window, EditorSuggestion},
    projects::{
        inspection::{inspect_project_path, marker_names, ProjectCandidate, ProjectInspection},
        templates::{self, CreatedProject},
        validation::{display_path, project_name, safe_project_name, should_skip},
    },
};

#[tauri::command]
pub(crate) fn create_project_from_template(
    parent_path: String,
    project_name: String,
    template_id: String,
    custom_template_path: Option<String>,
    init_git: bool,
    java_package_base: Option<String>,
) -> Result<CreatedProject, String> {
    templates::create_project_from_template(
        parent_path,
        project_name,
        template_id,
        custom_template_path,
        init_git,
        java_package_base,
    )
}

fn repository_name_from_url(repository_url: &str) -> Option<String> {
    let trimmed = repository_url
        .trim()
        .trim_end_matches(|character| character == '/' || character == '\\');
    let segment = trimmed
        .rsplit(|character| matches!(character, '/' | '\\' | ':'))
        .next()?
        .trim_end_matches(".git")
        .trim();
    (!segment.is_empty()).then(|| segment.to_string())
}

#[tauri::command]
pub(crate) fn clone_repository(
    repository_url: String,
    parent_path: String,
    directory_name: Option<String>,
    branch: Option<String>,
    shallow: bool,
) -> Result<CreatedProject, String> {
    let repository_url = repository_url.trim();
    if repository_url.is_empty() {
        return Err("Die Repository-URL darf nicht leer sein.".to_string());
    }
    if which::which("git").is_err() {
        return Err("Git wurde nicht gefunden. Installiere Git und starte Code Deck neu.".to_string());
    }

    let parent = PathBuf::from(parent_path.trim());
    if !parent.is_dir() {
        return Err(format!("Der Zielordner wurde nicht gefunden: {}", display_path(&parent)));
    }
    let inferred_name = repository_name_from_url(repository_url)
        .ok_or_else(|| "Aus der Repository-URL konnte kein Ordnername ermittelt werden.".to_string())?;
    let name = safe_project_name(directory_name.as_deref().filter(|value| !value.trim().is_empty()).unwrap_or(&inferred_name))?;
    let destination = parent.join(&name);
    if destination.exists() {
        return Err(format!("Der Zielordner existiert bereits: {}", display_path(&destination)));
    }

    let mut args = vec!["clone".to_string(), "--progress".to_string()];
    if shallow {
        args.extend(["--depth".to_string(), "1".to_string()]);
    }
    if let Some(branch) = branch.filter(|value| !value.trim().is_empty()) {
        let branch = branch.trim();
        if branch.starts_with('-') {
            return Err("Ungültiger Branch- oder Tag-Name.".to_string());
        }
        args.extend(["--branch".to_string(), branch.to_string()]);
    }
    args.push("--".to_string());
    args.push(repository_url.to_string());
    args.push(name.clone());

    let mut command = Command::new("git");
    command
        .args(&args)
        .current_dir(&parent)
        .env("GIT_TERMINAL_PROMPT", "0")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide_console_window(&mut command);
    let output = command
        .output()
        .map_err(|error| format!("Repository konnte nicht geklont werden: {error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Err(if !stderr.is_empty() { stderr } else { stdout });
    }

    Ok(CreatedProject {
        name,
        path: display_path(&destination),
    })
}

#[tauri::command]
pub(crate) fn inspect_project(path: String) -> Result<ProjectInspection, String> {
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

#[tauri::command]
pub(crate) fn scan_projects(path: String) -> Result<Vec<ProjectCandidate>, String> {
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

#[tauri::command]
pub(crate) fn detect_editors() -> Vec<EditorSuggestion> {
    launchers::detect_editors()
}

#[tauri::command]
pub(crate) fn get_desktop_directory() -> Result<String, String> {
    launchers::get_desktop_directory()
}

#[tauri::command]
pub(crate) fn launch_template(
    command_template: String,
    project_path: String,
    project_name: String,
) -> Result<(), String> {
    launchers::launch_template(command_template, project_path, project_name)
}

#[tauri::command]
pub(crate) fn open_terminal(
    project_path: String,
    terminal_command: String,
) -> Result<(), String> {
    launchers::open_terminal(project_path, terminal_command)
}

#[tauri::command]
pub(crate) fn open_target(target: String) -> Result<(), String> {
    launchers::open_target(target)
}
