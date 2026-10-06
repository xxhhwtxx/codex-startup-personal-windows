param([ValidateSet('resolve','listener','existing','restart','activate','render-browser','browser-listener')][string]$Action='resolve',[int]$Port=0,[int]$ProcessId=0)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$env:PSModulePath=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/Modules'
$taskPackage=Get-AppxPackage OpenAI.Codex | Select-Object -First 1
if (-not $taskPackage) { throw 'Official Codex is not installed.' }
$taskExecutable=Join-Path $taskPackage.InstallLocation 'app/ChatGPT.exe'
if ($Action -in @('render-browser','browser-listener')) {
    $taskBrowserCandidates=@(
        @{path=(Join-Path $env:ProgramFiles 'Google/Chrome/Application/chrome.exe');publisher='Google'},
        @{path=(Join-Path ${env:ProgramFiles(x86)} 'Google/Chrome/Application/chrome.exe');publisher='Google'},
        @{path=(Join-Path ${env:ProgramFiles(x86)} 'Microsoft/Edge/Application/msedge.exe');publisher='Microsoft'},
        @{path=(Join-Path $env:ProgramFiles 'Microsoft/Edge/Application/msedge.exe');publisher='Microsoft'}
    )
    $taskBrowser=$null
    foreach ($taskCandidate in $taskBrowserCandidates) {
        if (-not (Test-Path -LiteralPath $taskCandidate.path)) { continue }
        $taskSignature=Get-AuthenticodeSignature -LiteralPath $taskCandidate.path
        if ($taskSignature.Status.ToString() -eq 'Valid' -and $taskSignature.SignerCertificate.Subject -match $taskCandidate.publisher) { $taskBrowser=$taskCandidate; break }
    }
    if (-not $taskBrowser) { throw 'Chrome or Edge is required only to rebuild the animation cache.' }
    $taskExecutable=$taskBrowser.path
    if ($Action -eq 'render-browser') { @{executable=$taskExecutable} | ConvertTo-Json -Compress; exit }
}
if ($Action -eq 'resolve') {
    $taskSignature=Get-AuthenticodeSignature -LiteralPath $taskExecutable
    if ($taskSignature.Status.ToString() -ne 'Valid' -or $taskSignature.SignerCertificate.Subject -notmatch 'OpenAI') { throw 'OpenAI signature validation failed.' }
    @{executable=$taskExecutable;node=(Join-Path $taskPackage.InstallLocation 'app/resources/cua_node/bin/node.exe')} | ConvertTo-Json -Compress
    exit
}
if ($Action -eq 'existing') {
    $taskProcesses=@(Get-CimInstance Win32_Process -Filter "name='ChatGPT.exe'" | Where-Object { $_.ExecutablePath -eq $taskExecutable -and $_.CommandLine -notmatch '\s--type=' -and $_.CommandLine -notmatch '--user-data-dir=' } | ForEach-Object {
        $taskDebugPortMatch=[regex]::Match($_.CommandLine,'--remote-debugging-port(?:=|\s+)(\d+)')
        @{pid=[int]$_.ProcessId;port=$(if ($taskDebugPortMatch.Success) { [int]$taskDebugPortMatch.Groups[1].Value } else { 0 })}
    })
    @{processes=$taskProcesses} | ConvertTo-Json -Compress -Depth 3
    exit
}
if ($Action -eq 'activate') {
    $taskAppId='shell:AppsFolder\' + $taskPackage.PackageFamilyName + '!App'
    Start-Process -FilePath (Join-Path $env:SystemRoot 'explorer.exe') -ArgumentList $taskAppId -WindowStyle Hidden
    Write-Output '{"activated":true}'
    exit
}
if ($Action -in @('listener','browser-listener')) {
    if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Invalid debugging port.' }
    $taskListeners=@(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    if (-not $taskListeners) { throw 'Codex debugging listener is not ready.' }
    if (-not $taskListeners -or @($taskListeners | Where-Object { $_.LocalAddress -ne '127.0.0.1' }).Count) { throw 'The port must listen only on 127.0.0.1.' }
    $taskOwners=@($taskListeners.OwningProcess | Select-Object -Unique)
    if ($taskOwners.Count -ne 1) { throw 'Unexpected debugging port owners.' }
    $taskOwner=Get-CimInstance Win32_Process -Filter "ProcessId=$($taskOwners[0])"
    if ($taskOwner.ExecutablePath -ne $taskExecutable) { throw 'The listener is not the official Codex executable.' }
    $taskOwnerSid=(Invoke-CimMethod -InputObject $taskOwner -MethodName GetOwnerSid).Sid
    if ($taskOwnerSid -ne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value) { throw 'Debugging process user mismatch.' }
    @{pid=[int]$taskOwner.ProcessId;port=$Port} | ConvertTo-Json -Compress
    exit
}
if ($Action -eq 'restart') {
    if ($ProcessId -lt 1) { throw 'Missing process ID.' }
    $taskTarget=Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId"
    if (-not $taskTarget) { Write-Output '{"closed":true}'; exit }
    if ($taskTarget.ExecutablePath -ne $taskExecutable -or $taskTarget.CommandLine -match '\s--type=|--user-data-dir=') { throw 'Refusing to close an unrelated process.' }
    $taskTargetSid=(Invoke-CimMethod -InputObject $taskTarget -MethodName GetOwnerSid).Sid
    if ($taskTargetSid -ne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value) { throw 'Process user mismatch.' }
    $taskAppProcess=Get-Process -Id $ProcessId
    $null=$taskAppProcess.CloseMainWindow()
    if (-not $taskAppProcess.WaitForExit(3000)) { Stop-Process -Id $ProcessId }
    Write-Output '{"closed":true}'
}
