const toast = {
    container: null,
    timeouts: new Map(),
    animationEndHandlers: new Map(),
    maxToasts: 5,
    
    init() {
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);

            // Add click handler to container for event delegation
            this.container.addEventListener('click', (e) => {
                const closeButton = e.target.closest('.toast-close');
                if (closeButton) {
                    const toastElement = closeButton.closest('.toast');
                    if (toastElement) {
                        const toastId = toastElement.id.replace('toast-', '');
                        this.hide(toastId);
                    }
                }
            });

            // Add click-outside handler
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.toast') && !e.target.closest('.toast-container')) {
                    this.hideAll();
                }
            });

            // Cleanup on page unload
            window.addEventListener('unload', () => this.cleanup());
        }
    },
    
    show({ type = 'info', title, message, duration = 5000 }) {
        this.init();
        
        // Generate unique ID
        const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
        
        // Check if we need to remove old toasts
        const toasts = this.container.querySelectorAll('.toast');
        if (toasts.length >= this.maxToasts) {
            const oldestToast = toasts[0];
            const oldestId = oldestToast.id.replace('toast-', '');
            this.hide(oldestId);
        }

        const toastElement = document.createElement('div');
        toastElement.id = `toast-${id}`;
        toastElement.className = `toast ${type}`;
        toastElement.setAttribute('role', 'alert');
        toastElement.setAttribute('aria-live', 'polite');
        toastElement.innerHTML = `
            <div class="toast-icon">
                ${this.getIcon(type)}
            </div>
            <div class="toast-content">
                ${title ? `<div class="toast-title">${this.escapeHtml(title)}</div>` : ''}
                ${message ? `<div class="toast-message">${this.escapeHtml(message)}</div>` : ''}
            </div>
            <button type="button" class="toast-close" aria-label="Close notification">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
        `;
        
        // Add to DOM
        this.container.appendChild(toastElement);
        
        // Force a reflow to ensure the animation works
        toastElement.offsetHeight;
        
        // Trigger animation
        requestAnimationFrame(() => {
            toastElement.classList.add('animate-slide-in');
        });
        
        // Set timeout to remove the toast
        if (duration > 0) {
            const timeout = setTimeout(() => {
                this.hide(id);
            }, duration);
            this.timeouts.set(id, timeout);
        }
        
        return id;
    },
    
    hide(id) {
        const toastElement = document.getElementById(`toast-${id}`);
        if (!toastElement || toastElement.classList.contains('animate-slide-out')) return;

        toastElement.classList.remove('animate-slide-in');
        toastElement.classList.add('animate-slide-out');
        
        // Clear any existing animation end handler
        const existingHandler = this.animationEndHandlers.get(id);
        if (existingHandler) {
            toastElement.removeEventListener('animationend', existingHandler);
            this.animationEndHandlers.delete(id);
        }
        
        // Add new animation end handler
        const cleanup = () => {
            if (toastElement.parentNode) {
                toastElement.parentNode.removeChild(toastElement);
            }
            // Clear timeout if it exists
            const timeout = this.timeouts.get(id);
            if (timeout) {
                clearTimeout(timeout);
                this.timeouts.delete(id);
            }
            this.animationEndHandlers.delete(id);
        };
        
        this.animationEndHandlers.set(id, cleanup);
        toastElement.addEventListener('animationend', cleanup, { once: true });
    },

    hideAll() {
        const toasts = Array.from(this.container.querySelectorAll('.toast'));
        toasts.forEach(toastElement => {
            const id = toastElement.id.replace('toast-', '');
            this.hide(id);
        });
    },

    cleanup() {
        // Clear all timeouts
        this.timeouts.forEach(timeout => clearTimeout(timeout));
        this.timeouts.clear();
        
        // Remove all animation end handlers
        this.animationEndHandlers.clear();
        
        // Remove all toasts immediately
        if (this.container) {
            this.container.innerHTML = '';
        }
    },

    escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return unsafe;
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    },
    
    getIcon(type) {
        switch (type) {
            case 'success':
                return `<svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                </svg>`;
            case 'error':
                return `<svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>`;
            case 'info':
            default:
                return `<svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>`;
        }
    }
};

// Initialize toast
window.toast = toast; 