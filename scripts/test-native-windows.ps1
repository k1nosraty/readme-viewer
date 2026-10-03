$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
New-Item native-test-results -ItemType Directory -Force | Out-Null
$installer = (Get-ChildItem src-tauri/target/release/bundle/nsis/*setup.exe | Select-Object -First 1).FullName
if (!$installer) { throw 'Native NSIS installer missing' }
$installDir = Join-Path $env:RUNNER_TEMP 'README-Viewer-Native-Smoke'
$install = Start-Process $installer -ArgumentList '/S', "/D=$installDir" -Wait -PassThru
if ($install.ExitCode -ne 0) { throw 'Native installation failed' }
try {
    $app = Get-ChildItem $installDir -Filter '*.exe' | Where-Object Name -NotMatch 'uninstall' | Select-Object -First 1
    if (!$app) { throw 'Installed native executable missing' }
    $fixture = Join-Path $env:RUNNER_TEMP 'native-persian.md'
    [IO.File]::WriteAllText($fixture, "# Native Persian smoke`r`n`r`n- [ ] یادگیری PostgreSQL`r`n", [Text.UTF8Encoding]::new($false))
    $process = Start-Process $app.FullName -ArgumentList "`"$fixture`"" -PassThru
    try {
        for ($i=0; $i -lt 60; $i++) {
            Start-Sleep -Seconds 1
            $process.Refresh()
            if ($process.HasExited) { throw 'Native app exited during launch' }
            if ($process.MainWindowHandle -ne 0) { break }
        }
        if ($process.MainWindowHandle -eq 0) { throw 'Native window never appeared' }
        Add-Type -AssemblyName System.Drawing
        Add-Type -AssemblyName System.Windows.Forms
        $bounds = [Windows.Forms.Screen]::PrimaryScreen.Bounds
        $image = [Drawing.Bitmap]::new($bounds.Width, $bounds.Height)
        $graphics = [Drawing.Graphics]::FromImage($image)
        $graphics.CopyFromScreen($bounds.Location, [Drawing.Point]::Empty, $bounds.Size)
        $image.Save((Join-Path (Get-Location) 'native-test-results/windows-native.png'))
        $graphics.Dispose(); $image.Dispose()
        @{ nativeExecutable=$app.Name; pid=$process.Id; windowTitle=$process.MainWindowTitle; coverage='Installer, native window launch with Markdown path, screenshot, uninstall' } | ConvertTo-Json | Set-Content native-test-results/windows-native.json
    } finally { if (!$process.HasExited) { Stop-Process -Id $process.Id -Force } }
} finally {
    $uninstaller = (Get-ChildItem $installDir -Filter '*uninstall*.exe' | Select-Object -First 1).FullName
    if (!$uninstaller) { throw 'Native uninstaller missing' }
    $uninstall = Start-Process $uninstaller -ArgumentList '/S' -Wait -PassThru
    if ($uninstall.ExitCode -ne 0) { throw 'Native uninstallation failed' }
}
for ($i=0; $i -lt 20 -and (Test-Path $app.FullName); $i++) { Start-Sleep -Seconds 1 }
if (Test-Path $app.FullName) { throw 'Native app remains after uninstall' }
