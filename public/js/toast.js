const toast = {
    container: null,
    timeouts: {},
    
    init() {
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        }
    },
    
    show({ type = 'info', title, message, duration = 5000 }) {
        this.init();
        
        const id = Math.random().toString(36).substr(2, 9);
        const toastElement = document.createElement('div');
        toastElement.id = `toast-${id}`;
        toastElement.className = `toast ${type} animate-slide-in`;
        toastElement.innerHTML = `
            <div class="toast-icon">
                ${this.getIcon(type)}
            </div>
            <div class="toast-content">
                ${title ? `<div class="toast-title">${title}</div>` : ''}
                ${message ? `<div class="toast-message">${message}</div>` : ''}
            </div>
            <div class="toast-close" onclick="toast.hide('${id}')">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </div>
        `;
        
        this.container.appendChild(toastElement);
        
        // Set timeout to remove the toast
        if (duration > 0) {
            this.timeouts[id] = setTimeout(() => {
                this.hide(id);
            }, duration);
        }
        
        return id;
    },
    
    hide(id) {
        const toastElement = document.getElementById(`toast-${id}`);
        if (toastElement) {
            toastElement.classList.remove('animate-slide-in');
            toastElement.classList.add('animate-slide-out');
            
            // Remove the element after animation
            setTimeout(() => {
                if (toastElement.parentNode) {
                    toastElement.parentNode.removeChild(toastElement);
                }
                if (this.timeouts[id]) {
                    clearTimeout(this.timeouts[id]);
                    delete this.timeouts[id];
                }
            }, 300);
        }
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