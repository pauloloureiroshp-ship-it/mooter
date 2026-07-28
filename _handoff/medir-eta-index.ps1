# medir-eta-index.ps1 - so ASCII, SO LEITURA.
# A pergunta: depois do fix X6, a barra ainda enche alguma vez?
# O E1 cai sempre que o Codex estoura o total. O E2 precisa de n>=5 numa chave.
# Se nenhuma chave tiver n>=5, a ETA e n/d a 100% e a barra nunca sai de
# indeterminada - teriamos trocado uma mentira por um silencio.
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\Paulo Loureiro\frugal\_handoff\medir-eta-saida.log'
$idx = Join-Path $env:USERPROFILE '.mooter\eta-index.json'
"== eta-index.json ==" | Out-File -Encoding ascii $log
if (-not (Test-Path $idx)) { "NAO EXISTE - nenhuma observacao foi registada ainda" | Out-File -Encoding ascii -Append $log; "FIM" | Out-File -Encoding ascii -Append $log; exit 0 }
("tamanho: " + [math]::Round((Get-Item $idx).Length/1KB,1) + " KB") | Out-File -Encoding ascii -Append $log
$j = Get-Content $idx -Raw | ConvertFrom-Json
("atualizado_em: " + $j.atualizado_em) | Out-File -Encoding ascii -Append $log
"== chaves (agente|categoria|contexto) ==" | Out-File -Encoding ascii -Append $log
$comBase = 0; $semBase = 0
foreach ($p in $j.chaves.PSObject.Properties) {
  $e = $p.Value
  $tem = ($e.n -ge 5)
  if ($tem) { $comBase++ } else { $semBase++ }
  ("  " + $p.Name.PadRight(38) + " n=" + $e.n + "  p50=" + $(if($e.p50 -ne $null){$e.p50}else{'n/d'}) + "  p90=" + $(if($e.p90 -ne $null){$e.p90}else{'n/d'}) + "  bytes_n=" + $e.bytes_n + "  " + $(if($tem){'<-- TEM BASE'}else{'sem base'})) | Out-File -Encoding ascii -Append $log
}
"" | Out-File -Encoding ascii -Append $log
("chaves com base (n>=5): " + $comBase) | Out-File -Encoding ascii -Append $log
("chaves sem base:        " + $semBase) | Out-File -Encoding ascii -Append $log
if ($comBase -eq 0) {
  "VEREDICTO: a barra NUNCA enche. O E2 nao tem base em chave nenhuma e o E1" | Out-File -Encoding ascii -Append $log
  "cai sempre que o agente estoura o total. Trocamos a mentira por silencio." | Out-File -Encoding ascii -Append $log
} else {
  ("VEREDICTO: " + $comBase + " chave(s) ja projectam tempo. Fora dessas, indeterminada.") | Out-File -Encoding ascii -Append $log
}

"== quantos jobs terminais existem no ledger, por agente ==" | Out-File -Encoding ascii -Append $log
$led = Join-Path $env:USERPROFILE '.mooter\ledger.jsonl'
if (Test-Path $led) {
  $porAgente = @{}
  foreach ($l in (Get-Content $led)) {
    if ($l -notmatch '"event":"done"') { continue }
    if ($l -match '"agent":"([^"]+)"') { $a = $matches[1]; if (-not $porAgente.ContainsKey($a)) { $porAgente[$a] = 0 }; $porAgente[$a]++ }
  }
  foreach ($k in ($porAgente.Keys | Sort-Object)) { ("  " + $k.PadRight(10) + " " + $porAgente[$k] + " done") | Out-File -Encoding ascii -Append $log }
  "(se ha muitos done e poucas observacoes no indice, o observeTerminal nao esta a ser chamado)" | Out-File -Encoding ascii -Append $log
}
"FIM" | Out-File -Encoding ascii -Append $log
