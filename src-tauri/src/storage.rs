use std::fs;

#[tauri::command]
pub(crate) fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|error| format!("Datei konnte nicht gelesen werden: {error}"))
}

#[tauri::command]
pub(crate) fn write_text_file(path: String, contents: String) -> Result<(), String> {
    fs::write(&path, contents)
        .map_err(|error| format!("Datei konnte nicht geschrieben werden: {error}"))
}
