const { execFile } = require('node:child_process');

const MAC_ACTIVE_WINDOW_SCRIPT = `tell application "System Events"
set p to first application process whose frontmost is true
set n to name of p
try
set q to position of front window of p
set s to size of front window of p
return n & "|" & (item 1 of q) & "|" & (item 2 of q) & "|" & (item 1 of s) & "|" & (item 2 of s)
on error
return n
end try
end tell`;

const WINDOWS_ACTIVE_WINDOW_SCRIPT = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class TaitaiWindow {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr handle, out RECT rect);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);
}
"@
$handle = [TaitaiWindow]::GetForegroundWindow()
if ($handle -eq [IntPtr]::Zero) { exit 1 }
$rect = New-Object TaitaiWindow+RECT
$processId = [uint32]0
[void][TaitaiWindow]::GetWindowRect($handle, [ref]$rect)
[void][TaitaiWindow]::GetWindowThreadProcessId($handle, [ref]$processId)
$process = Get-Process -Id $processId -ErrorAction Stop
[pscustomobject]@{
  name = $process.ProcessName
  title = $process.MainWindowTitle
  x = $rect.Left
  y = $rect.Top
  width = $rect.Right - $rect.Left
  height = $rect.Bottom - $rect.Top
} | ConvertTo-Json -Compress
`;

function run(executable, args, execFileImpl = execFile) {
  return new Promise(resolve => {
    execFileImpl(executable, args, { timeout: 1400, windowsHide: true }, (error, stdout) => {
      resolve(error ? null : String(stdout || '').trim());
    });
  });
}

function parseMacResult(raw) {
  if (!raw) return null;
  const [name, x, y, width, height] = raw.split('|');
  if (!name) return null;
  return { name, x: +x || 0, y: +y || 0, width: +width || 0, height: +height || 0, hasBounds: Boolean(+width && +height) };
}

function parseWindowsResult(raw) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value?.name) return null;
    const x = Number(value.x) || 0;
    const y = Number(value.y) || 0;
    const width = Number(value.width) || 0;
    const height = Number(value.height) || 0;
    return { name: String(value.name), title: String(value.title || ''), x, y, width, height, hasBounds: Boolean(width && height) };
  } catch {
    return null;
  }
}

async function getActiveWindow(platform = process.platform, execFileImpl = execFile) {
  if (platform === 'darwin') return parseMacResult(await run('osascript', ['-e', MAC_ACTIVE_WINDOW_SCRIPT], execFileImpl));
  if (platform === 'win32') {
    const raw = await run('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WINDOWS_ACTIVE_WINDOW_SCRIPT], execFileImpl);
    return parseWindowsResult(raw);
  }
  return null;
}

module.exports = { getActiveWindow, parseMacResult, parseWindowsResult };
