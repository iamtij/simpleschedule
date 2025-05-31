const toast = {
    container: null,
    
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
            <button class="toast-close" aria-label="Close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M6 18L18 6M6 6l12 12" stroke-width="2" stroke-linecap="round"/>
                </svg>
            </button>
        `;
        
        // Add to DOM
        this.container.appendChild(toastEl);
        
        // Limit number of toasts
        const maxToasts = 5;
        while (this.container.children.length > maxToasts) {
            this.container.removeChild(this.container.firstChild);
        }
        
        // Show toast
        requestAnimationFrame(() => {
            toastEl.classList.add('show');
        });
        
        // Setup close button
        const closeBtn = toastEl.querySelector('.toast-close');
        const close = () => {
            toastEl.classList.remove('show');
            setTimeout(() => {
                if (toastEl.parentNode) {
                    toastEl.parentNode.removeChild(toastEl);
                }
            }, 300); // Match transition duration
        };
        
        closeBtn.addEventListener('click', close);
        
        // Auto close
        if (duration) {
            setTimeout(close, duration);
        }
        
        // Click outside to close
        const clickOutside = (e) => {
            if (!toastEl.contains(e.target)) {
                close();
                document.removeEventListener('click', clickOutside);
            }
        };
        setTimeout(() => {
            document.addEventListener('click', clickOutside);
        }, 100);
        
        return toastEl;
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