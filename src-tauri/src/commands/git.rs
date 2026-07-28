use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::{
    git::{
        parser::{parse_git_status_files, GitConflictContent, GitRepositoryStatus},
        repository::{
            command_output, current_git_operation, git_project_root, read_git_stage, run_git,
            safe_repo_path,
        },
    },
    projects::validation::display_path,
};

#[tauri::command]
pub(crate) fn git_remote_url(project_path: String) -> Result<Option<String>, String> {
    let root = git_project_root(&project_path)?;
    if let Some(origin) = command_output(&root, "git", &["remote", "get-url", "origin"])
        .filter(|value| !value.is_empty())
    {
        return Ok(Some(origin));
    }

    let remote_name = command_output(&root, "git", &["remote"]).and_then(|value| {
        value
            .lines()
            .map(str::trim)
            .find(|line| !line.is_empty())
            .map(ToString::to_string)
    });
    let Some(remote_name) = remote_name else {
        return Ok(None);
    };

    Ok(
        command_output(&root, "git", &["remote", "get-url", remote_name.as_str()])
            .filter(|value| !value.is_empty()),
    )
}

#[tauri::command]
pub(crate) fn git_init_repository(project_path: String) -> Result<(), String> {
    let root = PathBuf::from(project_path.trim());
    if !root.is_dir() {
        return Err(format!(
            "Projektordner nicht gefunden: {}",
            display_path(&root)
        ));
    }
    run_git(&root, &["init".to_string()]).map(|_| ())
}

#[tauri::command]
pub(crate) fn git_status(project_path: String) -> Result<GitRepositoryStatus, String> {
    let root = git_project_root(&project_path)?;
    let branch = command_output(&root, "git", &["branch", "--show-current"])
        .filter(|value| !value.is_empty())
        .or_else(|| command_output(&root, "git", &["rev-parse", "--short", "HEAD"]));
    let upstream = command_output(
        &root,
        "git",
        &[
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}",
        ],
    )
    .filter(|value| !value.is_empty());
    let (ahead, behind) = upstream
        .as_ref()
        .and_then(|_| {
            command_output(
                &root,
                "git",
                &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
            )
        })
        .and_then(|value| {
            let mut parts = value.split_whitespace();
            Some((parts.next()?.parse().ok()?, parts.next()?.parse().ok()?))
        })
        .unwrap_or((0, 0));
    let raw = run_git(
        &root,
        &[
            "status".to_string(),
            "--short".to_string(),
            "-z".to_string(),
            "--untracked-files=all".to_string(),
        ],
    )?;

    Ok(GitRepositoryStatus {
        branch,
        upstream,
        ahead,
        behind,
        operation: current_git_operation(&root),
        files: parse_git_status_files(&raw),
    })
}

#[tauri::command]
pub(crate) fn git_branches(project_path: String) -> Result<Vec<String>, String> {
    let root = git_project_root(&project_path)?;
    let output = run_git(
        &root,
        &[
            "branch".to_string(),
            "--format=%(refname:short)".to_string(),
        ],
    )?;
    Ok(output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToString::to_string)
        .collect())
}

fn binary_untracked_file_diff(file_path: &str) -> String {
    format!(
        "diff --git a/{0} b/{0}\nnew file mode 100644\nBinary files /dev/null and b/{0} differ",
        file_path
    )
}

fn untracked_file_diff(file_path: &str, bytes: Vec<u8>) -> String {
    if bytes.contains(&0) {
        return binary_untracked_file_diff(file_path);
    }

    let Ok(content) = String::from_utf8(bytes) else {
        return binary_untracked_file_diff(file_path);
    };

    let normalized = content.replace("\r\n", "\n").replace('\r', "\n");
    if normalized.is_empty() {
        return format!(
            "diff --git a/{0} b/{0}\nnew file mode 100644\n--- /dev/null\n+++ b/{0}",
            file_path
        );
    }

    let lines = normalized.lines().collect::<Vec<_>>();
    let mut diff = format!(
        "diff --git a/{0} b/{0}\nnew file mode 100644\n--- /dev/null\n+++ b/{0}\n@@ -0,0 +1,{1} @@\n",
        file_path,
        lines.len()
    );

    for line in lines {
        diff.push('+');
        diff.push_str(line);
        diff.push('\n');
    }
    if !normalized.ends_with('\n') {
        diff.push_str("\\ No newline at end of file\n");
    }

    diff.trim_end_matches('\n').to_string()
}

fn tracked_file_diff(root: &Path, file_path: &str, cached: bool) -> Result<String, String> {
    let mut args = vec![
        "diff".to_string(),
        "--no-ext-diff".to_string(),
        "--no-color".to_string(),
    ];
    if cached {
        args.push("--cached".to_string());
    }
    args.extend(["--".to_string(), file_path.to_string()]);
    run_git(root, &args)
}

#[tauri::command]
pub(crate) fn git_diff(
    project_path: String,
    file_path: String,
    staged: bool,
    unstaged: bool,
    untracked: bool,
) -> Result<String, String> {
    let root = git_project_root(&project_path)?;
    let target = safe_repo_path(&root, &file_path)?;

    if untracked {
        let bytes = fs::read(&target).map_err(|error| {
            format!(
                "Untracked file could not be read ({}): {error}",
                display_path(&target)
            )
        })?;
        return Ok(untracked_file_diff(&file_path, bytes));
    }

    let mut sections = Vec::new();
    if staged {
        let staged_diff = tracked_file_diff(&root, &file_path, true)?;
        if !staged_diff.is_empty() {
            sections.push(staged_diff);
        }
    }
    if unstaged || !staged {
        let unstaged_diff = tracked_file_diff(&root, &file_path, false)?;
        if !unstaged_diff.is_empty() {
            sections.push(unstaged_diff);
        }
    }

    Ok(sections.join("\n\n"))
}

#[cfg(test)]
mod diff_tests {
    use super::untracked_file_diff;

    #[test]
    fn renders_untracked_text_as_added_lines() {
        let diff = untracked_file_diff("src/example.txt", b"first\nsecond\n".to_vec());
        assert!(diff.contains("--- /dev/null"));
        assert!(diff.contains("+++ b/src/example.txt"));
        assert!(diff.contains("@@ -0,0 +1,2 @@"));
        assert!(diff.contains("+first\n+second"));
    }

    #[test]
    fn reports_binary_untracked_files() {
        let diff = untracked_file_diff("image.bin", vec![0xff, 0xfe, 0xfd]);
        assert!(diff.contains("new file mode 100644"));
        assert!(diff.contains("Binary files /dev/null and b/image.bin differ"));
    }

    #[test]
    fn treats_nul_bytes_as_binary() {
        let diff = untracked_file_diff("data.bin", b"hello\0world".to_vec());
        assert!(diff.contains("Binary files /dev/null and b/data.bin differ"));
    }
}

#[tauri::command]
pub(crate) fn git_stage(project_path: String, paths: Vec<String>) -> Result<(), String> {
    let root = git_project_root(&project_path)?;
    if paths.is_empty() {
        return Err("Wähle mindestens eine Datei aus.".to_string());
    }
    for path in &paths {
        let _ = safe_repo_path(&root, path)?;
    }
    let mut args = vec!["add".to_string(), "--".to_string()];
    args.extend(paths);
    run_git(&root, &args).map(|_| ())
}

#[tauri::command]
pub(crate) fn git_unstage(project_path: String, paths: Vec<String>) -> Result<(), String> {
    let root = git_project_root(&project_path)?;
    if paths.is_empty() {
        return Err("Wähle mindestens eine Datei aus.".to_string());
    }
    for path in &paths {
        let _ = safe_repo_path(&root, path)?;
    }
    let mut args = vec![
        "restore".to_string(),
        "--staged".to_string(),
        "--".to_string(),
    ];
    args.extend(paths);
    run_git(&root, &args).map(|_| ())
}

#[tauri::command]
pub(crate) fn git_commit(project_path: String, message: String) -> Result<(), String> {
    let root = git_project_root(&project_path)?;
    let message = message.trim();
    if message.is_empty() {
        return Err("Die Commit-Nachricht darf nicht leer sein.".to_string());
    }
    run_git(
        &root,
        &["commit".to_string(), "-m".to_string(), message.to_string()],
    )
    .map(|_| ())
}

#[tauri::command]
pub(crate) fn git_checkout_branch(project_path: String, branch: String) -> Result<(), String> {
    let root = git_project_root(&project_path)?;
    let branch = branch.trim();
    if branch.is_empty() || branch.starts_with('-') {
        return Err("Ungültiger Branch-Name.".to_string());
    }
    run_git(&root, &["switch".to_string(), branch.to_string()]).map(|_| ())
}

#[tauri::command]
pub(crate) fn git_create_branch(project_path: String, branch: String) -> Result<(), String> {
    let root = git_project_root(&project_path)?;
    let branch = branch.trim();
    if branch.is_empty() || branch.starts_with('-') || branch.chars().any(char::is_whitespace) {
        return Err("Ungültiger Branch-Name.".to_string());
    }
    run_git(
        &root,
        &["switch".to_string(), "-c".to_string(), branch.to_string()],
    )
    .map(|_| ())
}

#[tauri::command]
pub(crate) fn git_remote_action(project_path: String, action: String) -> Result<String, String> {
    let root = git_project_root(&project_path)?;
    let args = match action.as_str() {
        "fetch" => vec!["fetch".to_string(), "--prune".to_string()],
        "pull" => vec!["pull".to_string()],
        "push" => vec!["push".to_string()],
        _ => return Err("Unbekannte Git-Aktion.".to_string()),
    };
    run_git(&root, &args)
}

#[tauri::command]
pub(crate) fn git_conflict_content(
    project_path: String,
    file_path: String,
) -> Result<GitConflictContent, String> {
    let root = git_project_root(&project_path)?;
    let target = safe_repo_path(&root, &file_path)?;
    let (base, base_binary) = read_git_stage(&root, 1, &file_path)?;
    let (current, current_binary) = read_git_stage(&root, 2, &file_path)?;
    let (incoming, incoming_binary) = read_git_stage(&root, 3, &file_path)?;
    let (working_tree, working_binary) = match fs::read(&target) {
        Ok(bytes) => match String::from_utf8(bytes) {
            Ok(value) => (value, false),
            Err(_) => (String::new(), true),
        },
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => (String::new(), false),
        Err(error) => {
            return Err(format!(
                "Konfliktdatei konnte nicht gelesen werden: {error}"
            ))
        }
    };
    Ok(GitConflictContent {
        path: file_path,
        base,
        current: current.unwrap_or_default(),
        incoming: incoming.unwrap_or_default(),
        working_tree,
        binary: base_binary || current_binary || incoming_binary || working_binary,
    })
}

#[tauri::command]
pub(crate) fn git_resolve_conflict(
    project_path: String,
    file_path: String,
    contents: String,
) -> Result<(), String> {
    let root = git_project_root(&project_path)?;
    let target = safe_repo_path(&root, &file_path)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Zielordner konnte nicht erstellt werden: {error}"))?;
    }
    fs::write(&target, contents)
        .map_err(|error| format!("Aufgelöste Datei konnte nicht gespeichert werden: {error}"))?;
    run_git(&root, &["add".to_string(), "--".to_string(), file_path]).map(|_| ())
}

#[tauri::command]
pub(crate) fn git_continue_operation(project_path: String) -> Result<(), String> {
    let root = git_project_root(&project_path)?;
    let operation = current_git_operation(&root)
        .ok_or_else(|| "Es läuft keine fortsetzbare Git-Operation.".to_string())?;
    let args = match operation.as_str() {
        "merge" => vec!["merge".to_string(), "--continue".to_string()],
        "rebase" => vec!["rebase".to_string(), "--continue".to_string()],
        "cherry-pick" => vec!["cherry-pick".to_string(), "--continue".to_string()],
        "revert" => vec!["revert".to_string(), "--continue".to_string()],
        _ => return Err("Unbekannte Git-Operation.".to_string()),
    };
    run_git(&root, &args).map(|_| ())
}

#[tauri::command]
pub(crate) fn git_abort_operation(project_path: String) -> Result<(), String> {
    let root = git_project_root(&project_path)?;
    let operation = current_git_operation(&root)
        .ok_or_else(|| "Es läuft keine abbrechbare Git-Operation.".to_string())?;
    let args = match operation.as_str() {
        "merge" => vec!["merge".to_string(), "--abort".to_string()],
        "rebase" => vec!["rebase".to_string(), "--abort".to_string()],
        "cherry-pick" => vec!["cherry-pick".to_string(), "--abort".to_string()],
        "revert" => vec!["revert".to_string(), "--abort".to_string()],
        _ => return Err("Unbekannte Git-Operation.".to_string()),
    };
    run_git(&root, &args).map(|_| ())
}
