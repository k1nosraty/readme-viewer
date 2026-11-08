use std::cell::RefCell;
use std::mem::size_of_val;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::async_runtime::{channel, Sender};
use tauri::{Emitter, Listener, Manager, WebviewWindow, WindowEvent};
use windows::core::{w, Error, PCWSTR};
use windows::Win32::Foundation::{E_FAIL, HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::Graphics::DirectWrite::{
    DWriteCreateFactory, IDWriteFactory, DWRITE_FACTORY_TYPE_SHARED,
};
use windows::Win32::Graphics::Dwm::{
    DwmExtendFrameIntoClientArea, DwmSetWindowAttribute, DWMWA_USE_IMMERSIVE_DARK_MODE,
    DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::Controls::MARGINS;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, VIRTUAL_KEY, VK_CONTROL, VK_LWIN, VK_RWIN, VK_SHIFT, VK_TAB,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, GetForegroundWindow, SetWindowsHookExW, UnhookWindowsHookEx, HC_ACTION, HHOOK,
    KBDLLHOOKSTRUCT, LLKHF_ALTDOWN, LLKHF_UP, WH_KEYBOARD_LL,
};

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
    let tint = if dark {
        (16, 30, 49, 90)
    } else {
        (239, 245, 252, 90)
    };
    if window_vibrancy::apply_acrylic(window, Some(tint))
        .or_else(|_| window_vibrancy::apply_mica(window, Some(dark)))
        .is_err()
    {
        return false;
    }
    // Acrylic is drawn behind the transparent WebView, across the client area.
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

struct TabHook {
    handle: HHOOK,
    window: HWND,
    events: Sender<bool>,
}

impl Drop for TabHook {
    fn drop(&mut self) {
        let _ = unsafe { UnhookWindowsHookEx(self.handle) };
    }
}

thread_local! {
    static TAB_HOOK: RefCell<Option<TabHook>> = const { RefCell::new(None) };
}

fn pressed(key: VIRTUAL_KEY) -> bool {
    (unsafe { GetAsyncKeyState(i32::from(key.0)) }) < 0
}

unsafe extern "system" fn tab_key(code: i32, message: WPARAM, data: LPARAM) -> LRESULT {
    let handled = code == HC_ACTION as i32
        && data.0 != 0
        && TAB_HOOK.with(|slot| {
            let Ok(hook) = slot.try_borrow() else {
                return false;
            };
            let Some(hook) = hook.as_ref() else {
                return false;
            };
            if unsafe { GetForegroundWindow() } != hook.window {
                return false;
            }
            let key = unsafe { &*(data.0 as *const KBDLLHOOKSTRUCT) };
            if key.vkCode != u32::from(VK_TAB.0)
                || !key.flags.contains(LLKHF_ALTDOWN)
                || pressed(VK_CONTROL)
                || pressed(VK_LWIN)
                || pressed(VK_RWIN)
            {
                return false;
            }
            if !key.flags.contains(LLKHF_UP) {
                // Queue only the requested tab direction. The hook never calls the WebView.
                let _ = hook.events.try_send(pressed(VK_SHIFT));
            }
            true
        });
    if handled {
        LRESULT(1)
    } else {
        unsafe { CallNextHookEx(None, code, message, data) }
    }
}

fn start_tab_hook(window: HWND, events: &Sender<bool>) {
    TAB_HOOK.with(|slot| {
        let mut hook = slot.borrow_mut();
        if hook.is_some() {
            return;
        }
        let Ok(module) = (unsafe { GetModuleHandleW(PCWSTR::null()) }) else {
            return;
        };
        if let Ok(handle) = unsafe {
            SetWindowsHookExW(WH_KEYBOARD_LL, Some(tab_key), Some(HINSTANCE(module.0)), 0)
        } {
            *hook = Some(TabHook { handle, window, events: events.clone() });
        }
    });
}

fn stop_tab_hook() {
    TAB_HOOK.with(|slot| {
        slot.borrow_mut().take();
    });
}

pub fn prepare_tab_shortcut(window: &WebviewWindow) {
    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    let (events, mut receiver) = channel(16);
    let app = window.app_handle().clone();
    tauri::async_runtime::spawn(async move {
        while let Some(backward) = receiver.recv().await {
            let _ = app.emit_to("main", "native-cycle-tab", backward);
        }
    });
    let handle = hwnd.0 as isize;
    let enabled = Arc::new(AtomicBool::new(false));
    let focus_enabled = enabled.clone();
    let focus_events = events.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Focused(_) => {
            let hwnd = HWND(handle as *mut _);
            // Focus can move between the frame and WebView without leaving this app.
            if focus_enabled.load(Ordering::Relaxed) && unsafe { GetForegroundWindow() } == hwnd {
                start_tab_hook(hwnd, &focus_events);
            } else {
                stop_tab_hook();
            }
        }
        WindowEvent::Destroyed => stop_tab_hook(),
        _ => {}
    });
    let dispatch = window.clone();
    window.listen("viewer-tab-shortcut", move |event| {
        let wanted = event.payload() == "true";
        let enabled = enabled.clone();
        let events = events.clone();
        let _ = dispatch.run_on_main_thread(move || {
            enabled.store(wanted, Ordering::Relaxed);
            let hwnd = HWND(handle as *mut _);
            if wanted && unsafe { GetForegroundWindow() } == hwnd {
                start_tab_hook(hwnd, &events);
            } else if !wanted {
                stop_tab_hook();
            }
        });
    });
}
