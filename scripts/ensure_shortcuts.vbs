' Auto-repair shortcuts for Money Flow
' Checks if Desktop + Start Menu shortcuts exist; recreates them if missing or broken.

Set WshShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")
Set objShell = CreateObject("Shell.Application")
Set objFolder = objShell.Namespace(&H10) ' Desktop folder
strDesktop = objFolder.Self.Path

' Determine project root from this script's location
strScriptDir = objFSO.GetParentFolderName(WScript.ScriptFullName)
strProjectRoot = objFSO.GetParentFolderName(strScriptDir)

' Paths
strIconPath = strProjectRoot & "\icon.ico"
strWebVBS = strProjectRoot & "\MoneyFlow_Web.vbs"
strDesktopVBS = strProjectRoot & "\MoneyFlow_Desktop.vbs"

' Start Menu folder
strStartMenu = WshShell.SpecialFolders("Programs") & "\Money Flow"
If Not objFSO.FolderExists(strStartMenu) Then
    objFSO.CreateFolder(strStartMenu)
End If

' --- Ensure Desktop shortcuts ---
Call EnsureLink(strDesktop & "\Money Flow - Web.lnk", strWebVBS, "Money Flow - Web Version")
Call EnsureLink(strDesktop & "\Money Flow - Desktop.lnk", strDesktopVBS, "Money Flow - Desktop Version")

' --- Ensure Start Menu shortcuts ---
Call EnsureLink(strStartMenu & "\Money Flow - Web.lnk", strWebVBS, "Money Flow - Web Version")
Call EnsureLink(strStartMenu & "\Money Flow - Desktop.lnk", strDesktopVBS, "Money Flow - Desktop Version")

' --- Subroutine ---
Sub EnsureLink(linkPath, vbsPath, description)
    Dim bCreate
    bCreate = False

    If Not objFSO.FileExists(linkPath) Then
        bCreate = True
    ElseIf Not objFSO.FileExists(vbsPath) Then
        bCreate = True
    Else
        Set oLink = WshShell.CreateShortcut(linkPath)
        If Not objFSO.FileExists(Replace(oLink.Arguments, Chr(34), "")) Then
            bCreate = True
        End If
    End If

    If bCreate Then
        Set oLink = WshShell.CreateShortcut(linkPath)
        oLink.TargetPath = "wscript.exe"
        oLink.Arguments = Chr(34) & vbsPath & Chr(34)
        oLink.WorkingDirectory = strProjectRoot
        If objFSO.FileExists(strIconPath) Then
            oLink.IconLocation = strIconPath & ",0"
        End If
        oLink.Description = description
        oLink.Save
    End If
End Sub
