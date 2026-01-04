/**
 * SERVICE WORKER FOR IMAGE CACHING
 * 
 * Purpose: Cache image assets for faster repeat visits using stale-while-revalidate strategy
 * Cache: Only images (.png, .jpg, .jpeg, .webp, .avif, .svg)
 * Strategy: Serve cached images instantly, update cache in background
 * Limit: Max 200 cached items (configurable)
 */

// ============================================
// CONFIGURATION
// ============================================

const CACHE_NAME = 'image-cache-v1';
const MAX_CACHE_ITEMS = 200; // Maximum number of images to cache

// Image file extensions to cache
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.svg'];

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Check if a URL points to an image resource
 * @param {string} url - The URL to check
 * @returns {boolean} True if URL is an image
 */
function isImageRequest(url) {
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname.toLowerCase();

        // Check if the pathname ends with any of our image extensions
        return IMAGE_EXTENSIONS.some(ext => pathname.endsWith(ext));
    } catch (e) {
        console.warn('[SW] Invalid URL:', url, e);
        return false;
    }
}

/**
 * Clean up old cache entries when exceeding max items
 * Uses LRU (Least Recently Used) strategy
 * @param {Cache} cache - The cache object to clean
 */
async function cleanupCache(cache) {
    try {
        const keys = await cache.keys();

        // If we haven't exceeded the limit, no cleanup needed
        if (keys.length <= MAX_CACHE_ITEMS) {
            console.log(`[SW] Cache size: ${keys.length}/${MAX_CACHE_ITEMS} - No cleanup needed`);
            return;
        }

        // Calculate how many items to remove (remove oldest 20% when limit exceeded)
        const itemsToRemove = Math.ceil(keys.length * 0.2);
        const keysToDelete = keys.slice(0, itemsToRemove);

        console.log(`[SW] Cache cleanup: Removing ${itemsToRemove} oldest items`);

        // Delete the oldest entries
        await Promise.all(
            keysToDelete.map(request => cache.delete(request))
        );

        console.log(`[SW] Cache cleaned. New size: ${keys.length - itemsToRemove}/${MAX_CACHE_ITEMS}`);
    } catch (error) {
        console.error('[SW] Cache cleanup failed:', error);
    }
}

/**
 * Update cache with fresh response in the background
 * @param {Request} request - The request to fetch and cache
 * @param {Cache} cache - The cache object to update
 */
async function updateCache(request, cache) {
    try {
        const response = await fetch(request);

        // Only cache successful responses
        if (response && response.status === 200) {
            // Clone the response as it can only be used once
            await cache.put(request, response.clone());
            console.log('[SW] Cache updated:', request.url);

            // Perform cleanup after adding new item
            await cleanupCache(cache);
        }

        return response;
    } catch (error) {
        console.warn('[SW] Background update failed:', request.url, error);
        // Return null to indicate fetch failed
        return null;
    }
}

// ============================================
// SERVICE WORKER LIFECYCLE EVENTS
// ============================================

/**
 * INSTALL EVENT
 * Fires when the service worker is first installed
 */
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');

    // Skip waiting to activate immediately
    event.waitUntil(self.skipWaiting());
});

/**
 * ACTIVATE EVENT
 * Fires when the service worker is activated
 * Use this to clean up old caches
 */
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');

    event.waitUntil(
        (async () => {
            // Clean up old cache versions
            const cacheNames = await caches.keys();
            await Promise.all(
                cacheNames
                    .filter(name => name.startsWith('image-cache-') && name !== CACHE_NAME)
                    .map(name => {
                        console.log('[SW] Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );

            // Take control of all clients immediately
            await self.clients.claim();
            console.log('[SW] Service worker activated and ready!');
        })()
    );
});

// ============================================
// FETCH EVENT - MAIN CACHING LOGIC
// ============================================

/**
 * FETCH EVENT
 * Intercepts all network requests
 * Implements stale-while-revalidate for images
 */
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const { url, method } = request;

    // Only handle GET requests for images
    if (method !== 'GET' || !isImageRequest(url)) {
        // Let non-image requests pass through without caching
        return;
    }

    // Implement stale-while-revalidate strategy
    event.respondWith(
        (async () => {
            try {
                // Open the cache
                const cache = await caches.open(CACHE_NAME);

                // Try to get the cached response
                const cachedResponse = await cache.match(request);

                if (cachedResponse) {
                    console.log('[SW] Serving from cache:', url);

                    // Return cached response immediately
                    // Update cache in the background (stale-while-revalidate)
                    event.waitUntil(updateCache(request, cache));

                    return cachedResponse;
                } else {
                    console.log('[SW] Cache miss, fetching:', url);

                    // No cached version, fetch from network
                    const networkResponse = await fetch(request);

                    // Cache the response for future use
                    if (networkResponse && networkResponse.status === 200) {
                        await cache.put(request, networkResponse.clone());
                        console.log('[SW] Cached new image:', url);

                        // Perform cleanup after adding new item
                        event.waitUntil(cleanupCache(cache));
                    }

                    return networkResponse;
                }
            } catch (error) {
                console.error('[SW] Fetch error:', url, error);

                // If both cache and network fail, return a basic error response
                // You could return a placeholder image here if desired
                return new Response('Image fetch failed', {
                    status: 503,
                    statusText: 'Service Unavailable',
                    headers: new Headers({
                        'Content-Type': 'text/plain'
                    })
                });
            }
        })()
    );
});

// ============================================
// MESSAGE EVENT (Optional)
// ============================================

/**
 * MESSAGE EVENT
 * Allows communication between the page and service worker
 * Useful for manual cache operations
 */
self.addEventListener('message', (event) => {
    const { data } = event;

    if (data && data.type === 'SKIP_WAITING') {
        // Force the waiting service worker to become active
        self.skipWaiting();
    }

    if (data && data.type === 'CLEAR_CACHE') {
        // Clear all cached images
        event.waitUntil(
            caches.delete(CACHE_NAME).then(() => {
                console.log('[SW] Cache cleared manually');
                // Notify the client that cache was cleared
                event.ports[0].postMessage({ success: true });
            })
        );
    }

    if (data && data.type === 'GET_CACHE_SIZE') {
        // Return current cache size
        event.waitUntil(
            caches.open(CACHE_NAME).then(async (cache) => {
                const keys = await cache.keys();
                event.ports[0].postMessage({ size: keys.length });
            })
        );
    }
});
