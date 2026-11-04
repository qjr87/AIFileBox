mod backend;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if let (Some(window), Some(icon)) = (
                tauri::Manager::get_webview_window(app, "main"),
                app.default_window_icon().cloned(),
            ) {
                let _ = window.set_icon(icon);
            }
            backend::initialize(&app.handle())?;
            backend::recover_operations(app.handle().clone())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            backend::list_libraries,
            backend::create_library,
            backend::update_library,
            backend::get_ai_settings,
            backend::save_ai_settings,
            backend::test_ai_connection,
            backend::list_ai_request_logs,
            backend::clear_ai_request_logs,
            backend::get_library_tree,
            backend::create_library_folder,
            backend::list_operations,
            backend::undo_operation,
            backend::recover_operations,
            backend::retry_operation,
            backend::reveal_path,
            backend::open_path,
            backend::agent::agent_create_plan,
            backend::agent::agent_update_plan,
            backend::agent::agent_update_draft,
            backend::agent::agent_execute_plan,
            backend::agent::agent_clean_duplicates,
            backend::agent::agent_undo_plan,
            backend::agent::agent_list_plans,
            backend::agent::agent_list_folder_entries,
            backend::agent::agent_inspect_paths,
            backend::rules::rules_get_global,
            backend::rules::rules_save_global,
            backend::rules::rules_get_folder,
            backend::rules::rules_save_folder,
            backend::rules::rules_draft_folder,
            backend::rules::rules_list_overviews,
            backend::rules::rules_regenerate_overviews,
            backend::rules::rules_open_external
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
