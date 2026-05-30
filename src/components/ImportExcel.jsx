import { useState } from 'react';

export default function ImportExcel() {
  const [status, setStatus] = useState('idle');
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  async function handleImport() {
    setStatus('importing');
    setError(null);
    setResults(null);

    try {
      const filePath = await window.api.openFile();
      if (!filePath) {
        setStatus('idle');
        return;
      }

      const result = await window.api.importExcel(filePath);
      setResults(result);
      setStatus('done');
    } catch (err) {
      setError(err.message || 'Lỗi không xác định');
      setStatus('error');
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">📥 Import Excel</h1>

      <div className="kpi-card max-w-xl">
        <h3 className="text-sm font-semibold text-dark-300 mb-3">Import dữ liệu từ file Excel cũ</h3>
        <p className="text-sm text-dark-400 mb-4">
          Chọn file Excel (.xlsx) hiện tại để import toàn bộ dữ liệu vào hệ thống.
          File cần có các sheet: ⚙️ Tham Số, 📊 Master Ledger, 📋 Execution Log.
        </p>

        <button
          onClick={handleImport}
          disabled={status === 'importing'}
          className="btn-primary"
        >
          {status === 'importing' ? '⏳ Đang import...' : '📂 Chọn File Excel'}
        </button>

        {results && (
          <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
            <h4 className="text-sm font-semibold text-emerald-400 mb-2">✅ Import thành công!</h4>
            <div className="text-sm text-dark-300 space-y-1">
              <div>Tham số: <span className="font-bold">{results.parameters}</span> mục</div>
              <div>Master Ledger: <span className="font-bold">{results.ledger}</span> tháng</div>
              <div>Execution Log: <span className="font-bold">{results.executionLog}</span> lệnh</div>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <h4 className="text-sm font-semibold text-red-400 mb-2">❌ Lỗi</h4>
            <p className="text-sm text-dark-300">{error}</p>
          </div>
        )}
      </div>

      <div className="kpi-card max-w-xl">
        <h3 className="text-sm font-semibold text-dark-300 mb-3">Hướng dẫn</h3>
        <div className="text-sm text-dark-400 space-y-2">
          <p>1. Nhấn nút "Chọn File Excel" ở trên</p>
          <p>2. Chọn file <code className="bg-dark-700 px-1 rounded">Nhật ký đầu tư.xlsx</code></p>
          <p>3. Hệ thống sẽ tự động đọc và import dữ liệu</p>
          <p>4. Sau khi import, vào Dashboard để xem kết quả</p>
        </div>
      </div>
    </div>
  );
}
