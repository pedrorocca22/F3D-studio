; setup.iss — Inno Setup script for F3D Studio
; Usage: Compile this file with Inno Setup Compiler (iscc.exe)
; Output: Output\Instalar_F3D_Studio_v1.0.exe

#define MyAppName      "F3D Studio"
#define MyAppVersion   "1.0.0-beta"
#define MyAppPublisher "F3D Studio"
#define MyAppURL       "https://github.com/pedrorocca22/FFF3"
#define MyAppExeName   "F3D_Studio.exe"
#define BuildDir       "dist_pyinstaller\F3D_Studio"

[Setup]
AppId={{F3D-STUDIO-2026-UNIQUE-GUID}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\F3D Studio
DisableProgramGroupPage=yes
LicenseFile=
; OutputDir is relative to this .iss file location
OutputDir=Output
OutputBaseFilename=Instalar_F3D_Studio_v1.0-beta
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; --- PyInstaller bundle (entire F3D_Studio folder from dist_pyinstaller) ---
Source: "{#BuildDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}\jobs"
