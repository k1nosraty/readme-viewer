use std::mem::size_of_val;
use tauri::WebviewWindow;
use windows::core::{w, Error};
use windows::Win32::Foundation::E_FAIL;
use windows::Win32::Graphics::DirectWrite::{
    DWriteCreateFactory, IDWriteFactory, DWRITE_FACTORY_TYPE_SHARED,
};
use windows::Win32::Graphics::Dwm::{
    DwmExtendFrameIntoClientArea, DwmSetWindowAttribute, DWMWA_USE_IMMERSIVE_DARK_MODE,
    DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND,
};
use windows::Win32::UI::Controls::MARGINS;

pub fn apply_backdrop(window: &WebviewWindow, dark: bool) -> bool {
    let Ok(hwnd) = window.hwnd() else {
        return false;
    };
    let dark_caption = i32::from(dark);
    unsafe {
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_USE_IMMERSIVE_DARK_MODE,
            std::ptr::from_ref(&dark_caption).cast(),
            size_of_val(&dark_caption) as u32,
        );
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            std::ptr::from_ref(&DWMWCP_ROUND).cast(),
            size_of_val(&DWMWCP_ROUND) as u32,
        );
    }
    // Legacy acrylic stutters during window moves and resizes on Windows 10 and early Windows 11.
    if window_vibrancy::apply_mica(window, Some(dark)).is_err() {
        return false;
    }
    // Mica is drawn behind the transparent WebView, across the client area.
    let margins = MARGINS {
        cxLeftWidth: -1,
        cxRightWidth: -1,
        cyTopHeight: -1,
        cyBottomHeight: -1,
    };
    unsafe { DwmExtendFrameIntoClientArea(hwnd, &margins).is_ok() }
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
