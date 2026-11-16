use std::cell::Cell;
use tauri::WebviewWindow;
use windows::core::{w, Error};
use windows::Win32::Foundation::{E_FAIL, HWND, RECT};
use windows::Win32::Graphics::DirectWrite::{
    DWriteCreateFactory, IDWriteFactory, DWRITE_FACTORY_TYPE_SHARED,
};
use windows::Win32::Graphics::Gdi::{CreateRoundRectRgn, DeleteObject, SetWindowRgn};
use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;

#[derive(Clone, Copy, PartialEq, Eq)]
struct WindowRegion {
    handle: HWND,
    width: i32,
    height: i32,
    diameter: i32,
}

thread_local! {
    static LAST_REGION: Cell<Option<WindowRegion>> = const { Cell::new(None) };
}

pub fn update_window_region(hwnd: HWND, scale: f64, square: bool) {
    let mut bounds = RECT::default();
    if unsafe { GetWindowRect(hwnd, &mut bounds) }.is_err() {
        return;
    }
    let shape = WindowRegion {
        handle: hwnd,
        width: bounds.right - bounds.left,
        height: bounds.bottom - bounds.top,
        diameter: if square { 0 } else { (16.0 * scale).round() as i32 },
    };
    if shape.width <= 0 || shape.height <= 0 {
        return;
    }
    LAST_REGION.with(|last| {
        if last.get() == Some(shape) {
            return;
        }
        // SetWindowRgn sends window-position messages. Remember the geometry before calling it.
        let previous = last.replace(Some(shape));
        let success = unsafe {
            if square {
                SetWindowRgn(hwnd, None, true) != 0
            } else {
                let region = CreateRoundRectRgn(
                    0,
                    0,
                    shape.width + 1,
                    shape.height + 1,
                    shape.diameter,
                    shape.diameter,
                );
                if region.0.is_null() {
                    false
                } else if SetWindowRgn(hwnd, Some(region), true) != 0 {
                    true // Windows owns the region after a successful call.
                } else {
                    let _ = DeleteObject(region.into());
                    false
                }
            }
        };
        if !success {
            last.set(previous);
        }
    });
}

pub fn round_window(window: &WebviewWindow) {
    if let Ok(hwnd) = window.hwnd() {
        update_window_region(
            hwnd,
            window.scale_factor().unwrap_or(1.0),
            window.is_maximized().unwrap_or(false) || window.is_fullscreen().unwrap_or(false),
        );
    }
}

pub fn installed_font_families() -> windows::core::Result<Vec<String>> {
    unsafe {
        let factory = DWriteCreateFactory::<IDWriteFactory>(DWRITE_FACTORY_TYPE_SHARED)?;
        let mut collection = None;
        factory.GetSystemFontCollection(&mut collection, true)?;
        let collection = collection.ok_or_else(|| Error::from_hresult(E_FAIL))?;
        (0..collection.GetFontFamilyCount())
            .map(|family| {
                let names = collection.GetFontFamily(family)?.GetFamilyNames()?;
                let (mut index, mut found) = (0, false.into());
                names.FindLocaleName(w!("en-us"), &mut index, &mut found)?;
                let index = if found.as_bool() { index } else { 0 };
                let length = names.GetStringLength(index)? as usize;
                let mut text = vec![0; length + 1];
                names.GetString(index, &mut text)?;
                Ok(String::from_utf16_lossy(&text[..length]))
            })
            .collect()
    }
}
