mod backend;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
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
            backend::get_library_tree,
            backend::create_library_folder,
            backend::import_paths,
            backend::list_items,
            backend::classify_items,
            backend::update_item_recommendation,
            backend::archive_items,
            backend::list_operations,
            backend::undo_operation,
            backend::recover_operations,
            backend::retry_operation,
            backend::reveal_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
