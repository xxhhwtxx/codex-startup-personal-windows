$ErrorActionPreference='Stop'
$env:PSModulePath=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/Modules'
$taskDesktopLink=Join-Path ([Environment]::GetFolderPath('Desktop')) 'Codex.lnk'
$taskBackup=Join-Path $PSScriptRoot 'Codex原始快捷方式.lnk'
if (Test-Path -LiteralPath $taskBackup) {
    Copy-Item -LiteralPath $taskBackup -Destination $taskDesktopLink -Force
} else {
    $taskPackage=Get-AppxPackage OpenAI.Codex | Select-Object -First 1
    if (-not $taskPackage) { throw 'Official Codex is not installed.' }
    $taskShortcut=(New-Object -ComObject WScript.Shell).CreateShortcut($taskDesktopLink)
    $taskShortcut.TargetPath=Join-Path $env:SystemRoot 'explorer.exe'
    $taskShortcut.Arguments='shell:AppsFolder\' + $taskPackage.PackageFamilyName + '!App'
    $taskShortcut.IconLocation=(Join-Path $taskPackage.InstallLocation 'app/ChatGPT.exe') + ',0'
    $taskShortcut.Description='Codex'
    $taskShortcut.Save()
}
Write-Output 'Codex shortcut restored. Quit Codex completely and reopen it.'
