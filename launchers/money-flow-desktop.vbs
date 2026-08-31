' Money Flow — bản desktop (Electron).
'
' Dựng lại giao diện trước khi mở: Electron nạp thư mục dist/ chứ không tự dựng,
' nên bỏ bước này là mở ra thấy bản của lần dựng gần nhất.
'
' Tệp này chạy ẩn, nên nếu bước dựng hỏng thì người dùng không thấy gì cả.
' Chạy dựng ở chế độ CHỜ và kiểm mã trả về, hỏng thì nói ra.

Option Explicit

Dim fso, sh, root, code
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
sh.CurrentDirectory = root

' 0 = ẩn, True = chờ xong mới đi tiếp
code = sh.Run("cmd /c npx vite build", 0, True)

If code <> 0 Then
    MsgBox "Không dựng được giao diện (mã lỗi " & code & ")." & vbCrLf & vbCrLf & _
           "Mở thư mục dự án rồi chạy lệnh này để xem lỗi:" & vbCrLf & vbCrLf & _
           "    npx vite build", _
           vbExclamation, "Money Flow"
    WScript.Quit 1
End If

sh.Run "cmd /c npx electron .", 0, False
