use gtk::cairo::{RectangleInt, Region};
use gtk::gdk::{Window, WindowState};
use gtk::prelude::WidgetExt;
use gtk::{glib, ApplicationWindow};

fn round_region(width: i32, height: i32) -> Option<Region> {
    let radius = 8.min(width / 2).min(height / 2);
    if radius == 0 {
        return None;
    }
    let mut rectangles = vec![RectangleInt::new(0, radius, width, height - 2 * radius)];
    let r = f64::from(radius);
    for y in 0..radius {
        let dy = r - f64::from(y) - 0.5;
        let inset = (r - (r * r - dy * dy).sqrt()).ceil() as i32;
        rectangles.push(RectangleInt::new(inset, y, width - 2 * inset, 1));
        rectangles.push(RectangleInt::new(inset, height - 1 - y, width - 2 * inset, 1));
    }
    Some(Region::create_rectangles(&rectangles))
}

fn update_region(surface: &Window, state: WindowState) {
    if !surface.display().supports_shapes() {
        // Servers without shape support use the WebView clip and the transparent GTK surface.
        return;
    }
    let region = if state.intersects(WindowState::MAXIMIZED | WindowState::FULLSCREEN) {
        None
    } else {
        round_region(surface.width(), surface.height())
    };
    surface.shape_combine_region(region.as_ref(), 0, 0);
}

pub fn enable_rounded_frame(window: &ApplicationWindow) -> bool {
    if !WidgetExt::screen(window).is_some_and(|screen| screen.is_composited()) {
        return false;
    }
    if let Some(surface) = window.window() {
        update_region(&surface, surface.state());
    }
    window.connect_size_allocate(|window, _| {
        if let Some(surface) = window.window() {
            update_region(&surface, surface.state());
        }
    });
    window.connect_window_state_event(|window, event| {
        if let Some(surface) = window.window() {
            update_region(&surface, event.new_window_state());
        }
        glib::Propagation::Proceed
    });
    true
}
