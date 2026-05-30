Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "D:\New_era\Money_Flow"
WshShell.Run "cmd /c start /b npm run dev:web", 0, False
WScript.Sleep 8000
WshShell.Run "cmd /c npx electron .", 1, False
