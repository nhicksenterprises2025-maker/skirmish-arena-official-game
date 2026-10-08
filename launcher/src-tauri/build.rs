fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "launcher_settings",
            "save_server",
            "server_status",
            "check_launcher_update",
            "play",
            "install_launcher_update",
            "finish_game_checkpoint",
            "game_fullscreen_state",
            "set_game_fullscreen",
            "check_local_backend",
            "quit_game",
            "open_sandbox_checkout",
        ]),
    ))
    .expect("Could not generate launcher capabilities");
}
