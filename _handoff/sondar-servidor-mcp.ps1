# sondar-servidor-mcp.ps1 - SO DIAGNOSTICO. Nao mata nada. So ASCII.
# Descobre o processo que corre o servidor MCP do Mooter dentro do Claude Desktop.
# Objectivo: saber se da para reiniciar SO o conector (sem reiniciar o Desktop).
$ErrorActionPreference = 'SilentlyContinue'
$log = 'C:\Users\Paulo Loureiro\frugal\_handoff\sonda-mcp-saida.txt'
"== processos node/claude com o mooter na linha de comando ==" | Out-File -Encoding ascii $log

$procs = Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -and ($_.CommandLine -match 'mooter' -or $_.CommandLine -match 'local.mcpb.paulo-loureiro')
}
foreach ($p in $procs) {
  ("PID=" + $p.ProcessId + "  PPID=" + $p.ParentProcessId + "  NOME=" + $p.Name) | Out-File -Encoding ascii -Append $log
  ("  inicio: " + $p.CreationDate) | Out-File -Encoding ascii -Append $log
  $cl = $p.CommandLine
  if ($cl.Length -gt 300) { $cl = $cl.Substring(0,300) + ' ...' }
  ("  cmd: " + $cl) | Out-File -Encoding ascii -Append $log
  "" | Out-File -Encoding ascii -Append $log
}
if (-not $procs) { "nenhum processo encontrado com 'mooter' na linha de comando" | Out-File -Encoding ascii -Append $log }

"== pais desses processos (para saber quem os respawnaria) ==" | Out-File -Encoding ascii -Append $log
$ppids = $procs | Select-Object -ExpandProperty ParentProcessId -Unique
foreach ($ppid in $ppids) {
  $par = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $ppid)
  if ($par) {
    $pcl = $par.CommandLine
    if ($pcl -and $pcl.Length -gt 200) { $pcl = $pcl.Substring(0,200) + ' ...' }
    ("PPID=" + $ppid + "  NOME=" + $par.Name) | Out-File -Encoding ascii -Append $log
    ("  cmd: " + $pcl) | Out-File -Encoding ascii -Append $log
  }
}

"== processos codex vivos (nao mexer enquanto houver) ==" | Out-File -Encoding ascii -Append $log
$cx = Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'codex' -or ($_.CommandLine -and $_.CommandLine -match 'codex') }
if ($cx) { foreach ($c in $cx) { ("PID=" + $c.ProcessId + "  " + $c.Name) | Out-File -Encoding ascii -Append $log } }
else { "nenhum processo codex vivo" | Out-File -Encoding ascii -Append $log }
"FIM" | Out-File -Encoding ascii -Append $log
