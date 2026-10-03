README Viewer v1.0.1 fixes Preview mode filling only a tiny part of the window.

Preview now fills the available width and height, including on narrow screens. Source and Split remain available. Real-browser layout checks cover four viewport sizes.

## Windows installation

Download **README-Viewer-1.0.1-Windows-Setup.exe**, run it, and follow the installer. No administrator account, Node.js, Python, or server is required. Start README Viewer from the Start menu; an optional desktop shortcut is available.

## Portable edition

Download **README-Viewer-1.0.1-Portable.zip**, extract the entire ZIP, then double-click **Launch-README-Viewer.bat** on Windows. On macOS or Linux, open **index.html** in your browser.

## Use

Click **Open** or drop a Markdown file onto the window. Enable **Edit in preview** to toggle task checkboxes, then click **Save**. Chrome or Edge are recommended for file access; when saving in place is unavailable, Save downloads the edited file. English is the default interface; Persian is available under Help.

## Validation and limits

Automated tests cover rendering, Persian text, task editing, file-save races, multiple-file drops, HTML export, and editor selection. Publication is gated on tests and a Windows installation/uninstallation smoke test. Browser-specific manual checks remain useful; this release does not claim that all possible bugs have been eliminated. The Windows installer is unsigned and Windows may display a publisher warning. Documents can reference remote images and links; those resources require network access.
