mod wallpaper;

use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use wallpaper::{OptimizeRequest, OptimizeResult};

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not open the PixelForge data folder: {error}"))?;
    fs::create_dir_all(&dir).map_err(|error| format!("Could not create the data folder: {error}"))?;
    Ok(dir)
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn detect_displays() -> Vec<wallpaper::DisplayInfo> {
    wallpaper::platform::list_displays()
}

/// Crop + upscale the source image to the exact target resolution and save it
/// inside the PixelForge wallpaper folder. Returns the saved file path.
#[tauri::command]
fn optimize_wallpaper(app: AppHandle, request: OptimizeRequest) -> Result<OptimizeResult, String> {
    let mut result = wallpaper::optimize_image(request)?;
    let dir = wallpaper::wallpaper_dir(&data_dir(&app)?);
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Could not create the wallpaper folder: {error}"))?;

    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or(0);
    let file_path = dir.join(format!("pixelforge-{stamp}.png"));

    fs::write(&file_path, &result.png_bytes)
        .map_err(|error| format!("Could not save the wallpaper: {error}"))?;

    result.path = file_path.to_string_lossy().to_string();
    Ok(result)
}

/// Apply an already-saved wallpaper file to the desktop.
#[tauri::command]
fn set_wallpaper(path: String) -> Result<(), String> {
    wallpaper::platform::apply_wallpaper(&path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let window = app
                .get_webview_window("main")
                .expect("main PixelForge window should exist");
            let icon = tauri::image::Image::from_app_icon_resource(32)
                .expect("PixelForge app icon should be available");
            window
                .set_icon(icon)
                .expect("PixelForge window icon should be set");
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            detect_displays,
            optimize_wallpaper,
            set_wallpaper
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
