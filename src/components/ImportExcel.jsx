import { useState, useRef } from 'react';
import { apiClient, isElectron } from '../utils/apiClient';
import { DownloadSimple, Spinner, CheckCircle, XCircle } from '../utils/iconMap';

export default function ImportExcel() {
  const [status, setStatus] = useState('idle');
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  async function handleImport() {
    setStatus('importing');
    setError(null);
    setResults(null);

    try {
      if (isElectron) {
        const filePath = await window.api.openFile();
        if (!filePath) {
          setStatus('idle');
          return;
        }
        const result = await window.api.importExcel(filePath);
        setResults(result);
        setStatus('done');
      } else {
        fileInputRef.current?.click();
      }
    } catch (err) {
      setError(err.message || 'Lỗi không xác định');
      setStatus('error');
    }
  }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus('importing');
    try {
      const result = await apiClient.importExcel(file);
      setResults(result);
      setStatus('done');
    } catch (err) {
      setError(err.message || 'Lỗi không xác định');
      setStatus('error');
    }
    e.target.value = '';
  }

  return (
    <div className="space-y-6">
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileSelect} className="hidden" />
      <h1 className="text-2xl font-bold flex items-center gap-2"><DownloadSimple size={28} /> Import Excel</h1>

      <div className="card max-w-xl">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Import dữ liệu từ file Excel cũ</h3>
        <p className="text-sm text-slate-500 mb-4">
          Chọn file Excel (.xlsx) hiện tại để import toàn bộ dữ liệu vào hệ thống.
          File cần có các sheet: Tham Số, Master Ledger, Execution Log.
        </p>

        <button
          onClick={handleImport}
          disabled={status === 'importing'}
          className="btn-primary"
        >
          {status === 'importing' ? <><Spinner size={14} className="animate-spin inline mr-1" /> Đang import...</> : <><DownloadSimple size={14} className="inline mr-1" /> Chọn File Excel</>}
        </button>

        {results && (
          <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
            <h4 className="text-sm font-semibold text-emerald-700 mb-2 flex items-center gap-1"><CheckCircle size={16} /> Import thành công!</h4>
            <div className="text-sm text-slate-600 space-y-1">
              <div>Tham số: <span className="font-bold">{results.parameters}</span> mục</div>
              <div>Master Ledger: <span className="font-bold">{results.ledger}</span> tháng</div>
              <div>Execution Log: <span className="font-bold">{results.transactions}</span> lệnh</div>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
            <h4 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-1"><XCircle size={16} /> Lỗi</h4>
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
      </div>

      <div className="card max-w-xl">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Hướng dẫn</h3>
        <div className="text-sm text-slate-500 space-y-2">
          <p>1. Nhấn nút "Chọn File Excel" ở trên</p>
          <p>2. Chọn file <code className="bg-slate-100 px-1 rounded">Nhật ký đầu tư.xlsx</code></p>
          <p>3. Hệ thống sẽ tự động đọc và import dữ liệu</p>
          <p>4. Sau khi import, vào Dashboard để xem kết quả</p>
        </div>
      </div>
    </div>
  );
}
