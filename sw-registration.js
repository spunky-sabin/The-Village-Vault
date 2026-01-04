/**
 * SERVICE WORKER REGISTRATION
 * 
 * This file handles the registration and lifecycle management of the service worker.
 * Include this script in your HTML pages to enable image caching.
 * 
 * Usage: Add to your HTML:
 * <script src="/sw-registration.js" defer></script>
 */

(function () {
    'use strict';

    // ============================================
    // FEATURE DETECTION
    // ============================================

    /**
     * Check if service workers are supported
     */
    if (!('serviceWorker' in navigator)) {
        console.warn('[SW-REG] Service Workers are not supported in this browser');
        return;
    }

    /**
     * Check if Cache API is supported
     */
    if (!('caches' in window)) {
        console.warn('[SW-REG] Cache API is not supported in this browser');
        return;
    }

    // ============================================
    // REGISTRATION
    // ============================================

    /**
     * Register the service worker when the page loads
     */
    window.addEventListener('load', async () => {
        try {
            console.log('[SW-REG] Registering service worker...');

            const registration = await navigator.serviceWorker.register('/service-worker.js', {
                scope: '/' // Service worker will control all pages under root
            });

            console.log('[SW-REG] Service worker registered successfully!');
            console.log('[SW-REG] Scope:', registration.scope);

            // ============================================
            // UPDATE DETECTION
            // ============================================

            /**
             * Check for service worker updates
             * This ensures users get the latest version
             */
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                console.log('[SW-REG] New service worker version found, installing...');

                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed') {
                        if (navigator.serviceWorker.controller) {
                            // New service worker is available, but old one is still controlling the page
                            console.log('[SW-REG] New version available! Refresh the page to update.');

                            // Optional: Show a notification to the user
                            showUpdateNotification();
                        } else {
                            // First install
                            console.log('[SW-REG] Service worker installed for the first time!');
                        }
                    }
                });
            });

            // ============================================
            // AUTOMATIC UPDATES
            // ============================================

            /**
             * Check for updates periodically (every 24 hours)
             * This ensures the service worker stays up to date
             */
            setInterval(() => {
                registration.update();
                console.log('[SW-REG] Checking for service worker updates...');
            }, 24 * 60 * 60 * 1000); // 24 hours

            // Also check for updates when the page becomes visible
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    registration.update();
                }
            });

        } catch (error) {
            console.error('[SW-REG] Service worker registration failed:', error);
        }
    });

    // ============================================
    // SERVICE WORKER CONTROL
    // ============================================

    /**
     * Listen for messages from the service worker
     */
    navigator.serviceWorker.addEventListener('message', (event) => {
        console.log('[SW-REG] Message from service worker:', event.data);
    });

    /**
     * Handle service worker controller changes
     * This fires when a new service worker takes control
     */
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[SW-REG] New service worker has taken control');

        // Optional: Reload the page to ensure everything uses the new service worker
        // Uncomment the line below if you want automatic reload
        // window.location.reload();
    });

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================

    /**
     * Show a notification when a new service worker version is available
     * You can customize this to match your site's design
     */
    function showUpdateNotification() {
        // Check if we've already shown the notification in this session
        if (sessionStorage.getItem('sw-update-shown')) {
            return;
        }

        // Simple console notification (you can replace with a UI element)
        console.log('%c🔄 New version available!', 'font-size: 16px; color: #00a8ff; font-weight: bold;');
        console.log('%cRefresh the page to get the latest updates and improved caching.', 'color: #ffcc00;');

        sessionStorage.setItem('sw-update-shown', 'true');

        // Optional: Create a toast notification (uncomment to use)
        /*
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: linear-gradient(135deg, #00a8ff, #0096e0);
            color: white;
            padding: 16px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            font-family: Arial, sans-serif;
            cursor: pointer;
            animation: slideIn 0.3s ease-out;
        `;
        toast.innerHTML = '🔄 New version available! Click to refresh.';
        
        toast.addEventListener('click', () => {
            window.location.reload();
        });
        
        document.body.appendChild(toast);
        
        // Auto-remove after 10 seconds
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => toast.remove(), 300);
        }, 10000);
        */
    }

    // ============================================
    // GLOBAL API (Optional)
    // ============================================

    /**
     * Expose service worker utilities to the global scope
     * Allows manual control from the browser console or app code
     */
    window.swUtils = {
        /**
         * Get the current service worker registration
         */
        getRegistration: async () => {
            return await navigator.serviceWorker.getRegistration();
        },

        /**
         * Manually unregister the service worker
         */
        unregister: async () => {
            const registration = await navigator.serviceWorker.getRegistration();
            if (registration) {
                const success = await registration.unregister();
                console.log('[SW-REG] Unregistered:', success);
                return success;
            }
            return false;
        },

        /**
         * Clear the image cache
         */
        clearCache: async () => {
            const registration = await navigator.serviceWorker.getRegistration();
            if (registration && registration.active) {
                return new Promise((resolve) => {
                    const messageChannel = new MessageChannel();
                    messageChannel.port1.onmessage = (event) => {
                        console.log('[SW-REG] Cache cleared:', event.data);
                        resolve(event.data.success);
                    };
                    registration.active.postMessage(
                        { type: 'CLEAR_CACHE' },
                        [messageChannel.port2]
                    );
                });
            }
            return false;
        },

        /**
         * Get the current cache size
         */
        getCacheSize: async () => {
            const registration = await navigator.serviceWorker.getRegistration();
            if (registration && registration.active) {
                return new Promise((resolve) => {
                    const messageChannel = new MessageChannel();
                    messageChannel.port1.onmessage = (event) => {
                        console.log('[SW-REG] Cache size:', event.data.size);
                        resolve(event.data.size);
                    };
                    registration.active.postMessage(
                        { type: 'GET_CACHE_SIZE' },
                        [messageChannel.port2]
                    );
                });
            }
            return 0;
        },

        /**
         * Force update the service worker
         */
        update: async () => {
            const registration = await navigator.serviceWorker.getRegistration();
            if (registration) {
                await registration.update();
                console.log('[SW-REG] Update check initiated');
            }
        }
    };

    // Log available utilities
    console.log('[SW-REG] Service worker utilities available at window.swUtils');
    console.log('[SW-REG] Try: swUtils.getCacheSize(), swUtils.clearCache(), swUtils.update()');

})();
