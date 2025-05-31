const toast = {
    container: null,
    activeToasts: new Set(),
    
    init() {
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        }
    },
    
    show({ type = 'info', title, message, duration = 5000 }) {
        this.init();
        
        // Create toast element
        const toastEl = document.createElement('div');
        toastEl.className = `toast ${type}`;
        
        // Create content
        toastEl.innerHTML = `
            <div class="toast-icon">${this.getIcon(type)}</div>
            <div class="toast-content">
                ${title ? `<div class="toast-title">${this.escapeHtml(title)}</div>` : ''}
                ${message ? `<div class="toast-message">${this.escapeHtml(message)}</div>` : ''}
            </div>
            <button class="toast-close" aria-label="Close">×</button>
        `;

        // Remove old toasts if too many
        while (this.container.children.length >= 5) {
            const oldToast = this.container.firstChild;
            this.removeToast(oldToast);
        }
        
        // Add to DOM and track
        this.container.appendChild(toastEl);
        this.activeToasts.add(toastEl);
        
        // Show toast with slight delay to ensure transition works
        setTimeout(() => {
            toastEl.classList.add('show');
        }, 10);

        // Setup close button
        const closeBtn = toastEl.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => this.removeToast(toastEl));

        // Auto dismiss
        if (duration > 0) {
            setTimeout(() => {
                if (this.activeToasts.has(toastEl)) {
                    this.removeToast(toastEl);
                }
            }, duration);
        }

        // Click outside to dismiss
        const handleClickOutside = (e) => {
            if (!toastEl.contains(e.target) && this.activeToasts.has(toastEl)) {
                this.removeToast(toastEl);
                document.removeEventListener('click', handleClickOutside);
            }
        };

        // Add click outside handler after a short delay
        setTimeout(() => {
            document.addEventListener('click', handleClickOutside);
        }, 100);

        return toastEl;
    },

    removeToast(toastEl) {
        if (!this.activeToasts.has(toastEl)) return;
        
        toastEl.classList.remove('show');
        this.activeToasts.delete(toastEl);
        
        // Remove after transition
        setTimeout(() => {
            if (toastEl.parentNode === this.container) {
                this.container.removeChild(toastEl);
            }
        }, 300);
    },
    
    escapeHtml(str) {
        if (typeof str !== 'string') return str;
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },
    
    getIcon(type) {
        switch (type) {
            case 'success':
                return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#22c55e">
                    <path d="M5 13l4 4L19 7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>`;
            case 'error':
                return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#ef4444">
                    <path d="M6 18L18 6M6 6l12 12" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>`;
            default:
                return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#3b82f6">
                    <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>`;
        }
    }
};

// Initialize toast
window.toast = toast; 