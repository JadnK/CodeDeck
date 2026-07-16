use std::path::Path;

pub(crate) fn display_path(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

pub(crate) fn project_name(path: &Path) -> String {
    path.file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("Project")
        .to_string()
}

pub(crate) fn safe_project_name(value: &str) -> Result<String, String> {
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

pub(crate) fn package_slug(value: &str) -> String {
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

pub(crate) fn java_package_segment(value: &str) -> String {
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

pub(crate) fn safe_java_package_base(value: Option<&str>) -> Result<String, String> {
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

pub(crate) fn should_skip(entry: &walkdir::DirEntry) -> bool {
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
