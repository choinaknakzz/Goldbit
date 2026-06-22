Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
projectRoot = fso.GetParentFolderName(scriptDir)
logPath = fso.BuildPath(projectRoot, "automation-service.log")

command = "cmd.exe /c cd /d " & Chr(34) & projectRoot & Chr(34) & " && npm.cmd run start >> " & Chr(34) & logPath & Chr(34) & " 2>&1"

Set shell = CreateObject("WScript.Shell")
shell.Run command, 0, True
