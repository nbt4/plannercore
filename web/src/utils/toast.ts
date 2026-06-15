// Simple DOM-based toast notifications — no npm dependency needed.
// Usage: toast.error('Something went wrong'), toast.success('Saved!')

type ToastType = 'error' | 'success' | 'info';

interface ToastOptions {
  duration?: number;
}

function createToast(message: string, type: ToastType, options: ToastOptions = {}): void {
  const duration = options.duration ?? 5000;

  const container = document.getElementById('toast-container') ?? createContainer();

  const toast = document.createElement('div');
  toast.className = 'toast-notification';

  // Type-specific styling
  const colors: Record<ToastType, { bg: string; border: string; text: string; icon: string }> = {
    error:   { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b', icon: '\u2716' },
    success: { bg: '#f0fdf4', border: '#86efac', text: '#166534', icon: '\u2714' },
    info:    { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af', icon: '\u2139' },
  };

  const c = colors[type];
  toast.style.cssText = [
    'display: flex;',
    'align-items: center;',
    'gap: 10px;',
    'padding: 12px 16px;',
    'margin-bottom: 8px;',
    'background: ' + c.bg + ';',
    'border: 1px solid ' + c.border + ';',
    'border-left: 4px solid ' + c.border + ';',
    'color: ' + c.text + ';',
    'border-radius: 8px;',
    'font-size: 14px;',
    'font-family: system-ui, sans-serif;',
    'box-shadow: 0 4px 12px rgba(0,0,0,0.1);',
    'animation: toastSlideIn 0.3s ease-out;',
    'cursor: pointer;',
    'max-width: 400px;',
    'word-break: break-word;',
  ].join(' ');

  toast.innerHTML = [
    '<span style="font-size:16px;flex-shrink:0;">' + c.icon + '</span>',
    '<span style="flex:1;">' + escapeHtml(message) + '</span>',
  ].join('');

  toast.addEventListener('click', () => removeToast(toast));

  container.appendChild(toast);

  // Auto-remove after duration
  setTimeout(() => removeToast(toast), duration);
}

function createContainer(): HTMLElement {
  const container = document.createElement('div');
  container.id = 'toast-container';
  container.style.cssText = [
    'position: fixed;',
    'top: 16px;',
    'right: 16px;',
    'z-index: 99999;',
    'display: flex;',
    'flex-direction: column;',
    'pointer-events: none;',
  ].join(' ');
  document.body.appendChild(container);
  return container;
}

function removeToast(toast: HTMLElement): void {
  toast.style.animation = 'toastSlideOut 0.3s ease-in forwards';
  toast.style.pointerEvents = 'none';
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 300);
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Inject CSS animations once
function injectStyles(): void {
  if (document.getElementById('toast-styles')) return;
  const style = document.createElement('style');
  style.id = 'toast-styles';
  style.textContent = `
    @keyframes toastSlideIn {
      from { transform: translateX(100%); opacity: 0; }
      to   { transform: translateX(0);    opacity: 1; }
    }
    @keyframes toastSlideOut {
      from { transform: translateX(0);    opacity: 1; }
      to   { transform: translateX(100%); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

// Initialize styles on first import
if (typeof document !== 'undefined') {
  injectStyles();
}

export const toast = {
  error(message: string, options?: ToastOptions): void {
    createToast(message, 'error', options);
  },
  success(message: string, options?: ToastOptions): void {
    createToast(message, 'success', options);
  },
  info(message: string, options?: ToastOptions): void {
    createToast(message, 'info', options);
  },
};

export default toast;
