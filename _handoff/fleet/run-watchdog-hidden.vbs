' The trailing 0 is the window style — it is the whole point of this wrapper.
' run-watchdog.cmd sits next to this script; derive the path so the watchdog
' follows the checkout instead of a hardcoded worktree.
Dim fso, scriptDir
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run """" & scriptDir & "\run-watchdog.cmd""", 0, False
