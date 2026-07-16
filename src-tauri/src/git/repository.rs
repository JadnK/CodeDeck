use std::{
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

use crate::platform::launchers::hide_console_window;

pub(crate) fn command_output(path: &Path, program: &str, args: &[&str]) -> Option<String> {
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

pub(crate) fn run_git(root: &Path, args: &[String]) -> Result<String, String> {
    if which::which("git").is_err() {
        return Err(
            "Git wurde nicht gefunden. Installiere Git und starte Code Deck neu.".to_string(),
        );
    }
    let mut command = Command::new("git");
    command
        .args(args)
        .current_dir(root)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_EDITOR", "true")
        .env("GIT_SEQUENCE_EDITOR", "true")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide_console_window(&mut command);
    let output = command
        .output()
        .map_err(|error| format!("Git konnte nicht gestartet werden: {error}"))?;
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Ok(if stdout.is_empty() { stderr } else { stdout })
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Err(if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            format!("Git wurde mit Status {} beendet.", output.status)
        })
    }
}

pub(crate) fn git_project_root(project_path: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(project_path);
    if !root.is_dir() {
        return Err(format!("Projektordner nicht gefunden: {project_path}"));
    }
    let is_git = command_output(&root, "git", &["rev-parse", "--is-inside-work-tree"])
        .is_some_and(|value| value == "true");
    if !is_git {
        return Err("Der Projektordner ist kein Git-Repository.".to_string());
    }
    Ok(root)
}

fn git_path_exists(root: &Path, name: &str) -> bool {
    command_output(root, "git", &["rev-parse", "--git-path", name])
        .map(|value| {
            let path = PathBuf::from(value);
            if path.is_absolute() {
                path.exists()
            } else {
                root.join(path).exists()
            }
        })
        .unwrap_or(false)
}

pub(crate) fn current_git_operation(root: &Path) -> Option<String> {
    if git_path_exists(root, "MERGE_HEAD") {
        Some("merge".to_string())
    } else if git_path_exists(root, "rebase-merge") || git_path_exists(root, "rebase-apply") {
        Some("rebase".to_string())
    } else if git_path_exists(root, "CHERRY_PICK_HEAD") {
        Some("cherry-pick".to_string())
    } else if git_path_exists(root, "REVERT_HEAD") {
        Some("revert".to_string())
    } else {
        None
    }
}

pub(crate) fn safe_repo_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    use std::path::Component;
    let relative_path = Path::new(relative);
    if relative_path.is_absolute()
        || relative_path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err("Ungültiger Repository-Pfad.".to_string());
    }
    let canonical_root = root
        .canonicalize()
        .map_err(|error| format!("Projektpfad konnte nicht geprüft werden: {error}"))?;
    let target = canonical_root.join(relative_path);
    let mut existing_ancestor = target.parent().unwrap_or(&canonical_root);
    while !existing_ancestor.exists() {
        existing_ancestor = existing_ancestor
            .parent()
            .ok_or_else(|| "Dateipfad konnte nicht geprüft werden.".to_string())?;
    }
    let canonical_ancestor = existing_ancestor
        .canonicalize()
        .map_err(|error| format!("Dateipfad konnte nicht geprüft werden: {error}"))?;
    if !canonical_ancestor.starts_with(&canonical_root) {
        return Err("Der Dateipfad liegt außerhalb des Projekts.".to_string());
    }
    if target.exists() {
        let canonical_target = target
            .canonicalize()
            .map_err(|error| format!("Dateipfad konnte nicht geprüft werden: {error}"))?;
        if !canonical_target.starts_with(&canonical_root) {
            return Err("Die Datei verweist auf einen Pfad außerhalb des Projekts.".to_string());
        }
    }
    Ok(target)
}

pub(crate) fn read_git_stage(
    root: &Path,
    stage: u8,
    file_path: &str,
) -> Result<(Option<String>, bool), String> {
    let spec = format!(":{stage}:{file_path}");
    let mut command = Command::new("git");
    command
        .args(["show", &spec])
        .current_dir(root)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    hide_console_window(&mut command);
    let output = command
        .output()
        .map_err(|error| format!("Konfliktversion konnte nicht gelesen werden: {error}"))?;
    if !output.status.success() {
        return Ok((None, false));
    }
    match String::from_utf8(output.stdout) {
        Ok(value) => Ok((Some(value), false)),
        Err(_) => Ok((None, true)),
    }
}
