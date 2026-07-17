use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Read},
    path::PathBuf,
    process::{Command, Stdio},
    thread,
};
use tauri::{AppHandle, Emitter};

#[cfg(target_os = "windows")]
use crate::platform::launchers::hide_console_window;
use crate::{
    platform::{launchers::shell_command, notifications::send_system_notification},
    process::state::{ProcessExitEvent, ProcessOutputEvent, ProcessStarted},
    projects::validation::display_path,
};

fn stream_process_output<R>(reader: R, app: AppHandle, run_id: String, stream: &'static str)
where
    R: Read + Send + 'static,
{
    thread::spawn(move || {
        let mut reader = BufReader::new(reader);
        let mut bytes = Vec::new();

        loop {
            bytes.clear();
            match reader.read_until(b'\n', &mut bytes) {
                Ok(0) => break,
                Ok(_) => {
                    while matches!(bytes.last().copied(), Some(b'\n') | Some(b'\r')) {
                        bytes.pop();
                    }
                    let line = String::from_utf8_lossy(&bytes).into_owned();
                    let _ = app.emit(
                        "code-deck://process-output",
                        ProcessOutputEvent {
                            run_id: run_id.clone(),
                            stream: stream.to_string(),
                            line,
                        },
                    );
                }
                Err(error) => {
                    let _ = app.emit(
                        "code-deck://process-output",
                        ProcessOutputEvent {
                            run_id: run_id.clone(),
                            stream: "stderr".to_string(),
                            line: format!(
                                "[Code Deck] Output konnte nicht gelesen werden: {error}"
                            ),
                        },
                    );
                    break;
                }
            }
        }
    });
}

#[allow(clippy::too_many_arguments)]
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
        stream_process_output(stdout, app.clone(), run_id.clone(), "stdout");
    }

    if let Some(stderr) = child.stderr.take() {
        stream_process_output(stderr, app.clone(), run_id.clone(), "stderr");
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
        if notify_on_exit {
            let body = if success {
                format!("{label} wurde erfolgreich beendet.")
            } else {
                match exit_code {
                    Some(code) => format!("{label} ist mit Exit-Code {code} fehlgeschlagen."),
                    None => format!("{label} wurde unerwartet beendet."),
                }
            };
            send_system_notification("Code Deck", &body);
        }
    });

    Ok(ProcessStarted { pid })
}

pub(crate) fn stop_process(pid: u32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("taskkill");
        command
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        hide_console_window(&mut command);
        let status = command
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
