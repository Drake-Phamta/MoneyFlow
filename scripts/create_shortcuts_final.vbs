Set WshShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")
Set objShell = CreateObject("Shell.Application")
Set objFolder = objShell.Namespace(&H10) ' Desktop folder
strDesktop = objFolder.Self.Path

' Determine project root from this script's location (scripts/ -> project root)
strScriptDir = objFSO.GetParentFolderName(WScript.ScriptFullName)
strProjectRoot = objFSO.GetParentFolderName(strScriptDir)

strIconPath = strProjectRoot & "\icon.ico"
strWebVBS = strProjectRoot & "\MoneyFlow_Web.vbs"
strDesktopVBS = strProjectRoot & "\MoneyFlow_Desktop.vbs"

' Start Menu folder
strStartMenu = WshShell.SpecialFolders("Programs") & "\Money Flow"
If Not objFSO.FolderExists(strStartMenu) Then
    objFSO.CreateFolder(strStartMenu)
End If

' Create shortcuts
Call CreateLink(strDesktop & "\Money Flow - Web.lnk", strWebVBS, "Money Flow - Web Version")
Call CreateLink(strDesktop & "\Money Flow - Desktop.lnk", strDesktopVBS, "Money Flow - Desktop Version")
Call CreateLink(strStartMenu & "\Money Flow - Web.lnk", strWebVBS, "Money Flow - Web Version")
Call CreateLink(strStartMenu & "\Money Flow - Desktop.lnk", strDesktopVBS, "Money Flow - Desktop Version")

WScript.Echo "Da tao 4 shortcuts (Desktop + Start Menu)!"

Sub CreateLink(linkPath, vbsPath, description)
    Set oLink = WshShell.CreateShortcut(linkPath)
    oLink.TargetPath = "wscript.exe"
    oLink.Arguments = Chr(34) & vbsPath & Chr(34)
    oLink.WorkingDirectory = strProjectRoot
    If objFSO.FileExists(strIconPath) Then oLink.IconLocation = strIconPath & ",0"
    oLink.Description = description
    oLink.Save
End Sub
