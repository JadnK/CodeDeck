use std::collections::HashMap;

use tauri::AppHandle;

use crate::{
    process::{manager, state::ProcessStarted},
};

#[tauri::command]
pub(crate) fn start_process(
    app: AppHandle,
    run_id: String,
    project_path: String,
    command: String,
    working_dir: Option<String>,
    env: HashMap<String, String>,
    label: String,
    notify_on_exit: bool,
) -> Result<ProcessStarted, String> {
    manager::start_process(
        app,
        run_id,
        project_path,
        command,
        working_dir,
        env,
        label,
        notify_on_exit,
    )
}

#[tauri::command]
pub(crate) fn stop_process(pid: u32) -> Result<(), String> {
    manager::stop_process(pid)
}
