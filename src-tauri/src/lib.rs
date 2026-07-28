mod commands {
    pub(crate) mod git;
    pub(crate) mod processes;
    pub(crate) mod projects;
}

mod git {
    pub(crate) mod parser;
    pub(crate) mod repository;
}

mod projects {
    pub(crate) mod inspection;
    pub(crate) mod templates;
    pub(crate) mod validation;
}

mod platform {
    pub(crate) mod launchers;
    pub(crate) mod notifications;
}

mod process {
    pub(crate) mod manager;
    pub(crate) mod state;
}

mod storage;

use tauri::{Manager, WindowEvent};

#[cfg(desktop)]
struct TrayMenuItems {
    show: tauri::menu::MenuItem<tauri::Wry>,
    hide: tauri::menu::MenuItem<tauri::Wry>,
    quit: tauri::menu::MenuItem<tauri::Wry>,
}

#[tauri::command]
fn set_application_language(app: tauri::AppHandle, language: String) -> Result<(), String> {
    #[cfg(desktop)]
    {
        let labels = if language.eq_ignore_ascii_case("de") {
            ("Code Deck öffnen", "Fenster ausblenden", "Code Deck beenden")
        } else {
            ("Open Code Deck", "Hide window", "Quit Code Deck")
        };
        let items = app.state::<TrayMenuItems>();
        items
            .show
            .set_text(labels.0)
            .map_err(|error| error.to_string())?;
        items
            .hide
            .set_text(labels.1)
            .map_err(|error| error.to_string())?;
        items
            .quit
            .set_text(labels.2)
            .map_err(|error| error.to_string())?;
    }

    #[cfg(not(desktop))]
    {
        let _ = (app, language);
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri::{
                    menu::{Menu, MenuItem},
                    tray::TrayIconBuilder,
                };

                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;

                let show_item =
                    MenuItem::with_id(app, "show", "Open Code Deck", true, None::<&str>)?;
                let hide_item =
                    MenuItem::with_id(app, "hide", "Hide window", true, None::<&str>)?;
                let quit_item =
                    MenuItem::with_id(app, "quit", "Quit Code Deck", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;
                app.manage(TrayMenuItems {
                    show: show_item.clone(),
                    hide: hide_item.clone(),
                    quit: quit_item.clone(),
                });
                let mut tray = TrayIconBuilder::new()
                    .tooltip("Code Deck")
                    .menu(&menu)
                    .show_menu_on_left_click(true)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                        "hide" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.hide();
                            }
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    });
                if let Some(icon) = app.default_window_icon() {
                    tray = tray.icon(icon.clone());
                }
                tray.build(app)?;

                if let Some(window) = app.get_webview_window("main") {
                    let window_for_close = window.clone();
                    window.on_window_event(move |event| {
                        if let WindowEvent::CloseRequested { api, .. } = event {
                            api.prevent_close();
                            let _ = window_for_close.hide();
                        }
                    });
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_application_language,
            commands::projects::create_project_from_template,
            commands::projects::clone_repository,
            commands::projects::inspect_project,
            commands::git::git_init_repository,
            commands::git::git_status,
            commands::git::git_branches,
            commands::git::git_diff,
            commands::git::git_stage,
            commands::git::git_unstage,
            commands::git::git_commit,
            commands::git::git_checkout_branch,
            commands::git::git_create_branch,
            commands::git::git_remote_action,
            commands::git::git_remote_url,
            commands::git::git_conflict_content,
            commands::git::git_resolve_conflict,
            commands::git::git_continue_operation,
            commands::git::git_abort_operation,
            commands::projects::scan_projects,
            commands::projects::detect_editors,
            commands::projects::get_desktop_directory,
            commands::projects::launch_template,
            commands::projects::open_terminal,
            commands::projects::open_target,
            commands::processes::start_process,
            commands::processes::stop_process,
            storage::read_text_file,
            storage::write_text_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Code Deck");
}
