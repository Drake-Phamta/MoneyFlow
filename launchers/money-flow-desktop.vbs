' Money Flow — bản desktop (Electron).
'
' Dựng lại giao diện trước khi mở, cùng lý do như bản web: Electron nạp dist/
' chứ không tự dựng.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
sh.Run "cmd /c npx vite build && npx electron .", 0, False
