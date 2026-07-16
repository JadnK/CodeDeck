use serde::Serialize;
#[cfg(target_os = "windows")]
use std::collections::BTreeSet;
use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};
#[cfg(target_os = "windows")]
use walkdir::WalkDir;

use crate::projects::validation::{display_path, project_name};

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(target_os = "windows")]
pub(crate) fn hide_console_window(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn hide_console_window(_command: &mut Command) {}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EditorSuggestion {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) command_template: String,
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

#[cfg(not(target_os = "macos"))]
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
                candidates
                    .push(root.join("Programs/Microsoft VS Code Insiders/Code - Insiders.exe"));
                candidates.push(root.join("Microsoft/WindowsApps/code.exe"));
            }
            for root in [program_files.as_ref(), program_files_x86.as_ref()]
                .into_iter()
                .flatten()
            {
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
            for root in [program_files.as_ref(), program_files_x86.as_ref()]
                .into_iter()
                .flatten()
            {
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
            if filenames
                .iter()
                .any(|expected| filename.eq_ignore_ascii_case(expected))
            {
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
        "vscode", "cursor", "windsurf", "zed", "sublime", "idea", "webstorm", "pycharm", "rider",
        "clion", "goland", "phpstorm", "rubymine", "datagrip", "fleet",
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
                if filenames
                    .iter()
                    .any(|expected| filename.eq_ignore_ascii_case(expected))
                {
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
    let flatpak_editors = [("vscode", "VS Code (Flatpak)", "com.visualstudio.code")];

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
    command
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

#[cfg(all(unix, not(target_os = "macos")))]
fn flatpak_editor_template(flatpak: &Path, app_id: &str) -> String {
    format!(
        "\"{}\" run {} \"{{projectPath}}\"",
        display_path(flatpak).replace('\"', "\\\""),
        app_id
    )
}

pub(crate) fn detect_editors() -> Vec<EditorSuggestion> {
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
    suggestions.sort_by_key(|entry| entry.name.to_lowercase());
    suggestions
}

pub(crate) fn get_desktop_directory() -> Result<String, String> {
    let path = dirs::desktop_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| "Der Desktop-Ordner konnte nicht ermittelt werden.".to_string())?;
    Ok(display_path(&path))
}

pub(crate) fn shell_command(script: &str) -> Command {
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

pub(crate) fn launch_template(
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
    command.spawn().map(|_| ()).map_err(|error| {
        format!(
            "IDE '{}' konnte nicht gestartet werden: {error}",
            display_path(&resolved_program)
        )
    })
}

pub(crate) fn open_terminal(project_path: String, terminal_command: String) -> Result<(), String> {
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

pub(crate) fn open_target(target: String) -> Result<(), String> {
    open::that(&target).map_err(|error| format!("Ziel konnte nicht geöffnet werden: {error}"))
}
