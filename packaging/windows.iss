#ifndef AppVersion
  #define AppVersion "1.0.1"
#endif
[Setup]
AppId={{4D649901-2759-42C2-9093-CFB3C0A4AA6B}
AppName=README Viewer
AppVersion={#AppVersion}
AppPublisher=k1nosraty
AppPublisherURL=https://github.com/k1nosraty/readme-viewer
DefaultDirName={localappdata}\Programs\README Viewer
DefaultGroupName=README Viewer
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=README-Viewer-{#AppVersion}-Windows-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={sys}\shell32.dll,1
[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"
[Files]
Source: "..\index.html"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\app.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\styles.css"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\Launch-README-Viewer.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\CHANGELOG.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\src\*"; DestDir: "{app}\src"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\vendor\*"; DestDir: "{app}\vendor"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{group}\README Viewer"; Filename: "{app}\index.html"
Name: "{autodesktop}\README Viewer"; Filename: "{app}\index.html"; Tasks: desktopicon
Name: "{group}\Uninstall README Viewer"; Filename: "{uninstallexe}"
[Run]
Filename: "{app}\index.html"; Description: "Open README Viewer"; Flags: shellexec nowait postinstall skipifsilent
