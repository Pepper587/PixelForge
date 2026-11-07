use std::path::PathBuf;

use base64::Engine;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Clone, Debug)]
pub struct DisplayInfo {
    pub index: usize,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub is_primary: bool,
    pub is_virtual: bool,
}

#[derive(Serialize)]
pub struct OptimizeResult {
    pub path: String,
    pub width: u32,
    pub height: u32,
    pub source_width: u32,
    pub source_height: u32,
    pub upscaled: bool,
    pub cropped: bool,
    pub bytes: u64,
    #[serde(skip_serializing)]
    pub png_bytes: Vec<u8>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptimizeRequest {
    /// Base64 encoded bytes of the source image.
    pub data_base64: String,
    pub target_width: u32,
    pub target_height: u32,
    /// Focal point in percent (0-100) used to pick the crop region.
    pub focal_x: f32,
    pub focal_y: f32,
    /// "fill" crops to the target ratio, "stretch" fits the whole image, "fit" letterboxes.
    pub mode: String,
}

/// A light 3x3 convolution sharpen, applied after the resample so the result
/// stays crisp instead of looking soft.
fn sharpen(buffer: &mut image::RgbaImage, amount: f32) {
    let (width, height) = buffer.dimensions();
    if width < 3 || height < 3 {
        return;
    }
    let source = buffer.clone();
    let pixels = source.as_raw();
    let kernel: [f32; 9] = [
        0.0, -amount, 0.0, -amount, 1.0 + 4.0 * amount, -amount, 0.0, -amount, 0.0,
    ];

    for y in 1..(height - 1) {
        for x in 1..(width - 1) {
            for channel in 0..3u32 {
                let mut sum = 0.0f32;
                for ky in 0..3usize {
                    for kx in 0..3usize {
                        let sx = (x as isize + kx as isize - 1) as u32;
                        let sy = (y as isize + ky as isize - 1) as u32;
                        let index = ((sy * width + sx) * 4 + channel) as usize;
                        sum += pixels[index] as f32 * kernel[ky * 3 + kx];
                    }
                }
                let value = sum.clamp(0.0, 255.0) as u8;
                let index = ((y * width + x) * 4 + channel) as usize;
                buffer.as_mut()[index] = value;
            }
        }
    }
}

/// Decode an image, crop it to the target aspect ratio around the focal point,
/// then resample it to the exact physical resolution of the display.
pub fn optimize_image(request: OptimizeRequest) -> Result<OptimizeResult, String> {
    if request.target_width == 0 || request.target_height == 0 {
        return Err("Target display resolution is unknown.".into());
    }

    let raw = base64::engine::general_purpose::STANDARD
        .decode(request.data_base64.as_bytes())
        .map_err(|error| format!("Could not decode the image payload: {error}"))?;

    let source = image::load_from_memory(&raw)
        .map_err(|error| format!("Could not read that image: {error}"))?;
    let source_width = source.width();
    let source_height = source.height();

    let mut working = source.to_rgba8();

    if request.mode == "fill" {
        let target_ratio = request.target_width as f32 / request.target_height as f32;
        let source_ratio = source_width as f32 / source_height as f32;

        if (source_ratio - target_ratio).abs() > 0.001 {
            let (crop_width, crop_height) = if source_ratio > target_ratio {
                // Source is wider than the target: trim the sides.
                let height = source_height;
                let width = ((height as f32) * target_ratio).round() as u32;
                (width.clamp(1, source_width), height)
            } else {
                // Source is taller than the target: trim top and bottom.
                let width = source_width;
                let height = ((width as f32) / target_ratio).round() as u32;
                (width, height.clamp(1, source_height))
            };

            let focal_x =
                (request.focal_x.clamp(0.0, 100.0) / 100.0) * (source_width - crop_width) as f32;
            let focal_y =
                (request.focal_y.clamp(0.0, 100.0) / 100.0) * (source_height - crop_height) as f32;
            let x = focal_x.round().clamp(0.0, (source_width - crop_width) as f32) as u32;
            let y = focal_y.round().clamp(0.0, (source_height - crop_height) as f32) as u32;

            working = image::imageops::crop_imm(&working, x, y, crop_width, crop_height).to_image();
        }
    }

    let resized = image::DynamicImage::ImageRgba8(working).resize_exact(
        request.target_width,
        request.target_height,
        image::imageops::FilterType::Lanczos3,
    );

    let mut sharpened = resized.to_rgba8();
    sharpen(&mut sharpened, 0.35);

    let mut buffer = Vec::new();
    image::DynamicImage::ImageRgba8(sharpened)
        .write_to(&mut std::io::Cursor::new(&mut buffer), image::ImageFormat::Png)
        .map_err(|error| format!("Could not encode the optimized wallpaper: {error}"))?;

    let bytes = buffer.len() as u64;
    Ok(OptimizeResult {
        path: String::new(),
        width: request.target_width,
        height: request.target_height,
        source_width,
        source_height,
        upscaled: source_width < request.target_width || source_height < request.target_height,
        cropped: source_width != request.target_width || source_height != request.target_height,
        bytes,
        png_bytes: buffer,
    })
}

pub fn wallpaper_dir(app_data: &PathBuf) -> PathBuf {
    app_data.join("wallpapers")
}

#[cfg(windows)]
pub mod platform {
    use super::DisplayInfo;
    use windows_sys::core::BOOL;
    use windows_sys::Win32::Foundation::{LPARAM, RECT};
    use windows_sys::Win32::Graphics::Gdi::{
        EnumDisplayMonitors, EnumDisplaySettingsW, GetMonitorInfoW, DEVMODEW, HDC, HMONITOR,
        MONITORINFOEXW,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SystemParametersInfoW, SPIF_SENDCHANGE, SPIF_UPDATEINIFILE, SPI_SETDESKWALLPAPER,
    };

    const ENUM_CURRENT_SETTINGS: u32 = 0xFFFF_FFFF;

    unsafe extern "system" fn monitor_callback(
        monitor: HMONITOR,
        _dc: HDC,
        _rect: *mut RECT,
        data: LPARAM,
    ) -> BOOL {
        if data == 0 {
            return 1;
        }
        let list = unsafe { &mut *(data as *mut Vec<DisplayInfo>) };
        let mut info: MONITORINFOEXW = unsafe { std::mem::zeroed() };
        info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;

        if unsafe { GetMonitorInfoW(monitor, &mut info.monitorInfo) } == 0 {
            return 1;
        }

        let device_name: Vec<u16> = info.szDevice.iter().copied().chain(std::iter::once(0)).collect();
        let name = String::from_utf16_lossy(
            &device_name[..device_name.iter().position(|c| *c == 0).unwrap_or(0)],
        );

        let mut mode: DEVMODEW = unsafe { std::mem::zeroed() };
        mode.dmSize = std::mem::size_of::<DEVMODEW>() as u16;
        let mut width = 0u32;
        let mut height = 0u32;
        if unsafe { EnumDisplaySettingsW(device_name.as_ptr(), ENUM_CURRENT_SETTINGS, &mut mode) } != 0 {
            width = mode.dmPelsWidth;
            height = mode.dmPelsHeight;
        }

        if width == 0 || height == 0 {
            let rect = info.monitorInfo.rcMonitor;
            width = (rect.right - rect.left).max(1) as u32;
            height = (rect.bottom - rect.top).max(1) as u32;
        }

        let is_primary = (info.monitorInfo.dwFlags & 1) != 0;
        list.push(DisplayInfo {
            index: list.len(),
            name: if name.is_empty() {
                format!("Display {}", list.len() + 1)
            } else {
                name
            },
            width,
            height,
            is_primary,
            is_virtual: false,
        });
        1
    }

    pub fn list_displays() -> Vec<DisplayInfo> {
        let mut list: Vec<DisplayInfo> = Vec::new();
        unsafe {
            let pointer = &mut list as *mut Vec<DisplayInfo> as LPARAM;
            EnumDisplayMonitors(
                std::ptr::null_mut(),
                std::ptr::null(),
                Some(monitor_callback),
                pointer,
            );
        }
        if list.is_empty() {
            list.push(DisplayInfo {
                index: 0,
                name: "Primary display".into(),
                width: 1920,
                height: 1080,
                is_primary: true,
                is_virtual: false,
            });
        }
        list
    }

    /// Write the "fill" style to the registry so Windows stretches the image to the
    /// full panel instead of tiling or centring it.
    fn set_fill_style() {
        use winreg::enums::{HKEY_CURRENT_USER, KEY_WRITE};
        use winreg::RegKey;

        if let Ok(key) = RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey_with_flags("Control Panel\\Desktop", KEY_WRITE)
        {
            let _ = key.set_value("WallpaperStyle", &"10");
            let _ = key.set_value("TileWallpaper", &"0");
        }
    }

    pub fn apply_wallpaper(path: &str) -> Result<(), String> {
        let wide = path.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
        set_fill_style();
        unsafe {
            let ok = SystemParametersInfoW(
                SPI_SETDESKWALLPAPER,
                0,
                wide.as_ptr() as *mut std::ffi::c_void,
                SPIF_UPDATEINIFILE | SPIF_SENDCHANGE,
            );
            if ok == 0 {
                return Err("Windows refused to change the wallpaper.".into());
            }
        }
        Ok(())
    }
}

#[cfg(not(windows))]
pub mod platform {
    use super::DisplayInfo;

    pub fn list_displays() -> Vec<DisplayInfo> {
        vec![DisplayInfo {
            index: 0,
            name: "Primary display".into(),
            width: 1920,
            height: 1080,
            is_primary: true,
            is_virtual: false,
        }]
    }

    pub fn apply_wallpaper(_path: &str) -> Result<(), String> {
        Err("Wallpaper application is only wired up on Windows for now.".into())
    }
}
