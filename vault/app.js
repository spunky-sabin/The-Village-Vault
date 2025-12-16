/**
 * The Village Vault - Main Application
 * Consolidated from all HTML files and scripts
 * Features: Card flip animations, detailed item info, enhanced filtering
 */

// ============================================
// STATE MANAGEMENT
// Global in-memory state for items, filters, and view options
// ============================================
const state = {
    allItems: {},
    items: [],
    userOwnedCodes: new Set(),
    hasUserData: false,
    activeCategory: 'cosmetic-compendium',
    searchQuery: '',
    selectedHeroes: [],
    selectedOwnership: [],
    selectedTypes: [],
    sortBy: 'newest',
    visibleLimit: 50,
    rarityData: null // Store community rarity stats here
};

// ============================================
// UTILITY FUNCTIONS
// ============================================
let imageObserver = null;

// Debounce helper to delay execution until user stops typing/scrolling
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Initialize IntersectionObserver used to lazy-load grid images
function initImageObserver() {
    if ('IntersectionObserver' in window) {
        imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (img.dataset.src && !img.src) {
                        img.src = img.dataset.src;
                        img.onload = () => img.classList.add('loaded');
                        img.onerror = () => {
                            console.warn('Image failed to load:', img.dataset.src);
                            img.style.display = 'none';
                        };
                    }
                    imageObserver.unobserve(img);
                }
            });
        }, { rootMargin: '100px' });
    } else {
        console.warn('IntersectionObserver not supported, falling back to immediate loading');
    }
}

// Load a JSON file from the data-json folder (or a full path if given)
// Use root-relative paths so it works from both / and /vault/
async function loadJSON(url) {
    try {
        const fullPath = url.startsWith('/') || url.startsWith('http')
            ? url
            : `/src/data-json/${url}`;
        const res = await fetch(fullPath);
        if (!res.ok) throw new Error("HTTP Error " + res.status);
        return await res.json();
    } catch (err) {
        console.error("Error loading", url, err);
        return null;
    }
}

// Generate a URL-friendly slug from an item name (fallback to code)
function generateSlug(name, code = '') {
    if (!name) return 'unknown';

    let slug = name
        .toLowerCase()
        .trim()
        // Replace spaces and underscores with hyphens
        .replace(/[\s_]+/g, '-')
        // Remove special characters except hyphens
        .replace(/[^a-z0-9-]/g, '')
        // Remove multiple consecutive hyphens
        .replace(/-+/g, '-')
        // Remove leading/trailing hyphens
        .replace(/^-+|-+$/g, '');

    // If slug is empty or too short, use code as fallback
    if (!slug || slug.length < 2) {
        slug = code ? `item-${code}` : 'unknown';
    }

    return slug;
}

// Normalize raw data for any item type into a common object shape
function formatItem(item, type, category, heroName = null, heroId = null, details = null) {
    const name = item.name || item.skin_name || "Unknown Item";
    const code = String(item._id || item.Code || item.code);

    // Normalize image path to root-relative if it starts with src/ or images/
    // static_data.json might presumably use just names, so we might need to infer image paths match logic or if they are missing
    // For now we assume image property exists or we don't have images.
    // If static_data.json doesn't have image paths, we might need a logical mapper.
    // Looking at static_data, there is NO distinct image path field in the snippets saw.
    // Assuming standard naming convention or existence of 'image' field if present.
    // The previous json files HAD 'image' or 'image_path'.
    // If static_data.json lacks this we'll have broken images.
    // checking... the snippets showed 'name', 'TID', 'village', 'levels'. No 'image'.
    // However, the user asked to use THIS file. I'll proceed.

    let imagePath = item.image || item.image_path || "";
    if (imagePath && (imagePath.startsWith('src/') || imagePath.startsWith('images/'))) {
        imagePath = '/' + imagePath;
    }
    // Fallback: try to construct image path from name if missing?
    // The current app uses specific paths. 
    // Let's rely on item properties for now.

    return {
        code,
        name,
        image: imagePath,
        rarity: item.rarity || "unknown", // static_data skins have 'tier' which is like rarity
        category,
        type,
        owned: false,
        description: item.info || item.description || "",
        released: item.released || "Unknown",
        availability: item.availability || "",
        slug: generateSlug(name, code),
        ...(heroName && { heroName }),
        ...(heroId && { heroId })
    };
}

// Preload a subset of item images to make the initial grid feel snappier
async function preloadImages(items, maxImages = 100) {
    const itemsToPreload = items.slice(0, maxImages);

    const promises = itemsToPreload.map(item => {
        return new Promise(resolve => {
            if (!item.image) return resolve();

            const img = new Image();
            img.src = item.image;
            img.onload = resolve;
            img.onerror = () => {
                // console.warn('Image failed to preload:', img.src);
                resolve();
            };

            setTimeout(resolve, 5000);
        });
    });

    return Promise.all(promises);
}

// Load all master data from individual JSON files
async function loadAllMasterData() {
    try {
        const [decorations, obstacles, sceneries, heroesData, itemDetails] = await Promise.all([
            loadJSON("decorations.json"),
            loadJSON("obstacles.json"),
            loadJSON("sceneries.json"),
            loadJSON("heros.json"),
            loadJSON("item-details.json")
        ]);

        if (!decorations || !obstacles || !sceneries || !heroesData) {
            console.error("Failed to load one or more data files");
            return;
        }

        // Helper to find details
        const findDetails = (code) => {
            if (!itemDetails) return null;
            // Search in all categories of itemDetails
            for (const key in itemDetails) {
                const found = itemDetails[key].find(d => String(d.code) === String(code));
                if (found) return found;
            }
            return null;
        };

        // Process Decorations
        const formattedDecorations = (decorations || []).map(item => {
            const details = findDetails(item.Code || item.code);
            const enriched = { ...item, ...details };
            return formatItem(enriched, "decoration", "Decoration");
        });

        // Process Obstacles
        const formattedObstacles = (obstacles || []).map(item => {
            const details = findDetails(item.Code || item.code);
            const enriched = { ...item, ...details };
            return formatItem(enriched, "obstacle", "Obstacle");
        });

        // Process Sceneries
        const formattedSceneries = (sceneries || []).map(item => {
            const details = findDetails(item.Code || item.code);
            const enriched = { ...item, ...details };
            return formatItem(enriched, "scenery", "Scenery");
        });

        // Process Hero Skins
        // heros.json structure: { heroes: [ { name, skins: [] } ] }
        let formattedHeroSkins = [];
        if (heroesData && heroesData.heroes) {
            heroesData.heroes.forEach(hero => {
                const heroName = hero.name;
                const heroId = heroName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

                if (hero.skins) {
                    hero.skins.forEach(skin => {
                        const details = findDetails(skin.code);
                        const enriched = { ...skin, ...details };
                        formattedHeroSkins.push(formatItem(enriched, "heroskin", "Hero Skin", heroName, heroId));
                    });
                }
            });
        }

        // Clan Capital - Not present in old files, leaving empty or relying on static_data if needed?
        // User asked to use "old data", so we omit new data sources.
        const formattedClanCapital = [];

        state.allItems = {
            'cosmetic-compendium': [...formattedDecorations, ...formattedObstacles, ...formattedHeroSkins, ...formattedSceneries],
            'hero-wardrobe': formattedHeroSkins,
            'home-village-decor': [...formattedDecorations, ...formattedObstacles],
            'sceneries': formattedSceneries,
            'clan-hall-aesthetics': []
        };

        state.items = state.allItems['cosmetic-compendium'];

        console.log("Master data loaded from individual files:", {
            decorations: formattedDecorations.length,
            obstacles: formattedObstacles.length,
            heroSkins: formattedHeroSkins.length,
            sceneries: formattedSceneries.length
        });

        await preloadImages(state.items, 50);

    } catch (err) {
        console.error("Error loading master data:", err);
    }
}

// ============================================
// JSON PARSER
// Pull all numeric "codes" from an arbitrary JSON structure
// ============================================
function extractCodesFromJSON(obj) {
    const codes = new Set();

    function walk(v) {
        if (Array.isArray(v)) {
            v.forEach(item => {
                if (typeof item === "number") {
                    codes.add(String(item));
                } else if (item && typeof item === "object") {
                    walk(item);
                }
            });
        } else if (v && typeof v === "object") {
            if ("data" in v && typeof v.data === "number") {
                codes.add(String(v.data));
            }
            if ("code" in v && (typeof v.code === "string" || typeof v.code === "number")) {
                codes.add(String(v.code));
            }
            Object.values(v).forEach(walk);
        }
    }

    walk(obj);
    return [...codes];
}

// Parse pasted user JSON, derive owned item codes and mark items as owned
function parseUserData(jsonString) {
    try {
        const parsed = JSON.parse(jsonString);
        const codes = extractCodesFromJSON(parsed);

        state.userOwnedCodes = new Set(codes);
        sessionStorage.setItem('userCollectionData', jsonString);

        Object.keys(state.allItems).forEach(categoryId => {
            state.allItems[categoryId] = state.allItems[categoryId].map(item => ({
                ...item,
                owned: state.userOwnedCodes.has(item.code)
            }));
        });

        state.items = state.items.map(item => ({
            ...item,
            owned: state.userOwnedCodes.has(item.code)
        }));

        state.hasUserData = true;

        // Trigger background analysis
        analyzeCollection(codes);

        return { success: true, message: `Matched ${codes.length} unique codes.` };
    } catch (err) {
        console.error("Parse error:", err);
        return { success: false, message: "Invalid JSON. Check formatting." };
    }
}

// ============================================
// ANALYTICS & RARITY
// ============================================

function getClientId() {
    let id = localStorage.getItem('village_vault_id');
    if (!id) {
        // Simple UUID fallback if crypto.randomUUID is not available
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            id = crypto.randomUUID();
        } else {
            id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }
        localStorage.setItem('village_vault_id', id);
    }
    return id;
}

async function analyzeCollection(ownedCodes) {
    try {
        const clientId = getClientId();
        const res = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, ownedCodes })
        });

        if (!res.ok) throw new Error("Analysis failed");

        const data = await res.json();
        if (data.rarityData) {
            state.rarityData = data.rarityData;

            // Enrich items with community rarity
            Object.keys(state.allItems).forEach(cat => {
                state.allItems[cat].forEach(item => {
                    const r = state.rarityData[item.code];
                    if (r) {
                        item.communityRarity = r;
                    }
                });
            });

            // Update UI to show new badges
            updateUI();
            showToast("Rarity data updated from community stats!");
        }
    } catch (err) {
        console.error("Analytics error:", err);
        // Fail silently or show minor toast
    }
}

function showToast(msg) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);

    // Add toast styles if missing (simple fallback)
    toast.style.cssText = `
        background: #333;
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        margin-top: 10px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        animation: fadeIn 0.3s ease;
    `;

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============================================
// URL ROUTING SYSTEM
// Keeps item detail views in sync with clean /vault/... URLs
// ============================================
const Router = {
    // Map item type to URL prefix used in paths
    typeToPrefix: {
        'heroskin': 'skins',
        'scenery': 'sceneries',
        'obstacle': 'obstacles',
        'decoration': 'decorations',
        'clan': 'clan-items'
    },

    // Reverse map from URL prefix back to internal type
    prefixToType: {
        'skins': 'heroskin',
        'sceneries': 'scenery',
        'obstacles': 'obstacle',
        'decorations': 'decoration',
        'clan-items': 'clan'
    },

    // Push a new URL for an item and render its detail overlay
    navigateToItem(item) {
        const prefix = this.typeToPrefix[item.type] || 'items';
        const url = `/vault/${prefix}/${item.slug}`;

        // Update browser URL without reloading page
        history.pushState({ item }, '', url);

        // Update page title
        document.title = `${item.name} - The Village Vault`;

        // Show detail view
        renderDetailView(item);
    },

    // Navigate back to the grid view and restore title
    navigateToGrid() {
        history.pushState({}, '', '/vault/');
        document.title = 'The Village Vault | Clash of Clans Item Tracker';
        hideDetailView();
    },

    // Parse current /vault/... URL into { type, slug }
    parseCurrentURL() {
        const path = window.location.pathname;
        const match = path.match(/\/vault\/(skins|sceneries|obstacles|decorations|clan-items)\/([^/]+)/);

        if (match) {
            return {
                prefix: match[1],
                slug: match[2],
                type: this.prefixToType[match[1]]
            };
        }
        return null;
    },

    // Find a specific item by its type + slug across all categories
    findItemBySlug(type, slug) {
        // Search through all items in all categories
        for (const categoryId in state.allItems) {
            const items = state.allItems[categoryId];
            const found = items.find(item => item.type === type && item.slug === slug);
            if (found) return found;
        }
        return null;
    },

    // Restore either grid or item detail when user uses back/forward
    handlePopState(event) {
        if (event.state && event.state.item) {
            // User navigated to an item
            renderDetailView(event.state.item);
            document.title = `${event.state.item.name} - The Village Vault`;
        } else {
            // User navigated back to grid
            hideDetailView();
            document.title = 'The Village Vault | Clash of Clans Item Tracker';
        }
    },

    // Initialize routing once data is ready
    init() {
        // Check if URL contains an item route
        const urlData = this.parseCurrentURL();
        if (urlData) {
            const item = this.findItemBySlug(urlData.type, urlData.slug);
            if (item) {
                renderDetailView(item);
                document.title = `${item.name} - The Village Vault`;
            } else {
                // Item not found, redirect to main page
                console.warn('Item not found for URL:', window.location.pathname);
                window.location.href = '/vault/';
            }
        }

        // Listen for browser back/forward navigation
        window.addEventListener('popstate', (e) => this.handlePopState(e));
    }
};


// ============================================
// FILTERING & SORTING
// Helpers to update state.* filter fields and derive filtered lists
// ============================================
function filterByType(type) {
    if (type === 'all') {
        state.selectedTypes = [];
    } else {
        state.selectedTypes = [type];
    }
    updateUI();
}

// Toggle a hero in the selectedHeroes filter list
function filterByHero(heroId) {
    if (state.selectedHeroes.includes(heroId)) {
        state.selectedHeroes = state.selectedHeroes.filter(h => h !== heroId);
    } else {
        state.selectedHeroes = [...state.selectedHeroes, heroId];
    }
    updateUI();
}

// Change active top-level category (tabs) and reset relevant filters
function switchCategory(categoryId) {
    state.activeCategory = categoryId;
    state.items = state.allItems[categoryId] || [];
    state.visibleLimit = 50;

    if (state.hasUserData) {
        state.items = state.items.map(item => ({
            ...item,
            owned: state.userOwnedCodes.has(item.code)
        }));
    }

    if (categoryId !== 'hero-wardrobe') {
        state.selectedHeroes = [];
    }

    state.selectedTypes = [];
    updateTypeFilterUI(categoryId);
    state.searchQuery = '';
    updateUI();
}

// Rebuild the type filter buttons for the current category (desktop + mobile)
function updateTypeFilterUI(categoryId) {
    const typeFilterOptions = document.getElementById('type-filter-options');
    const mobileTypeFilterOptions = document.getElementById('mobile-type-filter-options');

    const filterConfigs = {
        'cosmetic-compendium': [
            { value: 'all', label: 'All Items' },
            { value: 'heroskin', label: 'Hero Skins' },
            { value: 'scenery', label: 'Sceneries' },
            { value: 'obstacle', label: 'Obstacles' },
            { value: 'decoration', label: 'Decorations' },
            { value: 'clan', label: 'Clan House Parts' }
        ],
        'hero-wardrobe': [
            { value: 'heroskin', label: 'Hero Skins', disabled: true }
        ],
        'clan-hall-aesthetics': [
            { value: 'clan', label: 'Clan Items', disabled: true }
        ],
        'home-village-decor': [
            { value: 'all', label: 'All Items' },
            { value: 'decoration', label: 'Decorations' },
            { value: 'obstacle', label: 'Obstacles' }

        ]
    };

    const filters = filterConfigs[categoryId] || [];
    const filterHTML = filters.map((f, i) =>
        `<button class="filter-btn ${i === 0 ? 'active' : ''}" data-type-filter="${f.value}" ${f.disabled ? 'disabled style="opacity: 0.7; cursor: not-allowed;"' : ''}>${f.label}</button>`
    ).join('');

    if (typeFilterOptions) typeFilterOptions.innerHTML = filterHTML;
    if (mobileTypeFilterOptions) mobileTypeFilterOptions.innerHTML = filterHTML;

    attachTypeFilterListeners();
}

// Toggle ownership filter between owned / missing / all
function filterByOwnership(ownership) {
    if (state.selectedOwnership.includes(ownership)) {
        state.selectedOwnership = [];
    } else {
        state.selectedOwnership = [ownership];
    }
    updateUI();
}

// Apply search, type, hero, ownership filters and sorting to current items
function getFilteredItems() {
    let filtered = state.items.filter(item => {
        const matchSearch = item.name.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
            (item.code && item.code.toString().includes(state.searchQuery));

        const matchType = state.selectedTypes.length === 0 || state.selectedTypes.includes(item.type);

        const matchHero = state.activeCategory !== 'hero-wardrobe' ||
            state.selectedHeroes.length === 0 ||
            (item.heroId && state.selectedHeroes.includes(item.heroId));

        const matchOwnership =
            state.selectedOwnership.length === 0 ||
            (state.selectedOwnership.includes("owned") && item.owned) ||
            (state.selectedOwnership.includes("missing") && !item.owned);

        return matchSearch && matchType && matchHero && matchOwnership;
    });

    switch (state.sortBy) {
        case "oldest": filtered.sort((a, b) => a.code - b.code); break;
        case "name-asc": filtered.sort((a, b) => a.name.localeCompare(b.name)); break;
        case "name-desc": filtered.sort((a, b) => b.name.localeCompare(a.name)); break;
        case "newest":
        default: filtered.sort((a, b) => b.code - a.code);
    }
    return filtered;
}



// ============================================
// RENDERING UI
// Build item cards and progress components based on current state
// ============================================
const TYPE_LABELS = {
    'decoration': 'Decoration',
    'obstacle': 'Obstacle',
    'heroskin': 'Hero Skin',
    'scenery': 'Scenery',
    'clan': 'Clan Item'
};

function getTypeBadgeText(type, category) {
    return TYPE_LABELS[type] || category;
}

// Create a single item card DOM node (front + back) with routing hooks
function createItemCard(item) {
    const container = document.createElement("div");
    container.className = "item-card-container";

    const card = document.createElement("div");
    card.className = `item-card rarity-${item.rarity} type-${item.type}`;
    if (state.hasUserData && !item.owned) card.classList.add("grayscale");

    const typeBadgeText = getTypeBadgeText(item.type, item.category);

    const ownershipBadge = state.hasUserData ? `
        <div class="item-status-badge ${item.owned ? 'owned' : 'missing'}" title="${item.owned ? 'Owned' : 'Missing'}">
            ${item.owned ? '✓' : '✕'}
        </div>
    ` : '';

    const frontHTML = `
        <div class="item-card-front">
            ${ownershipBadge}
            <div class="item-type-badge ${item.type}">
                ${typeBadgeText}
            </div>
            <div class="item-image-container">
                <img src="${item.image}" class="item-image" loading="lazy" alt="${item.name}" width="100%" height="auto" style="display: block;">
            </div>
            <div class="item-info">
                <h3>${item.name}</h3>
                ${item.communityRarity ? `
                <div class="community-rarity-tag" style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">
                    ${item.communityRarity.label} (${item.communityRarity.percentage}%)
                </div>
                ` : ''}
            </div>
        </div>
    `;

    const backHTML = `
        <div class="item-card-back">
            <button class="item-close-btn" aria-label="Close details" onclick="event.stopPropagation(); this.closest('.item-card').classList.remove('flipped');">×</button>
            <div class="item-details">
                ${state.hasUserData && !item.owned ? '<div class="missing-indicator">✕</div>' : ''}
                <h3>${item.name}</h3>
                
                <div class="item-details-section">
                    <div class="item-details-label">Type</div>
                    <div class="item-details-value">${typeBadgeText}</div>
                </div>
                
                <div class="item-details-section">
                    <div class="item-details-label">Description</div>
                    <div class="item-details-value">${item.description || 'No description available.'}</div>
                </div>
                
                <div class="item-details-section">
                    <div class="item-details-label">Released</div>
                    <div class="item-details-value">${item.released || 'Unknown'}</div>
                </div>
                
                <div class="item-details-section">
                    <div class="item-details-label">Availability</div>
                    <div class="item-details-value">${item.availability || 'Unknown'}</div>
                </div>
                
                ${item.heroName ? `
                    <div class="item-details-section">
                        <div class="item-details-label">Hero</div>
                        <div class="item-details-value">${item.heroName}</div>
                    </div>
                ` : ''}
            </div>
        </div>
    `;

    card.innerHTML = frontHTML + backHTML;

    const imgEl = card.querySelector('.item-image');
    if (imgEl) {
        imgEl.onload = () => imgEl.classList.add('loaded');
        imgEl.onerror = () => {
            console.warn('Image failed to load:', imgEl.src);
            imgEl.style.opacity = '0.5';
        };
    }

    // Add data attribute for slug
    card.dataset.slug = item.slug;
    card.dataset.type = item.type;

    card.addEventListener('click', (e) => {
        if (!e.target.closest('.item-close-btn')) {
            // Navigate to item detail page with clean URL
            Router.navigateToItem(item);
        }
    });

    container.appendChild(card);
    return container;
}

// Render the main grid with infinite scroll (auto-load on scroll)
function renderItems() {
    const list = document.getElementById("items-grid");
    const msg = document.getElementById("no-items-message");
    const count = document.getElementById("items-count");

    const items = getFilteredItems();
    const visibleItems = items.slice(0, state.visibleLimit);

    list.innerHTML = "";
    count.textContent = items.length;

    if (!items.length) {
        msg.style.display = "block";
        return;
    }
    msg.style.display = "none";

    const fragment = document.createDocumentFragment();
    visibleItems.forEach(i => fragment.appendChild(createItemCard(i)));
    list.appendChild(fragment);

    // Add sentinel element at the end for infinite scroll detection
    if (items.length > state.visibleLimit) {
        const sentinel = document.createElement('div');
        sentinel.id = "scroll-sentinel";
        sentinel.style.height = "1px";
        list.appendChild(sentinel);

        // Observe sentinel for infinite scroll
        if ('IntersectionObserver' in window) {
            const scrollObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        state.visibleLimit += 50;
                        renderItems();
                    }
                });
            }, { rootMargin: '200px' });

            scrollObserver.observe(sentinel);
        }
    }
}

// Update the per-category progress bar above the grid
function updateProgressTracker() {
    const el = document.getElementById("progress-tracker");
    if (!state.hasUserData) {
        el.style.display = "none";
        return;
    }

    let categoryItems = state.allItems[state.activeCategory] || [];

    if (state.selectedTypes.length > 0) {
        categoryItems = categoryItems.filter(item => state.selectedTypes.includes(item.type));
    }

    if (state.activeCategory === 'hero-wardrobe' && state.selectedHeroes.length > 0) {
        categoryItems = categoryItems.filter(item => item.heroId && state.selectedHeroes.includes(item.heroId));
    }

    const owned = categoryItems.filter(i => i.owned).length;
    const total = categoryItems.length;
    const pct = total > 0 ? Math.round((owned / total) * 100) : 0;

    el.style.display = "block";
    el.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <span style="font-size: 0.9rem; font-weight: 600;">${owned}/${total} items collected</span>
            <span style="font-size: 1.1rem; font-weight: 700; color: var(--gold);">${pct}%</span>
        </div>
        <div class="progress-bar" style="height: 8px; background: var(--border); border-radius: 4px; overflow: hidden;">
            <div class="progress-fill" style="width: ${pct}%; height: 100%; background: linear-gradient(90deg, var(--gold), var(--gold-light)); transition: width 0.3s ease;"></div>
        </div>
    `;
}

// ============================================
// DETAIL VIEW RENDERING
// Full-screen overlay with rich details for a single item
// ============================================
function renderDetailView(item) {
    // Get or create detail view container
    let detailView = document.getElementById('item-detail-view');
    if (!detailView) {
        detailView = document.createElement('div');
        detailView.id = 'item-detail-view';
        detailView.className = 'detail-view-overlay';
        document.body.appendChild(detailView);
    }

    const typeBadgeText = getTypeBadgeText(item.type, item.category);

    const ownershipBadge = state.hasUserData ? `
        <div class="detail-status-badge ${item.owned ? 'owned' : 'missing'}" title="${item.owned ? 'Owned' : 'Missing'}">
            ${item.owned ? '✓' : '✕'}
        </div>
    ` : '';

    // Render detail view content
    detailView.innerHTML = `
        <div class="detail-view-backdrop" onclick="Router.navigateToGrid()"></div>
        <div class="detail-view-content">
            <button class="detail-close-btn" onclick="Router.navigateToGrid()" aria-label="Close detail view">
                <svg viewBox="0 0 24 24" width="24" height="24">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
            </button>
            
            <div class="detail-view-grid">
                <div class="detail-image-section">
                    <div class="detail-image-container rarity-${item.rarity}">
                        ${ownershipBadge}
                        <img src="${item.image}" alt="${item.name}" class="detail-image" loading="eager">
                    </div>
                </div>
                
                <div class="detail-info-section">
                    <div class="detail-type-badge ${item.type}">${typeBadgeText}</div>
                    <h1 class="detail-title">${item.name}</h1>
                    
                    <div class="detail-metadata">
                        ${item.heroName ? `
                            <div class="detail-meta-item">
                                <span class="detail-meta-label">Hero</span>
                                <span class="detail-meta-value">${item.heroName}</span>
                            </div>
                        ` : ''}
                        
                        <div class="detail-meta-item">
                            <span class="detail-meta-value rarity-${item.rarity}">${item.rarity}</span>
                        </div>

                        ${item.communityRarity ? `
                        <div class="detail-meta-item">
                            <span class="detail-meta-label">Community Rarity</span>
                            <span class="detail-meta-value" style="color: var(--gold);">${item.communityRarity.label} (${item.communityRarity.percentage}%)</span>
                        </div>
                        ` : ''}
                        
                        <div class="detail-meta-item">
                            <span class="detail-meta-label">Released</span>
                            <span class="detail-meta-value">${item.released || 'Unknown'}</span>
                        </div>
                        
                        <div class="detail-meta-item">
                            <span class="detail-meta-label">Availability</span>
                            <span class="detail-meta-value">${item.availability || 'Unknown'}</span>
                        </div>
                    </div>
                    
                    <div class="detail-description">
                        <h3>Description</h3>
                        <p>${item.description || 'No description available.'}</p>
                    </div>
                    
                    <div class="detail-url-share">
                        <label>Share this item:</label>
                        <div class="url-copy-container">
                            <input type="text" readonly value="${window.location.href}" class="url-input" id="share-url-input">
                            <button class="copy-url-btn" onclick="copyShareURL()" aria-label="Copy URL">
                                <svg viewBox="0 0 24 24" width="20" height="20">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke="currentColor" stroke-width="2" fill="none"/>
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="2" fill="none"/>
                                </svg>
                                Copy
                            </button>
                        </div>
                    </div>
                </div>
                ${state.hasUserData && !item.owned ? '<div class="missing-indicator">✕</div>' : ''}
            </div>
        </div>
    `;

    // Show the detail view
    detailView.classList.add('visible');
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
}

// Hide the detail overlay and restore page scroll
function hideDetailView() {
    const detailView = document.getElementById('item-detail-view');
    if (detailView) {
        detailView.classList.remove('visible');
        document.body.style.overflow = ''; // Restore scrolling
    }
}

// Copy the current item URL from the detail view to the clipboard
function copyShareURL() {
    const input = document.getElementById('share-url-input');
    if (input) {
        input.select();
        input.setSelectionRange(0, 99999); // For mobile devices

        navigator.clipboard.writeText(input.value).then(() => {
            showToast('Copied!', 'URL copied to clipboard', 'success');
        }).catch(err => {
            console.error('Failed to copy:', err);
            showToast('Error', 'Failed to copy URL', 'error');
        });
    }
}


// Re-render grid, progress, and hero filter visibility after any state change
function updateUI() {
    renderItems();
    updateProgressTracker();

    const heroFilterGroup = document.getElementById('hero-filter-group');
    const mobileHeroFilterGroup = document.getElementById('mobile-hero-filter-group');
    const isHeroWardrobe = state.activeCategory === 'hero-wardrobe';

    if (heroFilterGroup) {
        heroFilterGroup.style.display = isHeroWardrobe ? 'block' : 'none';
    }
    if (mobileHeroFilterGroup) {
        mobileHeroFilterGroup.style.display = isHeroWardrobe ? 'block' : 'none';
    }
}

// ============================================
// EVENT HANDLING
// Upload / clear actions and DOM wiring helpers
// ============================================
// Handle JSON paste submission from the upload modal
function handleDataUpload() {
    const input = document.getElementById("json-input").value.trim();
    if (!input) {
        showToast("Error", "Please paste your JSON!", "error");
        return;
    }

    const result = parseUserData(input);
    if (result.success) {
        showToast("Success!", result.message);
        closeModal("upload-modal");
        document.getElementById("clear-data-btn").style.display = "block";
        updateUI();
    } else {
        showToast("Invalid JSON", result.message, "error");
    }
}

// Clear user-owned data and reset all items to unowned
function handleDataClear() {
    state.userOwnedCodes = new Set();
    Object.keys(state.allItems).forEach(categoryId => {
        state.allItems[categoryId] = state.allItems[categoryId].map(i => ({ ...i, owned: false }));
    });
    state.items = state.items.map(i => ({ ...i, owned: false }));
    state.hasUserData = false;
    sessionStorage.removeItem('userCollectionData');
    document.getElementById("clear-data-btn").style.display = "none";
    updateUI();
    showToast("Cleared", "Your data has been reset.");
}

// Handle paste from clipboard and analyze directly
async function handlePasteFromClipboard() {
    // Detect mobile device
    const isMobile = navigator.userAgent.match(/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i);
    const isSecureContext = location.protocol === 'https:' || location.hostname === 'localhost';

    // Try modern clipboard API first (works on mobile with HTTPS)
    if (navigator.clipboard && navigator.clipboard.readText) {
        try {
            // Check if we're in a secure context (required for clipboard API)
            if (!isSecureContext) {
                if (isMobile) {
                    showToast("Mobile HTTPS Required", "Automatic paste requires HTTPS. Please use manual paste.", "error");
                } else {
                    showToast("HTTPS Required", "Automatic paste requires secure connection. Please use manual paste.", "error");
                }
                // Continue to fallback methods instead of throwing error
                return;
            }

            let clipboardText = '';

            // Request clipboard permission explicitly for mobile
            if (navigator.permissions && navigator.permissions.query) {
                const permission = await navigator.permissions.query({ name: 'clipboard-read' });
                if (permission.state === 'denied') {
                    throw new Error('Clipboard permission denied by user');
                }
                if (permission.state === 'prompt') {
                    showToast("Permission Required", "Please allow clipboard access when prompted", "error");
                    clipboardText = await navigator.clipboard.readText();
                } else {
                    clipboardText = await navigator.clipboard.readText();
                }
            } else {
                clipboardText = await navigator.clipboard.readText();
            }

            // Ninja-inspired flexible parsing
            if (!clipboardText.trim()) {
                showToast("Error", "Clipboard is empty!", "error");
                return;
            }

            // Check if it looks like JSON (Ninja-style validation)
            if (!clipboardText.trim().startsWith('{') && !clipboardText.trim().startsWith('[')) {
                // Manual prompt fallback like Ninja
                const manualInput = prompt('Raw JSON not detected - paste your collection data manually:');
                if (manualInput) {
                    clipboardText = manualInput;
                } else {
                    showToast("Error", "No data provided", "error");
                    return;
                }
            }

            // Try to clean up common clipboard issues (Ninja-style resilience)
            let cleanedText = clipboardText.trim();

            // Remove common clipboard artifacts
            cleanedText = cleanedText.replace(/[\u200B-\u200D\uFEFF]/g, ''); // Remove zero-width chars
            cleanedText = cleanedText.replace(/^[^{[]*\s*/, ''); // Remove leading non-JSON
            cleanedText = cleanedText.replace(/\s*[^}\]]*$/, ''); // Remove trailing non-JSON

            // Try to extract JSON if embedded in other text
            const jsonMatch = cleanedText.match(/(\{[\s\S]*\})|(\[[\s\S]*\])/);
            if (jsonMatch) {
                cleanedText = jsonMatch[0];
            }

            const result = parseUserData(cleanedText);
            if (result.success) {
                showToast("Success!", result.message);
                document.getElementById("clear-data-btn").style.display = "block";
                updateUI();
            } else {
                // Fallback to manual prompt like Ninja
                const manualInput = prompt('Invalid JSON detected - paste your collection data manually:');
                if (manualInput) {
                    const retryResult = parseUserData(manualInput);
                    if (retryResult.success) {
                        showToast("Success!", retryResult.message);
                        document.getElementById("clear-data-btn").style.display = "block";
                        updateUI();
                    } else {
                        showToast("Invalid JSON", retryResult.message, "error");
                    }
                } else {
                    showToast("Invalid JSON", result.message, "error");
                }
            }
            return;
        } catch (err) {
            console.error("Clipboard API error:", err);

            // Provide specific mobile error messages
            if (isMobile) {
                if (err.message.includes('HTTPS required')) {
                    showToast("Mobile Error", "HTTPS required for automatic paste. Please use manual paste.", "error");
                } else if (err.message.includes('permission denied')) {
                    showToast("Mobile Error", "Clipboard access denied. Please use manual paste.", "error");
                } else if (err.message.includes('NotAllowedError')) {
                    showToast("Mobile Error", "Clipboard access not allowed. Please use manual paste.", "error");
                } else {
                    showToast("Mobile Error", "Clipboard not accessible. Please use manual paste.", "error");
                }
            } else {
                showToast("Clipboard Error", "Unable to access clipboard. Please use manual paste.", "error");
            }
            // Continue to fallback methods
        }
    } else if (isMobile) {
        showToast("Mobile Error", "Clipboard API not supported. Please use manual paste.", "error");
    }

    // Fallback 1: Try to trigger paste event on a hidden input
    try {
        const hiddenInput = document.createElement('input');
        hiddenInput.style.position = 'absolute';
        hiddenInput.style.left = '-9999px';
        hiddenInput.style.top = '-9999px';
        document.body.appendChild(hiddenInput);
        hiddenInput.focus();

        // Try to get clipboard data through execCommand (legacy method)
        const pasted = document.execCommand('paste');
        if (pasted && hiddenInput.value) {
            const clipboardText = hiddenInput.value;
            document.body.removeChild(hiddenInput);

            const result = parseUserData(clipboardText);
            if (result.success) {
                showToast("Success!", result.message);
                document.getElementById("clear-data-btn").style.display = "block";
                updateUI();
            } else {
                showToast("Invalid JSON", result.message, "error");
            }
            return;
        }
        document.body.removeChild(hiddenInput);
    } catch (err) {
        console.error("Legacy paste error:", err);
        if (isMobile) {
            showToast("Mobile Error", "Legacy paste method failed. Please use manual paste.", "error");
        }
    }

    // Fallback 2: Open modal with focus and mobile-specific instructions
    openModal("upload-modal");
    setTimeout(() => {
        const textarea = document.getElementById("json-input");
        if (textarea) {
            textarea.focus();
            // On mobile, try to trigger the virtual keyboard
            if (isMobile) {
                textarea.click();
                showToast("Mobile Instructions", "Tap and hold in the text area, then select 'Paste'", "error");
            } else {
                showToast("Instructions", "Please paste your data in the text area below", "error");
            }
        }
    }, 100);
}

// Attach click handlers to all type filter buttons (desktop + mobile)
function attachTypeFilterListeners() {
    const typeFilterButtons = document.querySelectorAll('[data-type-filter]:not([disabled])');
    typeFilterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.getAttribute('data-type-filter');
            const parentGroup = btn.closest('.filter-options');
            parentGroup.querySelectorAll('[data-type-filter]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterByType(type);
        });
    });
}

// ============================================
// UTILITY FUNCTIONS (Modals & Notifications)
// Helpers for opening modals and showing toasts
// ============================================
// Show a modal by id
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
    }
}

// Hide a modal by id
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = "none";
    }
}

// Show a temporary toast notification in the bottom container
function showToast(title, message, type = "success") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("toast-fade-out");
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============================================
// INITIALIZE APP
// Wire up DOM events, load data, and restore any saved session state
// ============================================
document.addEventListener("DOMContentLoaded", async () => {
    initImageObserver();

    await loadAllMasterData();

    const userCollectionData = sessionStorage.getItem('userCollectionData');

    if (userCollectionData) {
        try {
            const parsed = JSON.parse(userCollectionData);
            const result = parseUserData(JSON.stringify(parsed));
            if (result.success) {
                document.getElementById("clear-data-btn").style.display = "block";
            }
        } catch (err) {
            console.error("Error loading session collection data:", err);
        }
    }

    updateUI();

    // Initialize URL routing system
    Router.init();

    const categoryTabs = document.querySelectorAll('.category-tab');
    categoryTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const categoryId = tab.getAttribute('data-category');
            categoryTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            switchCategory(categoryId);
        });
    });

    const searchInput = document.getElementById("search-input");
    if (searchInput) {
        const debouncedSearch = debounce(e => {
            state.searchQuery = e.target.value;
            state.visibleLimit = 50;
            updateUI();
        }, 300);
        searchInput.addEventListener("input", debouncedSearch);
    }

    const sortSelect = document.getElementById("sort-select");
    if (sortSelect) {
        sortSelect.addEventListener("change", e => {
            state.sortBy = e.target.value;
            updateUI();
        });
    }

    attachTypeFilterListeners();

    const ownershipCheckboxes = document.querySelectorAll('.ownership-filter');
    ownershipCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', e => {
            const ownership = e.target.value;

            // If trying to filter by owned/missing without user data, prompt for JSON
            if (ownership !== 'all' && !state.hasUserData) {
                e.target.checked = false;
                showToast("No Data", "Please paste your JSON file first to use ownership filters", "error");
                openModal("upload-modal");
                return;
            }

            ownershipCheckboxes.forEach(cb => {
                if (cb !== e.target) cb.checked = false;
            });
            filterByOwnership(ownership);
        });
    });

    const heroFilterCheckboxes = document.querySelectorAll('.hero-filter');
    heroFilterCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', e => {
            const heroId = e.target.value;
            filterByHero(heroId);
            const mobileCheckbox = document.querySelector(`.mobile-hero-filter[value="${heroId}"]`);
            if (mobileCheckbox) mobileCheckbox.checked = checkbox.checked;
        });
    });

    const mobileHeroFilterCheckboxes = document.querySelectorAll('.mobile-hero-filter');
    mobileHeroFilterCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', e => {
            const heroId = e.target.value;
            filterByHero(heroId);
            const desktopCheckbox = document.querySelector(`.hero-filter[value="${heroId}"]`);
            if (desktopCheckbox) desktopCheckbox.checked = checkbox.checked;
        });
    });

    const uploadBtn = document.getElementById("upload-btn");
    if (uploadBtn) {
        uploadBtn.setAttribute('aria-label', 'Upload your collection data');
        uploadBtn.addEventListener("click", () => openModal("upload-modal"));
    }

    const pasteBtn = document.getElementById("paste-btn");
    if (pasteBtn) {
        pasteBtn.setAttribute('aria-label', 'Paste your collection data from clipboard');
        pasteBtn.addEventListener("click", handlePasteFromClipboard);
    }

    const analyzeBtn = document.getElementById("analyze-btn");
    if (analyzeBtn) {
        analyzeBtn.addEventListener("click", handleDataUpload);
    }

    const clearDataBtn = document.getElementById("clear-data-btn");
    if (clearDataBtn) {
        clearDataBtn.setAttribute('aria-label', 'Clear your collection data');
        clearDataBtn.addEventListener("click", handleDataClear);
    }

    document.querySelectorAll(".modal-close-btn").forEach(btn => {
        btn.setAttribute('aria-label', 'Close modal');
        btn.addEventListener("click", () => {
            const modal = btn.closest(".modal");
            if (modal) modal.style.display = "none";
        });
    });

    document.querySelectorAll(".modal-overlay").forEach(overlay => {
        overlay.addEventListener("click", () => {
            const modal = overlay.closest(".modal");
            if (modal) modal.style.display = "none";
        });
    });

    document.querySelectorAll(".modal-cancel-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const modal = btn.closest(".modal");
            if (modal) modal.style.display = "none";
        });
    });

    const mobileFilterBtn = document.getElementById("mobile-filter-btn");
    if (mobileFilterBtn) {
        mobileFilterBtn.addEventListener("click", () => openModal("filter-modal"));
    }

    const applyFiltersBtn = document.getElementById("apply-filters-btn");
    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener("click", () => {
            closeModal("filter-modal");
        });
    }

    // Mobile quick ownership buttons
    document.querySelectorAll('.btn-mobile-filter-ownership').forEach(btn => {
        btn.addEventListener('click', () => {
            const ownership = btn.dataset.ownership;

            // If trying to filter by owned/missing without user data, prompt for JSON
            if (ownership !== 'all' && !state.hasUserData) {
                showToast("No Data", "Please paste your JSON file first to use ownership filters", "error");
                openModal("upload-modal");
                return;
            }

            state.selectedOwnership = ownership === 'all' ? [] : [ownership];

            // Make buttons mutually exclusive (add/remove active class)
            document.querySelectorAll('.btn-mobile-filter-ownership').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Sync with modal checkboxes if open
            document.querySelectorAll('.mobile-ownership-filter').forEach(cb => {
                cb.checked = (ownership !== 'all' && cb.value === ownership);
            });

            updateUI();
        });
    });


    const mobileSearchInput = document.getElementById("mobile-search-input");
    if (mobileSearchInput) {
        const debouncedMobileSearch = debounce(e => {
            state.searchQuery = e.target.value;
            state.visibleLimit = 50;
            const desktopSearch = document.getElementById("search-input");
            if (desktopSearch) desktopSearch.value = e.target.value;
            updateUI();
        }, 300);
        mobileSearchInput.addEventListener("input", debouncedMobileSearch);
    }

    const mobileSortSelect = document.getElementById("mobile-sort-select");
    if (mobileSortSelect) {
        mobileSortSelect.addEventListener("change", e => {
            state.sortBy = e.target.value;
            const desktopSort = document.getElementById("sort-select");
            if (desktopSort) desktopSort.value = e.target.value;
            updateUI();
        });
    }

    // Hide loading screen after everything is loaded
    const loadingScreen = document.getElementById("loading-screen");
    if (loadingScreen) {
        loadingScreen.style.display = "none";
    }

}

);