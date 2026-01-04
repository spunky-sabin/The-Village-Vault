// ============================================
// CACHE MANAGER - localStorage with Timestamp Validation
// ============================================
// This module provides caching functionality for Clash of Clans JSON data
// with automatic 24-hour expiration based on the export timestamp.
//
// The Clash of Clans JSON export contains a Unix timestamp (in seconds, UTC)
// that represents when the export was generated. This module validates
// that the cached data is no older than 24 hours (86,400 seconds).

/**
 * Storage keys used by the cache manager
 */
const CACHE_KEYS = {
    CLAN_DATA: 'userCollectionData',
    TIMESTAMP: 'clanDataTimestamp',
    METADATA: 'clanDataMetadata'
};

/**
 * Constants for cache validation
 */
const CACHE_CONFIG = {
    // 24 hours in seconds (used for comparison with Unix timestamps)
    EXPIRY_SECONDS: 86400,

    // 24 hours in milliseconds (for JavaScript Date calculations)
    EXPIRY_MS: 86400000
};

/**
 * Check if localStorage is available and functional
 * @returns {boolean} True if localStorage is available, false otherwise
 */
function isLocalStorageAvailable() {
    try {
        const testKey = '__storage_test__';
        localStorage.setItem(testKey, 'test');
        localStorage.removeItem(testKey);
        return true;
    } catch (e) {
        console.warn('localStorage is not available:', e);
        return false;
    }
}

/**
 * Validates that a timestamp is present and numeric
 * @param {any} timestamp - The timestamp value to validate
 * @returns {{valid: boolean, error?: string}} Validation result
 */
function validateTimestamp(timestamp) {
    if (timestamp === undefined || timestamp === null) {
        return {
            valid: false,
            error: 'Timestamp field is missing from the JSON export'
        };
    }

    // Check if timestamp is numeric (number or numeric string)
    const numericTimestamp = Number(timestamp);
    if (isNaN(numericTimestamp) || numericTimestamp <= 0) {
        return {
            valid: false,
            error: 'Timestamp is not a valid number'
        };
    }

    // Sanity check: timestamp should be a reasonable Unix timestamp
    // (between year 2020 and year 2100 to catch obvious errors)
    const minTimestamp = 1577836800; // 2020-01-01 00:00:00 UTC
    const maxTimestamp = 4102444800; // 2100-01-01 00:00:00 UTC

    if (numericTimestamp < minTimestamp || numericTimestamp > maxTimestamp) {
        return {
            valid: false,
            error: 'Timestamp value is outside reasonable range'
        };
    }

    return { valid: true };
}

/**
 * Check if cached data has expired (older than 24 hours)
 * 
 * IMPORTANT: The timestamp from Clash of Clans is in Unix seconds (UTC).
 * We must multiply by 1000 to convert to milliseconds for JavaScript Date.
 * 
 * WHY 24 HOURS?
 * - Clan data can change frequently (donations, attacks, etc.)
 * - 24 hours provides a good balance between convenience and data freshness
 * - Ensures users see reasonably up-to-date information
 * 
 * @param {number} timestamp - Unix timestamp in SECONDS (from Clash of Clans export)
 * @returns {{expired: boolean, age?: number, reason?: string}} Expiration check result
 */
function isDataExpired(timestamp) {
    // Convert Unix timestamp from SECONDS to MILLISECONDS
    // Clash of Clans exports use Unix timestamps in seconds (standard Unix time)
    // JavaScript Date.now() returns milliseconds since epoch
    // Therefore: multiply by 1000 to convert seconds → milliseconds
    const timestampMs = timestamp * 1000;

    // Get current time in milliseconds (UTC)
    const currentTimeMs = Date.now();

    // Calculate age of the data in milliseconds
    const ageMs = currentTimeMs - timestampMs;

    // Check if data is older than 24 hours (86,400,000 milliseconds)
    const expired = ageMs > CACHE_CONFIG.EXPIRY_MS;

    // Calculate age in hours for better user feedback
    const ageHours = Math.floor(ageMs / (1000 * 60 * 60));

    return {
        expired,
        ageMs,
        ageHours,
        reason: expired
            ? `Data is ${ageHours} hours old (older than 24 hours)`
            : `Data is ${ageHours} hours old (still valid)`
    };
}

/**
 * Save Clash of Clans JSON data to localStorage with timestamp
 * 
 * @param {string|object} jsonData - The Clash of Clans JSON export (can be string or parsed object)
 * @returns {{success: boolean, message: string, timestamp?: number}} Save result
 */
function saveClanData(jsonData) {
    // Check if localStorage is available
    if (!isLocalStorageAvailable()) {
        return {
            success: false,
            message: 'localStorage is not available. Your browser may be in private mode or storage may be disabled.'
        };
    }

    try {
        // Parse JSON if it's a string
        let parsedData;
        if (typeof jsonData === 'string') {
            try {
                parsedData = JSON.parse(jsonData);
            } catch (parseError) {
                return {
                    success: false,
                    message: 'Invalid JSON format. Please check your export data.'
                };
            }
        } else {
            parsedData = jsonData;
        }

        // Extract and validate timestamp
        const timestamp = parsedData.timestamp;
        const timestampValidation = validateTimestamp(timestamp);

        if (!timestampValidation.valid) {
            return {
                success: false,
                message: `Invalid timestamp: ${timestampValidation.error}. Please ensure you're using a valid Clash of Clans export.`
            };
        }

        // Convert to string for storage if needed
        const dataToStore = typeof jsonData === 'string' ? jsonData : JSON.stringify(parsedData);

        // Store the data and timestamp
        localStorage.setItem(CACHE_KEYS.CLAN_DATA, dataToStore);
        localStorage.setItem(CACHE_KEYS.TIMESTAMP, String(timestamp));

        // Store metadata for debugging and information
        const metadata = {
            savedAt: Date.now(),
            exportTimestamp: timestamp,
            exportDate: new Date(timestamp * 1000).toISOString()
        };
        localStorage.setItem(CACHE_KEYS.METADATA, JSON.stringify(metadata));

        return {
            success: true,
            message: 'Data cached successfully',
            timestamp: Number(timestamp)
        };

    } catch (error) {
        console.error('Error saving clan data:', error);
        return {
            success: false,
            message: `Failed to save data: ${error.message}`
        };
    }
}

/**
 * Load Clash of Clans data from localStorage with validation
 * 
 * This function performs the following checks:
 * 1. Verifies localStorage is available
 * 2. Checks if data exists
 * 3. Validates timestamp is present and valid
 * 4. Checks if data has expired (>24 hours old)
 * 
 * @returns {{
 *   status: 'valid'|'expired'|'not_found'|'error',
 *   data?: object,
 *   message: string,
 *   timestamp?: number,
 *   age?: number
 * }} Load result with status and data
 */
function loadClanData() {
    // Check if localStorage is available
    if (!isLocalStorageAvailable()) {
        return {
            status: 'error',
            message: 'localStorage is not available'
        };
    }

    try {
        // Check if data exists
        const storedData = localStorage.getItem(CACHE_KEYS.CLAN_DATA);
        const storedTimestamp = localStorage.getItem(CACHE_KEYS.TIMESTAMP);

        if (!storedData) {
            return {
                status: 'not_found',
                message: 'No cached data found. Please upload your Clash of Clans export.'
            };
        }

        // Parse the stored data
        let parsedData;
        try {
            parsedData = JSON.parse(storedData);
        } catch (parseError) {
            // Data is corrupted, clear it
            clearClanData();
            return {
                status: 'error',
                message: 'Cached data is corrupted. Please upload your export again.'
            };
        }

        // Validate timestamp
        // Try to get timestamp from storage first, fall back to parsed data
        const timestamp = storedTimestamp
            ? Number(storedTimestamp)
            : parsedData.timestamp;

        const timestampValidation = validateTimestamp(timestamp);
        if (!timestampValidation.valid) {
            // Invalid timestamp, clear corrupted data
            clearClanData();
            return {
                status: 'error',
                message: `Invalid timestamp in cached data: ${timestampValidation.error}. Please upload a fresh export.`
            };
        }

        // Check if data has expired (>24 hours old)
        const expiryCheck = isDataExpired(Number(timestamp));

        if (expiryCheck.expired) {
            return {
                status: 'expired',
                message: `Your cached data is ${expiryCheck.ageHours} hours old. Please upload a fresh export (less than 24 hours old).`,
                timestamp: Number(timestamp),
                ageHours: expiryCheck.ageHours
            };
        }

        // Data is valid and not expired
        return {
            status: 'valid',
            message: `Loaded cached data (${expiryCheck.ageHours} hours old)`,
            data: parsedData,
            timestamp: Number(timestamp),
            ageHours: expiryCheck.ageHours
        };

    } catch (error) {
        console.error('Error loading clan data:', error);
        return {
            status: 'error',
            message: `Failed to load cached data: ${error.message}`
        };
    }
}

/**
 * Clear all cached Clash of Clans data from localStorage
 * @returns {{success: boolean, message: string}} Clear result
 */
function clearClanData() {
    if (!isLocalStorageAvailable()) {
        return {
            success: false,
            message: 'localStorage is not available'
        };
    }

    try {
        localStorage.removeItem(CACHE_KEYS.CLAN_DATA);
        localStorage.removeItem(CACHE_KEYS.TIMESTAMP);
        localStorage.removeItem(CACHE_KEYS.METADATA);

        return {
            success: true,
            message: 'Cache cleared successfully'
        };
    } catch (error) {
        console.error('Error clearing clan data:', error);
        return {
            success: false,
            message: `Failed to clear cache: ${error.message}`
        };
    }
}

/**
 * Get cache metadata for debugging and information display
 * @returns {{exists: boolean, metadata?: object}} Cache metadata
 */
function getCacheMetadata() {
    if (!isLocalStorageAvailable()) {
        return { exists: false };
    }

    const metadata = localStorage.getItem(CACHE_KEYS.METADATA);
    if (!metadata) {
        return { exists: false };
    }

    try {
        return {
            exists: true,
            metadata: JSON.parse(metadata)
        };
    } catch {
        return { exists: false };
    }
}

// Export functions for use in other modules
// Using both module.exports (CommonJS) and window global (browser) for compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        saveClanData,
        loadClanData,
        clearClanData,
        getCacheMetadata,
        isDataExpired,
        validateTimestamp,
        CACHE_CONFIG
    };
}

// Also expose to window for direct browser use
if (typeof window !== 'undefined') {
    window.CacheManager = {
        saveClanData,
        loadClanData,
        clearClanData,
        getCacheMetadata,
        isDataExpired,
        validateTimestamp,
        CACHE_CONFIG
    };
}
