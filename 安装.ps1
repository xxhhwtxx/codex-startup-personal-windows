$ErrorActionPreference='Stop'
$env:PSModulePath=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/Modules'
$taskDesktop= [Environment]::GetFolderPath('Desktop')
$taskDesktopLink=Join-Path $taskDesktop 'Codex.lnk'
$taskBackup=Join-Path $PSScriptRoot 'Codex原始快捷方式.lnk'
if ((Test-Path -LiteralPath $taskDesktopLink) -and -not (Test-Path -LiteralPath $taskBackup)) { Copy-Item -LiteralPath $taskDesktopLink -Destination $taskBackup }
$taskPackage=Get-AppxPackage OpenAI.Codex | Select-Object -First 1
if (-not $taskPackage) { throw 'Official Codex is not installed.' }
$taskPowerShell=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$taskShell=New-Object -ComObject WScript.Shell
$taskIconLocation=(Join-Path $taskPackage.InstallLocation 'app/resources/chatgpt-app-dark.ico') + ',0'
if (-not (Test-Path -LiteralPath (Join-Path $taskPackage.InstallLocation 'app/resources/chatgpt-app-dark.ico'))) { $taskIconLocation=(Join-Path $taskPackage.InstallLocation 'app/ChatGPT.exe') + ',0' }
if (Test-Path -LiteralPath $taskBackup) {
    $taskOriginalShortcut=$taskShell.CreateShortcut($taskBackup)
    $taskOriginalIcon=$taskOriginalShortcut.IconLocation
    $taskOriginalIconPath=($taskOriginalIcon -replace ',-?\d+$','').Trim('"')
    if ($taskOriginalIcon -and (Test-Path -LiteralPath $taskOriginalIconPath)) { $taskIconLocation=$taskOriginalIcon }
}
$taskShortcutPath=Join-Path $PSScriptRoot 'Codex启动入口.lnk'
$taskShortcut=$taskShell.CreateShortcut($taskShortcutPath)
$taskShortcut.TargetPath=$taskPowerShell
$taskShortcut.Arguments='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $PSScriptRoot 'launch.ps1') + '"'
$taskShortcut.WorkingDirectory=$PSScriptRoot
$taskShortcut.WindowStyle=7
$taskShortcut.Description='Codex'
$taskShortcut.IconLocation=$taskIconLocation
$taskShortcut.Save()
Copy-Item -LiteralPath $taskShortcutPath -Destination $taskDesktopLink -Force
Write-Output 'Codex desktop startup animation installed.'
