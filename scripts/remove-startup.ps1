$ErrorActionPreference = 'Stop'
$taskName = 'CodexInChromeBridge'
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($task) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Write-Output "Removed $taskName"
} else {
  Write-Output "$taskName was not installed"
}
