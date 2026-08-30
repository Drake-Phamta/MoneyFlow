import { Component } from 'react';

/**
 * Một lỗi render ở bất kỳ đâu từng làm cả cửa sổ trắng xoá, không thông báo,
 * không đường quay lại. Với dữ liệu tài chính thì màn hình trắng còn tệ hơn
 * một con số sai: người dùng không biết tiền của mình còn hay mất.
 *
 * Hộp này giữ phần còn lại của app sống, nói rõ chuyện gì xảy ra, và không
 * đụng gì tới dữ liệu.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex items-center justify-center p-8 h-full">
        <div className="card max-w-lg w-full">
          <h2 className="text-lg font-bold text-slate-800 mb-2">
            {this.props.title || 'Màn hình này không mở được'}
          </h2>
          <p className="text-sm text-slate-500 mb-4">
            Dữ liệu của bạn không bị ảnh hưởng — lỗi nằm ở phần hiển thị. Các
            màn hình khác vẫn dùng bình thường.
          </p>

          <div className="bg-slate-50 border border-slate-200 rounded-input p-3 mb-4">
            <p className="text-fs-2 text-slate-500 mb-1">Chi tiết lỗi</p>
            <p className="text-fs-2 text-slate-700 font-mono break-words">
              {String(error?.message || error)}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="btn-primary"
            >
              Thử lại
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-secondary"
            >
              Tải lại app
            </button>
          </div>
        </div>
      </div>
    );
  }
}
