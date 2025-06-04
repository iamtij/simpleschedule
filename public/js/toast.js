const toast = {
    container: null,
    activeToasts: new Set(),
    
    init() {
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'toast-container';
            this.container.className = 'fixed top-4 right-4 z-50 flex flex-col gap-2';
            document.body.appendChild(this.container);
        }
    },
    
    show({ type = 'info', title = '', message = '', duration = 3000 }) {
        this.init(); // Ensure container exists

        // Create toast element
        const toastEl = document.createElement('div');
        toastEl.className = `flex items-center p-4 rounded-lg shadow-lg transition-all transform translate-x-full ${
            type === 'success' ? 'bg-green-100 text-green-800' :
            type === 'error' ? 'bg-red-100 text-red-800' :
            'bg-blue-100 text-blue-800'
        }`;

        // Add icon based on type
        const icon = document.createElement('div');
        icon.className = 'flex-shrink-0 w-5 h-5 mr-3';
        icon.innerHTML = this.getIcon(type);

        // Add content
        const content = document.createElement('div');
        content.className = 'flex flex-col';
        if (title) {
            const titleEl = document.createElement('span');
            titleEl.className = 'font-medium';
            titleEl.textContent = this.escapeHtml(title);
            content.appendChild(titleEl);
        }
        if (message) {
            const messageEl = document.createElement('span');
            messageEl.className = 'text-sm';
            messageEl.textContent = this.escapeHtml(message);
            content.appendChild(messageEl);
        }

        // Add close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'ml-auto pl-3';
        closeBtn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>';
        closeBtn.onclick = () => this.removeToast(toastEl);

        // Assemble toast
        toastEl.appendChild(icon);
        toastEl.appendChild(content);
        toastEl.appendChild(closeBtn);

        // Add to container and track
        this.container.appendChild(toastEl);
        this.activeToasts.add(toastEl);

        // Animate in
        requestAnimationFrame(() => {
            toastEl.classList.remove('translate-x-full');
        });

        // Auto remove after duration
        if (duration > 0) {
            setTimeout(() => this.removeToast(toastEl), duration);
        }
    },

    removeToast(toastEl) {
        if (!toastEl || !this.activeToasts.has(toastEl)) return;
        
        toastEl.classList.add('translate-x-full');
        this.activeToasts.delete(toastEl);
        
        // Remove after transition
        setTimeout(() => {
            if (toastEl.parentNode === this.container) {
                this.container.removeChild(toastEl);
            }
            
            // Clean up container if empty
            if (this.container && this.container.children.length === 0) {
                document.body.removeChild(this.container);
                this.container = null;
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