Set WshShell = CreateObject("WScript.Shell")
Set objShell = CreateObject("Shell.Application")
Set objFolder = objShell.Namespace(&H10) ' Desktop folder
strDesktop = objFolder.Self.Path

' Create Web shortcut
Set oLink = WshShell.CreateShortcut(strDesktop & "\Money Flow Web.lnk")
oLink.TargetPath = "wscript.exe"
oLink.Arguments = Chr(34) & "D:\New_era\Money_Flow\MoneyFlow_Web.vbs" & Chr(34)
oLink.WorkingDirectory = "D:\New_era\Money_Flow"
oLink.IconLocation = "D:\New_era\Money_Flow\icon.ico,0"
oLink.Description = "Money Flow - Web Version"
oLink.Save

' Create Desktop shortcut
Set oLink = WshShell.CreateShortcut(strDesktop & "\Money Flow Desktop.lnk")
oLink.TargetPath = "wscript.exe"
oLink.Arguments = Chr(34) & "D:\New_era\Money_Flow\MoneyFlow_Desktop.vbs" & Chr(34)
oLink.WorkingDirectory = "D:\New_era\Money_Flow"
oLink.IconLocation = "D:\New_era\Money_Flow\icon.ico,0"
oLink.Description = "Money Flow - Desktop Version"
oLink.Save

WScript.Echo "Đã tạo 2 shortcuts với icon mới!"
