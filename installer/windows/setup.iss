; Setup.exe for the Live Interpreter speech server on Windows (Inno Setup 6).
; Build: installer\windows\build-setup.ps1 (or ISCC /DAppVersion=2.1.0 setup.iss).
;
; It copies the server's files and runs speech-server\install-windows.ps1, which fetches
; Python, the packages (cuBLAS and cuDNN with an NVIDIA card), the Piper voices and,
; on the first start, the Whisper model. Per user, no administrator rights.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#define Source "..\..\speech-server"

[Setup]
AppId={{370AEFF8-C9E6-4EDF-9B34-0BDF39FBC395}
AppName=Live Interpreter speech server
AppVersion={#AppVersion}
AppPublisher=Live Interpreter
AppPublisherURL=https://github.com/mbahcetepe/live-interpreter
DefaultDirName={localappdata}\LiveInterpreterSpeech
DisableDirPage=yes
DefaultGroupName=Live Interpreter speech server
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\..\dist-installers
OutputBaseFilename=LiveInterpreterSpeech-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=Live Interpreter speech server
SetupLogging=yes
; Since Inno Setup 6.7 Setup turns on Windows' RedirectionGuard, and a per-user Setup
; passes it on to the PowerShell it runs: uv could then not open the link it makes for
; the Python it installs (os error 448).
RedirectionGuard=no

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"
Name: "tr"; MessagesFile: "compiler:Languages\Turkish.isl"

[CustomMessages]
en.LocalOnly=Only this computer (other computers on the network cannot use it)
tr.LocalOnly=Yalnızca bu bilgisayar (ağdaki diğer bilgisayarlar kullanamaz)
en.Installing=Installing Python, the packages and the voices (several minutes; a window shows the progress)...
tr.Installing=Python, paketler ve sesler kuruluyor (birkaç dakika; ilerleme bir pencerede görünür)...
en.ShowConnection=Show the address and key for the extension
tr.ShowConnection=Eklenti için adresi ve anahtarı göster
en.Connection=Address and key
tr.Connection=Adres ve anahtar
en.Log=Server log
tr.Log=Sunucu günlüğü
en.Uninstall=Uninstall the speech server
tr.Uninstall=Ses sunucusunu kaldır

[Tasks]
Name: "localonly"; Description: "{cm:LocalOnly}"; Flags: unchecked

[Files]
Source: "{#Source}\server.py"; DestDir: "{app}\source"; Flags: ignoreversion
Source: "{#Source}\engines.py"; DestDir: "{app}\source"; Flags: ignoreversion
Source: "{#Source}\segmenter.py"; DestDir: "{app}\source"; Flags: ignoreversion
Source: "{#Source}\fetch_voices.py"; DestDir: "{app}\source"; Flags: ignoreversion
Source: "{#Source}\requirements.txt"; DestDir: "{app}\source"; Flags: ignoreversion
Source: "{#Source}\requirements-cuda-windows.txt"; DestDir: "{app}\source"; Flags: ignoreversion
Source: "{#Source}\install-windows.ps1"; DestDir: "{app}\source"; Flags: ignoreversion

[Icons]
Name: "{group}\{cm:Connection}"; Filename: "{win}\notepad.exe"; Parameters: """{app}\connection.txt"""
Name: "{group}\{cm:Log}"; Filename: "{win}\notepad.exe"; Parameters: """{app}\logs\server.log"""
Name: "{group}\{cm:Uninstall}"; Filename: "{uninstallexe}"

[Run]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\source\install-windows.ps1"" -FromSetup"; StatusMsg: "{cm:Installing}"; Flags: waituntilterminated; Tasks: not localonly
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\source\install-windows.ps1"" -FromSetup -LocalOnly"; StatusMsg: "{cm:Installing}"; Flags: waituntilterminated; Tasks: localonly
Filename: "{win}\notepad.exe"; Parameters: """{app}\connection.txt"""; Description: "{cm:ShowConnection}"; Flags: postinstall nowait skipifsilent

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\source\install-windows.ps1"" -Uninstall -FromSetup"; RunOnceId: "StopServer"; Flags: runhidden waituntilterminated

[UninstallDelete]
; Python, the packages, the voices and the Whisper model the script fetched.
Type: filesandordirs; Name: "{app}"
