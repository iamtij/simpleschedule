// Toast notification system
const toast = {
    createContainer: function() {
        const container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
        return container;
    },

    show: function({ type = 'info', title = '', message = '' }) {
        const toastContainer = document.getElementById('toast-container') || this.createContainer();
        const toastElement = document.createElement('div');
        
        // Set toast classes based on type
        const baseClasses = 'flex items-start p-4 mb-4 rounded-lg shadow-lg border-l-4 transform transition-all duration-300';
        const typeClasses = type === 'error' 
            ? 'bg-red-50 border-red-500 text-red-800' 
            : 'bg-green-50 border-green-500 text-green-800';
        
        toastElement.className = `${baseClasses} ${typeClasses}`;
        toastElement.style.minWidth = '300px';
        toastElement.style.maxWidth = '500px';

        // Create toast content
        toastElement.innerHTML = `
            <div class="flex-1">
                ${title ? `<h3 class="text-sm font-medium">${title}</h3>` : ''}
                <div class="mt-1 text-sm opacity-90">${message}</div>
            </div>
            <button class="ml-4 text-gray-400 hover:text-gray-600 focus:outline-none">
                <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                </svg>
            </button>
        `;

        // Add close button functionality
        const closeButton = toastElement.querySelector('button');
        closeButton.addEventListener('click', () => {
            toastElement.style.opacity = '0';
            toastElement.style.transform = 'translateX(100%)';
            setTimeout(() => toastElement.remove(), 300);
        });

        // Add to container
        toastContainer.appendChild(toastElement);

        // Animate in
        requestAnimationFrame(() => {
            toastElement.style.transform = 'translateX(0)';
            toastElement.style.opacity = '1';
        });

        // Auto remove after duration (longer for errors)
        const duration = type === 'error' ? 10000 : 5000; // 10 seconds for errors, 5 for success
        setTimeout(() => {
            if (toastElement.parentElement) {
                toastElement.style.opacity = '0';
                toastElement.style.transform = 'translateX(100%)';
                setTimeout(() => toastElement.remove(), 300);
            }
        }, duration);
    }
};

// Initialize toast
window.toast = toast; 