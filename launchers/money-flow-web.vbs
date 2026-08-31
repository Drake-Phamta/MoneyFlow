' Money Flow — bản web. Mở trình duyệt vào http://localhost:3001
'
' Gọi `npm start` chứ không gọi thẳng `node server.js`: server chỉ phục vụ
' thư mục dist/ chứ không tự dựng lại, nên gọi thẳng thì mở app ra là thấy bản
' từ lần dựng gần nhất, code đã sửa mà màn hình không đổi và chẳng có gì báo.
' `npm start` có prestart chạy `vite build` trước.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
sh.Run "cmd /c npm start", 0, False
WScript.Sleep 8000
sh.Run "http://localhost:3001", 1, False
