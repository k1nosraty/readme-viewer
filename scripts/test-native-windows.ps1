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

[System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
public struct Rect { public int Left, Top, Right, Bottom; }

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

public static bool RaiseForScreenshot(System.IntPtr window) {
    const uint noSizeOrMoveOrActivation = 0x0013;
    return SetWindowPos(window, new System.IntPtr(-1), 0, 0, 0, 0, noSizeOrMoveOrActivation);
}
'@
function Set-TestWindowState([IntPtr]$window, [bool]$maximized) {
    $command = if ($maximized) { 3 } else { 9 } # SW_MAXIMIZE or SW_RESTORE
    if (![ReadmeViewerSmoke.WindowState]::ShowWindowAsync($window, $command)) { throw 'Could not change the native window state' }
    for ($i=0; $i -lt 50; $i++) {
        if ([ReadmeViewerSmoke.WindowState]::IsZoomed($window) -eq $maximized) { return }
        Start-Sleep -Milliseconds 100
    }
    throw "Native window did not reach requested maximized state: $maximized"
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
        if (![ReadmeViewerSmoke.WindowState]::RaiseForScreenshot($window)) { throw 'Could not bring the viewer above the runner console' }
        Start-Sleep -Milliseconds 500
        Save-AppScreenshot $window 'windows-native.png'
        Set-TestWindowState $window $true
        Start-Sleep -Milliseconds 500
        Save-AppScreenshot $window 'windows-native-maximized.png'
        Set-TestWindowState $window $false
        @{ nativeExecutable=$app.Name; pid=$process.Id; windowTitle=[ReadmeViewerSmoke.WindowState]::Caption($window); openWith=$extensions; coverage='Installer, Open with registration and preserved defaults, native window launch, maximize and restore, screenshots, uninstall' } | ConvertTo-Json | Set-Content native-test-results/windows-native.json
    } finally { if (!$process.HasExited) { Stop-Process -Id $process.Id -Force } }
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
