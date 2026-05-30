Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "D:\New_era\financial-command-center"
WshShell.Run "cmd /c start /b npm run dev:web", 0, False
WScript.Sleep 5000
WshShell.Run "http://localhost:5173", 1, False
