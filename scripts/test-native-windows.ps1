$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
New-Item native-test-results -ItemType Directory -Force | Out-Null
$installer = (Get-ChildItem src-tauri/target/release/bundle/nsis/*setup.exe | Select-Object -First 1).FullName
if (!$installer) { throw 'Native NSIS installer missing' }
$installDir = Join-Path $env:RUNNER_TEMP 'README-Viewer-Native-Smoke'
$progId = 'io.github.readmeviewer.viewer.Document'
$extensions = @('.md', '.json', '.ini', '.conf', '.py', '.dart', '.ts', '.go', '.rs', '.html', '.svg')
Add-Type -Name WindowState -Namespace ReadmeViewerSmoke -MemberDefinition @'
private delegate bool WindowCallback(System.IntPtr window, System.IntPtr parameter);
[System.Runtime.InteropServices.DllImport("user32.dll")]
private static extern bool EnumWindows(WindowCallback callback, System.IntPtr parameter);
[System.Runtime.InteropServices.DllImport("user32.dll")]
private static extern uint GetWindowThreadProcessId(System.IntPtr window, out uint processId);
[System.Runtime.InteropServices.DllImport("user32.dll")]
private static extern bool IsWindowVisible(System.IntPtr window);
[System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
private static extern int GetWindowText(System.IntPtr window, System.Text.StringBuilder caption, int length);
[System.Runtime.InteropServices.DllImport("user32.dll")]
private static extern bool SetWindowPos(System.IntPtr window, System.IntPtr after, int x, int y, int width, int height, uint flags);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool GetWindowRect(System.IntPtr window, out Rect bounds);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool ShowWindowAsync(System.IntPtr window, int command);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool IsZoomed(System.IntPtr window);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool IsIconic(System.IntPtr window);
[System.Runtime.InteropServices.DllImport("user32.dll")]
private static extern int GetWindowRgn(System.IntPtr window, System.IntPtr region);
[System.Runtime.InteropServices.DllImport("gdi32.dll")]
private static extern System.IntPtr CreateRectRgn(int left, int top, int right, int bottom);
[System.Runtime.InteropServices.DllImport("gdi32.dll")]
private static extern bool PtInRegion(System.IntPtr region, int x, int y);
[System.Runtime.InteropServices.DllImport("gdi32.dll")]
private static extern bool DeleteObject(System.IntPtr handle);
[System.Runtime.InteropServices.DllImport("user32.dll")]
private static extern bool GetClientRect(System.IntPtr window, out Rect bounds);
[System.Runtime.InteropServices.DllImport("user32.dll")]
private static extern bool ClientToScreen(System.IntPtr window, ref Point point);
[System.Runtime.InteropServices.DllImport("user32.dll")]
private static extern uint GetDpiForWindow(System.IntPtr window);
[System.Runtime.InteropServices.DllImport("user32.dll")]
private static extern bool SetCursorPos(int x, int y);
[System.Runtime.InteropServices.DllImport("user32.dll")]
private static extern void mouse_event(uint flags, int x, int y, uint data, System.UIntPtr extra);

[System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
public struct Rect { public int Left, Top, Right, Bottom; }
[System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
public struct Point { public int X, Y; }

public static Rect ClientBounds(System.IntPtr window) {
    Rect bounds;
    Point origin = new Point();
    if (!GetClientRect(window, out bounds) || !ClientToScreen(window, ref origin)) {
        throw new System.InvalidOperationException("Could not locate the native client area.");
    }
    return new Rect { Left = origin.X, Top = origin.Y, Right = origin.X + bounds.Right,
        Bottom = origin.Y + bounds.Bottom };
}

public static bool PositionForTest(System.IntPtr window, int x, int y) {
    return SetWindowPos(window, new System.IntPtr(-1), x, y, 800, 560, 0);
}

public static void ClickCaption(System.IntPtr window, int index) {
    Rect bounds = ClientBounds(window);
    double scale = GetDpiForWindow(window) / 96.0;
    double width = (bounds.Right - bounds.Left) / scale;
    double buttonWidth = width <= 640 ? 34 : 38;
    double gap = width <= 520 ? 0 : 2;
    double padding = width <= 520 ? 0 : 4;
    int x = bounds.Right - (int)System.Math.Round((padding + buttonWidth / 2 + index * (buttonWidth + gap)) * scale);
    int y = bounds.Top + (int)System.Math.Round(23 * scale);
    if (!SetCursorPos(x, y)) throw new System.InvalidOperationException("Could not place the mouse over the caption button.");
    mouse_event(2, 0, 0, 0, System.UIntPtr.Zero);
    mouse_event(4, 0, 0, 0, System.UIntPtr.Zero);
}

public static string RegionInfo(System.IntPtr window) {
    Rect bounds;
    GetWindowRect(window, out bounds);
    int right = bounds.Right - bounds.Left - 1;
    int bottom = bounds.Bottom - bounds.Top - 1;
    var region = CreateRectRgn(0, 0, 0, 0);
    try {
        int type = GetWindowRgn(window, region);
        return "type=" + type + " includes corners=" + PtInRegion(region, 0, 0) + "," +
            PtInRegion(region, right, 0) + "," + PtInRegion(region, 0, bottom) + "," +
            PtInRegion(region, right, bottom);
    } finally { DeleteObject(region); }
}

public static string Caption(System.IntPtr window) {
    var caption = new System.Text.StringBuilder(512);
    GetWindowText(window, caption, caption.Capacity);
    return caption.ToString();
}

public static System.IntPtr FindViewer(uint processId) {
    var result = System.IntPtr.Zero;
    EnumWindows((window, parameter) => {
        uint owner;
        GetWindowThreadProcessId(window, out owner);
        if (owner != processId || !IsWindowVisible(window) || !Caption(window).Contains("README Viewer")) {
            return true;
        }
        result = window;
        return false;
    }, System.IntPtr.Zero);
    return result;
}

'@
function Wait-TestWindowState([IntPtr]$window, [bool]$maximized, [bool]$minimized) {
    for ($i=0; $i -lt 50; $i++) {
        if (([ReadmeViewerSmoke.WindowState]::IsZoomed($window) -eq $maximized) -and
            ([ReadmeViewerSmoke.WindowState]::IsIconic($window) -eq $minimized)) { return }
        Start-Sleep -Milliseconds 100
    }
    throw "Native window did not reach requested state (maximized=$maximized, minimized=$minimized)"
}

function Invoke-TestCaption([IntPtr]$window, [string]$button) {
    $index = @{ close=0; maximize=1; minimize=2 }[$button]
    [ReadmeViewerSmoke.WindowState]::ClickCaption($window, $index)
}

function Test-RoundedClientCorners([IntPtr]$window, [Drawing.Color]$backgroundColor) {
    $rect = [ReadmeViewerSmoke.WindowState]::ClientBounds($window)
    $margin = 12
    $image = [Drawing.Bitmap]::new($rect.Right - $rect.Left + 2 * $margin, $rect.Bottom - $rect.Top + 2 * $margin)
    try {
        $graphics = [Drawing.Graphics]::FromImage($image)
        try { $graphics.CopyFromScreen($rect.Left - $margin, $rect.Top - $margin, 0, 0, $image.Size) }
        finally { $graphics.Dispose() }
        $background = $backgroundColor.ToArgb()
        if ($image.GetPixel(0, 0).ToArgb() -ne $background) { throw 'The test backdrop is not visible behind the window' }
        if ($image.GetPixel($margin + 12, $margin).ToArgb() -eq $background) { throw 'The window client surface is missing' }
        $cornerColors = @(
            $image.GetPixel($margin, $margin)
            $image.GetPixel($image.Width - $margin - 1, $margin)
            $image.GetPixel($margin, $image.Height - $margin - 1)
            $image.GetPixel($image.Width - $margin - 1, $image.Height - $margin - 1)
        )
        # A compositor shadow can darken the exposed backdrop without filling the corner.
        if ($cornerColors | Where-Object { $_.R -lt 100 -or $_.R -lt 3 * $_.G -or $_.B -lt 2 * $_.G }) {
            $image.Save((Join-Path (Get-Location) 'native-test-results/windows-frame-backdrop.png'))
            throw "Windows frame corners do not reveal the desktop backdrop: $cornerColors. Win32 region: $([ReadmeViewerSmoke.WindowState]::RegionInfo($window))"
        }
    } finally { $image.Dispose() }
}

function Save-AppScreenshot([IntPtr]$window, [string]$name) {
    $rect = [ReadmeViewerSmoke.WindowState+Rect]::new()
    if (![ReadmeViewerSmoke.WindowState]::GetWindowRect($window, [ref]$rect)) { throw 'Could not read native window bounds' }
    $windowBounds = [Drawing.Rectangle]::FromLTRB($rect.Left, $rect.Top, $rect.Right, $rect.Bottom)
    $bounds = [Drawing.Rectangle]::Intersect($windowBounds, [Windows.Forms.Screen]::FromHandle($window).Bounds)
    if ($bounds.Width -lt 100 -or $bounds.Height -lt 100) { throw 'Native window is outside the desktop' }
    $image = [Drawing.Bitmap]::new($bounds.Width, $bounds.Height)
    try {
        $graphics = [Drawing.Graphics]::FromImage($image)
        try {
            $graphics.CopyFromScreen($bounds.Location, [Drawing.Point]::Empty, $bounds.Size)
            $image.Save((Join-Path (Get-Location) "native-test-results/$name"))
        } finally { $graphics.Dispose() }
    } finally { $image.Dispose() }
}

$originalDefaults = @{}
foreach ($extension in $extensions) {
    $originalDefaults[$extension] = [Microsoft.Win32.Registry]::GetValue("HKEY_CURRENT_USER\Software\Classes\$extension", '', $null)
}
$install = Start-Process $installer -ArgumentList '/S', "/D=$installDir" -Wait -PassThru
if ($install.ExitCode -ne 0) { throw 'Native installation failed' }
try {
    $app = Get-ChildItem $installDir -Filter '*.exe' | Where-Object Name -NotMatch 'uninstall' | Select-Object -First 1
    if (!$app) { throw 'Installed native executable missing' }
    foreach ($extension in $extensions) {
        $key = "HKEY_CURRENT_USER\Software\Classes\$extension"
        $candidate = [Microsoft.Win32.Registry]::GetValue("$key\OpenWithProgids", $progId, $null)
        if ($null -eq $candidate -or $candidate -ne '') { throw "Open with registration missing for $extension" }
        if ([Microsoft.Win32.Registry]::GetValue($key, '', $null) -ne $originalDefaults[$extension]) {
            throw "Installer changed the default program for $extension"
        }
    }
    $command = [Microsoft.Win32.Registry]::GetValue("HKEY_CURRENT_USER\Software\Classes\$progId\shell\open\command", '', $null)
    if ($command -ne ('"{0}" "%1"' -f $app.FullName)) { throw "Incorrect Open with command: $command" }
    $defaultOptOut = & reg.exe query "HKCU\Software\Classes\$progId" /v AllowSilentDefaultTakeOver
    if ($LASTEXITCODE -ne 0 -or ($defaultOptOut -join "`n") -notmatch '\bREG_NONE\b') {
        throw 'Open with ProgID is missing the default takeover opt-out'
    }
    $fixture = Join-Path $env:RUNNER_TEMP 'native-persian.md'
    [IO.File]::WriteAllText($fixture, "# Native Persian smoke`r`n`r`n- [ ] یادگیری PostgreSQL`r`n", [Text.UTF8Encoding]::new($false))
    $process = Start-Process $app.FullName -ArgumentList "`"$fixture`"" -PassThru
    $backdrop = $null
    try {
        $window = [IntPtr]::Zero
        for ($i=0; $i -lt 60; $i++) {
            Start-Sleep -Seconds 1
            $process.Refresh()
            if ($process.HasExited) { throw 'Native app exited during launch' }
            $window = [ReadmeViewerSmoke.WindowState]::FindViewer($process.Id)
            if ($window -ne [IntPtr]::Zero) { break }
        }
        if ($window -eq [IntPtr]::Zero) { throw 'Visible README Viewer window never appeared' }
        Add-Type -AssemblyName System.Drawing
        Add-Type -AssemblyName System.Windows.Forms
        $screen = [Windows.Forms.Screen]::FromHandle($window).Bounds
        $backdrop = [Windows.Forms.Form]::new()
        $backdrop.FormBorderStyle = 'None'
        $backdrop.StartPosition = 'Manual'
        $backdrop.BackColor = [Drawing.Color]::FromArgb(199, 34, 119)
        $backdrop.Bounds = $screen
        $backdrop.Show()
        $backdrop.Refresh()
        if (![ReadmeViewerSmoke.WindowState]::PositionForTest($window, $screen.Left + 40, $screen.Top + 40)) { throw 'Could not position the viewer for the corner test' }
        [Windows.Forms.Application]::DoEvents()
        Start-Sleep -Milliseconds 500
        Save-AppScreenshot $window 'windows-native.png'
        $cornerFailures = @()
        try { Test-RoundedClientCorners $window $backdrop.BackColor }
        catch { $cornerFailures += $_.Exception.Message }
        Invoke-TestCaption $window maximize
        Wait-TestWindowState $window $true $false
        Start-Sleep -Milliseconds 500
        Save-AppScreenshot $window 'windows-native-maximized.png'
        if (![ReadmeViewerSmoke.WindowState]::RegionInfo($window).StartsWith('type=0 ')) {
            throw 'Maximized Windows frame still has rounded clipping'
        }
        Invoke-TestCaption $window maximize
        Wait-TestWindowState $window $false $false
        Start-Sleep -Milliseconds 300
        try { Test-RoundedClientCorners $window $backdrop.BackColor }
        catch { $cornerFailures += $_.Exception.Message }
        Invoke-TestCaption $window minimize
        Wait-TestWindowState $window $false $true
        [void][ReadmeViewerSmoke.WindowState]::ShowWindowAsync($window, 9)
        Wait-TestWindowState $window $false $false
        Start-Sleep -Milliseconds 300
        $title = [ReadmeViewerSmoke.WindowState]::Caption($window)
        Invoke-TestCaption $window close
        if (!$process.WaitForExit(10000)) { throw 'Close button did not exit the installed Windows app' }
        Write-Host 'Native maximize, restore, minimize and close buttons passed.'
        if ($cornerFailures.Count) { throw ($cornerFailures -join [Environment]::NewLine) }
        @{ nativeExecutable=$app.Name; pid=$process.Id; windowTitle=$title; openWith=$extensions; roundedCorners=$true; maximizeRestore=$true; minimize=$true; close=$true } | ConvertTo-Json -Depth 4 | Set-Content native-test-results/windows-native.json
    } finally {
        if ($backdrop) { $backdrop.Dispose() }
        if (!$process.HasExited) { Stop-Process -Id $process.Id -Force }
    }
} finally {
    $uninstaller = (Get-ChildItem $installDir -Filter '*uninstall*.exe' | Select-Object -First 1).FullName
    if (!$uninstaller) { throw 'Native uninstaller missing' }
    $uninstall = Start-Process $uninstaller -ArgumentList '/S' -Wait -PassThru
    if ($uninstall.ExitCode -ne 0) { throw 'Native uninstallation failed' }
}
for ($i=0; $i -lt 20 -and (Test-Path $app.FullName); $i++) { Start-Sleep -Seconds 1 }
if (Test-Path $app.FullName) { throw 'Native app remains after uninstall' }
foreach ($extension in $extensions) {
    $key = "HKEY_CURRENT_USER\Software\Classes\$extension"
    if ($null -ne [Microsoft.Win32.Registry]::GetValue("$key\OpenWithProgids", $progId, $null)) {
        throw "Open with registration remains after uninstall for $extension"
    }
    if ([Microsoft.Win32.Registry]::GetValue($key, '', $null) -ne $originalDefaults[$extension]) {
        throw "Uninstaller changed the default program for $extension"
    }
}
