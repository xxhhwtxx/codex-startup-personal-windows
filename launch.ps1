param([switch]$DelayRestart)
$ErrorActionPreference='Stop'
$taskLaunchMutex=$null
$taskLaunchAcquired=$false
try {
    # A second click must never restart the app while the first launch is attaching.
    $taskUserSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $taskLaunchMutex=[Threading.Mutex]::new($false,('Local\CodexStartup_' + $taskUserSid))
    try { $taskLaunchAcquired=$taskLaunchMutex.WaitOne(0) }
    catch [Threading.AbandonedMutexException] { $taskLaunchAcquired=$true }
    if (-not $taskLaunchAcquired) { Write-Output 'Codex startup is already in progress.'; exit 0 }
    $env:PSModulePath=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/Modules'
    $taskPackage=Get-AppxPackage OpenAI.Codex | Select-Object -First 1
    if (-not $taskPackage) { throw 'Official Codex is not installed.' }
    $taskNode=Join-Path $taskPackage.InstallLocation 'app/resources/cua_node/bin/node.exe'
    if (-not (Test-Path -LiteralPath $taskNode)) {
        $taskNodeCommand=Get-Command node.exe -ErrorAction SilentlyContinue
        if (-not $taskNodeCommand) { throw 'Install Node.js 22 or newer if Codex does not include a Node runtime.' }
        $taskNode=$taskNodeCommand.Source
    }
    $taskArguments='"' + (Join-Path $PSScriptRoot 'run-windows.mjs') + '"'
    if ($DelayRestart) { $taskArguments+=' --delay 10000' }
    $taskHelper=Start-Process -FilePath $taskNode -ArgumentList $taskArguments -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
    $taskHelper.WaitForExit()
    if ($taskHelper.ExitCode -ne 0) { throw '启动动画接入失败。请查看本文件夹 startup-events.jsonl。' }
} catch {
    Add-Type -AssemblyName System.Windows.Forms
    [Windows.Forms.MessageBox]::Show($_.Exception.Message,'Codex') | Out-Null
    exit 1
} finally {
    if ($taskLaunchAcquired) { $taskLaunchMutex.ReleaseMutex() }
    if ($taskLaunchMutex) { $taskLaunchMutex.Dispose() }
}
