' Money Flow — bản web. Mở trình duyệt vào http://localhost:3001
'
' Tệp này chạy ẩn, nên nếu có gì hỏng thì người dùng KHÔNG thấy gì cả: bấm vào
' lối tắt rồi ngồi chờ một trình duyệt không bao giờ mở. Vì thế nó phải tự xử
' lý ba tình huống thay vì phó mặc:
'
'   1. Máy chủ đang chạy sẵn  -> chỉ mở trình duyệt. Bấm hai lần vào lối tắt
'      không được biến thành lỗi "cổng đang bận".
'   2. Chưa chạy              -> khởi động, chờ nó trả lời rồi mới mở trình duyệt.
'   3. Không lên được         -> hiện một hộp thoại nói rõ phải làm gì.
'
' Gọi `npm start` chứ không gọi thẳng `node server.js`: máy chủ chỉ phục vụ thư
' mục dist/ chứ không tự dựng, nên gọi thẳng thì mở ra là thấy bản cũ.

Option Explicit

Dim fso, sh, root, url, i
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
sh.CurrentDirectory = root
url = "http://localhost:3001"

If Responding(url) Then
    sh.Run url, 1, False
    WScript.Quit 0
End If

sh.Run "cmd /c npm start", 0, False

' Lần đầu phải dựng lại giao diện nên có thể mất một phút.
For i = 1 To 120
    WScript.Sleep 1000
    If Responding(url) Then
        sh.Run url, 1, False
        WScript.Quit 0
    End If
Next

MsgBox "Money Flow chưa khởi động được sau 2 phút." & vbCrLf & vbCrLf & _
       "Mở thư mục dự án rồi chạy lệnh này trong cửa sổ lệnh:" & vbCrLf & vbCrLf & _
       "    npm start" & vbCrLf & vbCrLf & _
       "Cửa sổ đó sẽ nói rõ vướng ở đâu.", _
       vbExclamation, "Money Flow"
WScript.Quit 1

Function Responding(u)
    Dim http
    Responding = False
    On Error Resume Next
    Set http = CreateObject("MSXML2.XMLHTTP")
    http.Open "GET", u, False
    http.Send
    If Err.Number = 0 Then
        If http.Status >= 200 And http.Status < 500 Then Responding = True
    End If
    On Error GoTo 0
End Function
