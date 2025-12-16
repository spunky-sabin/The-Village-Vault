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
    communityRarity: {},  // { itemCode: { percentage, count, label } }
    hasCommunityData: false,
    totalCollectors: 0
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
    const code = String(item.Code || item.code);

    // Normalize image path to root-relative if it starts with src/ or images/
    let imagePath = item.image || item.image_path || "";
    if (imagePath && (imagePath.startsWith('src/') || imagePath.startsWith('images/'))) {
        imagePath = '/' + imagePath;
    }

    return {
        code,
        name,
        image: imagePath,
        rarity: details?.rarity || item.rarity || "unknown",
        category,
        type,
        owned: false,
        description: details?.description || item.description || "",
        released: details?.released || item.released || "Unknown",
        availability: details?.availability || item.availability || "",
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
                console.warn('Image failed to preload:', img.src);
                resolve();
            };

            setTimeout(resolve, 5000);
        });
    });

    return Promise.all(promises);
}

// Load all master data (decorations, obstacles, heroes, sceneries, details)
// and populate state.allItems + initial state.items
async function loadAllMasterData() {
    const [decorations, obstacles, heroesData, sceneries, itemDetails] = await Promise.all([
        loadJSON("decorations.json"),
        loadJSON("obstacles.json"),
        loadJSON("heros.json"),
        loadJSON("sceneries.json"),
        loadJSON("item-details.json")
    ]).then(results => [
        results[0],
        results[1],
        results[2],
        results[3] || { sceneries: [] },
        results[4] || {}
    ]);

    function findItemDetails(itemName, itemType, itemCode = null) {
        if (!itemDetails) {
            return null;
        }

        // If code is provided, match by code first (more reliable)
        if (itemCode) {
            const codeStr = String(itemCode);

            if (itemType === 'heroskin' && itemDetails.hero_skins) {
                for (const hero in itemDetails.hero_skins) {
                    if (Array.isArray(itemDetails.hero_skins[hero])) {
                        const found = itemDetails.hero_skins[hero].find(s =>
                            String(s.code) === codeStr
                        );
                        if (found) return found;
                    }
                }
            } else if (itemType === 'decoration' && itemDetails.decorations) {
                const categories = ['permanent_shop', 'war_league', 'limited_events', 'lunar_new_year'];
                for (const cat of categories) {
                    if (itemDetails.decorations[cat]) {
                        const found = itemDetails.decorations[cat].find(d =>
                            String(d.code) === codeStr
                        );
                        if (found) return found;
                    }
                }
            } else if (itemType === 'obstacle' && itemDetails.obstacles) {
                const categories = ['clashmas_trees', 'halloween', 'anniversary_cakes', 'special_events', 'meteorites_2025'];
                for (const cat of categories) {
                    if (itemDetails.obstacles[cat]) {
                        const found = itemDetails.obstacles[cat].find(o =>
                            String(o.code) === codeStr
                        );
                        if (found) return found;
                    }
                }
            } else if (itemType === 'scenery' && itemDetails.sceneries) {
                let sceneryArray = [];
                if (Array.isArray(itemDetails.sceneries)) {
                    sceneryArray = itemDetails.sceneries;
                } else if (itemDetails.sceneries.all_sceneries && Array.isArray(itemDetails.sceneries.all_sceneries)) {
                    sceneryArray = itemDetails.sceneries.all_sceneries;
                }
                const found = sceneryArray.find(s =>
                    String(s.code) === codeStr
                );
                if (found) return found;
            }
        }

        // Fallback to name matching if code not provided or not found
        if (!itemName) return null;

        const normalizedName = itemName.toLowerCase().trim();

        if (itemType === 'decoration' && itemDetails.decorations) {
            const categories = ['permanent_shop', 'war_league', 'limited_events', 'lunar_new_year'];
            for (const cat of categories) {
                if (itemDetails.decorations[cat]) {
                    const found = itemDetails.decorations[cat].find(d =>
                        d.name.toLowerCase().trim() === normalizedName
                    );
                    if (found) return found;
                }
            }
        } else if (itemType === 'obstacle' && itemDetails.obstacles) {
            const categories = ['clashmas_trees', 'halloween', 'anniversary_cakes', 'special_events', 'meteorites_2025'];
            for (const cat of categories) {
                if (itemDetails.obstacles[cat]) {
                    const found = itemDetails.obstacles[cat].find(o =>
                        o.name.toLowerCase().trim() === normalizedName
                    );
                    if (found) return found;
                }
            }
        } else if (itemType === 'heroskin' && itemDetails.hero_skins) {
            for (const hero in itemDetails.hero_skins) {
                if (Array.isArray(itemDetails.hero_skins[hero])) {
                    const found = itemDetails.hero_skins[hero].find(s =>
                        s.name.toLowerCase().trim() === normalizedName
                    );
                    if (found) return found;
                }
            }
        } else if (itemType === 'scenery' && itemDetails.sceneries) {
            let sceneryArray = [];
            if (Array.isArray(itemDetails.sceneries)) {
                sceneryArray = itemDetails.sceneries;
            } else if (itemDetails.sceneries.all_sceneries && Array.isArray(itemDetails.sceneries.all_sceneries)) {
                sceneryArray = itemDetails.sceneries.all_sceneries;
            }
            const found = sceneryArray.find(s =>
                s.name && s.name.toLowerCase().trim() === normalizedName
            );
            if (found) return found;
        }

        return null;
    }

    const formattedDecorations = decorations?.map(item => {
        const details = findItemDetails(item.name, 'decoration');
        return formatItem(item, "decoration", "Decoration", null, null, details);
    }) || [];

    const formattedObstacles = obstacles?.map(item => {
        const details = findItemDetails(item.name, 'obstacle');
        return formatItem(item, "obstacle", "Obstacle", null, null, details);
    }) || [];

    const formattedSceneries = sceneries?.sceneries?.map(item => {
        const details = findItemDetails(item.name, 'scenery');
        return formatItem(item, "scenery", "Scenery", null, null, details);
    }) || [];

    const formattedClanCapital = [];

    const formattedHeroSkins = [];
    if (heroesData?.heroes) {
        heroesData.heroes.forEach(hero => {
            if (hero.skins && Array.isArray(hero.skins)) {
                const heroId = hero.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                hero.skins.forEach(skin => {
                    const details = findItemDetails(skin.skin_name, 'heroskin', skin.code);
                    formattedHeroSkins.push(formatItem(skin, "heroskin", "Hero Skin", hero.name, heroId, details));
                });
            }
        });
    }

    state.allItems = {
        'cosmetic-compendium': [...formattedDecorations, ...formattedObstacles, ...formattedHeroSkins, ...formattedSceneries, ...formattedClanCapital],
        'hero-wardrobe': formattedHeroSkins,
        'home-village-decor': [...formattedDecorations, ...formattedObstacles],
        'sceneries': formattedSceneries,
        'clan-hall-aesthetics': formattedClanCapital
    };

    state.items = state.allItems['cosmetic-compendium'];

    console.log("Master data loaded:", {
        decorations: formattedDecorations.length,
        obstacles: formattedObstacles.length,
        heroSkins: formattedHeroSkins.length,
        sceneries: formattedSceneries.length,
        clanCapital: formattedClanCapital.length
    });

    await preloadImages(state.items, 50);
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

        // Extract player tag if available
        const playerTag = parsed.tag || (parsed.player && parsed.player.tag) || null;

        return {
            success: true,
            message: `Matched ${codes.length} unique codes.`,
            playerTag: playerTag
        };
    } catch (err) {
        console.error("Parse error:", err);
        return { success: false, message: "Invalid JSON. Check formatting." };
    }
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

// Get community rarity badge HTML for an item
function getCommunityRarityBadge(itemCode) {
    if (!state.hasCommunityData || !state.communityRarity[itemCode]) {
        return '';
    }

    const rarity = state.communityRarity[itemCode];
    const labelClass = rarity.label.toLowerCase().replace(' ', '-');

    return `
        <div class="community-rarity-badge ${labelClass}" title="${rarity.percentage}% of collectors own this">
            <span class="rarity-label">${rarity.label}</span>
            <span class="rarity-percent">${rarity.percentage}%</span>
        </div>
    `;
}

// Get community stats HTML for detail view
function getCommunityStatsSection(itemCode) {
    if (!state.hasCommunityData || !state.communityRarity[itemCode]) {
        return '';
    }

    const rarity = state.communityRarity[itemCode];
    const labelClass = rarity.label.toLowerCase().replace(' ', '-');

    return `
        <div class="detail-community-stats">
            <h3>Community Stats</h3>
            <div class="community-stats-grid">
                <div class="stat-item">
                    <span class="stat-label">Ownership</span>
                    <span class="stat-value">${rarity.percentage}%</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Total Owners</span>
                    <span class="stat-value">${rarity.count}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Rarity Tier</span>
                    <span class="stat-value rarity-tier ${labelClass}">${rarity.label}</span>
                </div>
            </div>
        </div>
    `;
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

    const communityBadge = getCommunityRarityBadge(item.code);

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
                ${communityBadge}
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

    // Skip if element doesn't exist (replaced by analytics modal)
    if (!el) return;

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

    if (el) {
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
        <div class="detail-status-badge ${item.owned ? 'owned' : 'missing'}">
            ${item.owned ? '✓ Owned' : '✕ Missing'}
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
                            <span class="detail-meta-label">Rarity</span>
                            <span class="detail-meta-value rarity-${item.rarity}">${item.rarity}</span>
                        </div>
                        
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
                    
                    ${getCommunityStatsSection(item.code)}
                    
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

// Open and populate the analytics modal
function openAnalyticsModal() {
    // Calculate global stats
    const allItemsList = Object.values(state.allItems).flat();
    const totalItems = allItemsList.length;
    const ownedItems = allItemsList.filter(item => state.userOwnedCodes.has(item.code)).length;
    const percentage = totalItems > 0 ? Math.round((ownedItems / totalItems) * 100) : 0;

    // Calculate category stats
    const categories = {
        'heroskin': { label: 'Hero Skins', total: 0, owned: 0 },
        'scenery': { label: 'Sceneries', total: 0, owned: 0 },
        'decoration': { label: 'Decorations', total: 0, owned: 0 },
        'obstacle': { label: 'Obstacles', total: 0, owned: 0 },
        'clan': { label: 'Clan House', total: 0, owned: 0 }
    };

    allItemsList.forEach(item => {
        if (categories[item.type]) {
            categories[item.type].total++;
            if (state.userOwnedCodes.has(item.code)) {
                categories[item.type].owned++;
            }
        }
    });

    // Generate Category Breakdown HTML
    let categoryHTML = '<div class="category-breakdown" style="margin-top: 1rem; display: flex; flex-direction: column; gap: 0.5rem;">';
    Object.values(categories).forEach(cat => {
        if (cat.total > 0) {
            const catPct = Math.round((cat.owned / cat.total) * 100);
            categoryHTML += `
                <div class="rarity-row" style="background: var(--card); border-left: 3px solid var(--primary);">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span class="rarity-name">${cat.label}</span>
                    </div>
                    <div style="text-align: right;">
                        <div class="rarity-count" style="color: var(--foreground);">${cat.owned}/${cat.total}</div>
                        <div style="font-size: 0.75rem; color: var(--muted-foreground);">${catPct}%</div>
                    </div>
                </div>
            `;
        }
    });
    categoryHTML += '</div>';

    // Populate collection stats
    const collectionStats = document.getElementById('collection-stats');
    collectionStats.innerHTML = `
        <div class="stat-card">
            <div class="stat-number">${ownedItems}</div>
            <div class="stat-label">Owned</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${totalItems - ownedItems}</div>
            <div class="stat-label">Missing</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${totalItems}</div>
            <div class="stat-label">Total Items</div>
        </div>
        <div class="stat-card highlight">
            <div class="stat-number">${percentage}%</div>
            <div class="stat-label">Complete</div>
        </div>
        <div style="grid-column: 1 / -1;">
            <h4 style="margin: 0.5rem 0; color: var(--muted-foreground); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em;">Category Breakdown</h4>
            ${categoryHTML}
        </div>
    `;

    // Populate community stats if available
    const communitySection = document.getElementById('community-section');
    const rarityBreakdown = document.getElementById('rarity-breakdown');

    if (state.hasCommunityData && Object.keys(state.communityRarity).length > 0) {
        communitySection.style.display = 'block';

        // Count items by rarity tier
        const rarityCounts = { 'Legendary': 0, 'Ultra Rare': 0, 'Very Rare': 0, 'Rare': 0, 'Common': 0 };
        Object.values(state.communityRarity).forEach(item => {
            if (rarityCounts.hasOwnProperty(item.label)) {
                rarityCounts[item.label]++;
            }
        });

        rarityBreakdown.innerHTML = `
            <div class="rarity-row legendary">
                <span class="rarity-name">🟣 Legendary (&lt;1%)</span>
                <span class="rarity-count">${rarityCounts['Legendary']} items</span>
            </div>
            <div class="rarity-row ultra-rare">
                <span class="rarity-name">🩷 Ultra Rare (&lt;5%)</span>
                <span class="rarity-count">${rarityCounts['Ultra Rare']} items</span>
            </div>
            <div class="rarity-row very-rare">
                <span class="rarity-name">🔵 Very Rare (&lt;15%)</span>
                <span class="rarity-count">${rarityCounts['Very Rare']} items</span>
            </div>
            <div class="rarity-row rare">
                <span class="rarity-name">🟢 Rare (&lt;30%)</span>
                <span class="rarity-count">${rarityCounts['Rare']} items</span>
            </div>
            <div class="rarity-row common">
                <span class="rarity-name">⚪ Common (≥30%)</span>
                <span class="rarity-count">${rarityCounts['Common']} items</span>
            </div>
        `;

        // Update collector count
        document.getElementById('total-collectors').textContent = state.totalCollectors || '?';
    } else {
        communitySection.style.display = 'none';
    }

    openModal('analytics-modal');
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

    // Show analytics button if user has data
    const analyticsBtn = document.getElementById('analytics-btn');
    if (analyticsBtn) {
        analyticsBtn.style.display = state.hasUserData ? 'inline-flex' : 'none';
    }
}

// ============================================
// EVENT HANDLING
// Upload / clear actions and DOM wiring helpers
// ============================================
// Handle JSON paste submission from the upload modal
async function handleDataUpload() {
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

        // --- NEW: SYNC TO DATABASE ---
        try {
            // Use player tag from JSON if available, otherwise fallback to browser ID
            let clientId = result.playerTag ? result.playerTag.replace('#', '') : getOrCreateClientId();

            // Ensure we have a valid ID
            if (!clientId) clientId = 'unknown_user_' + Date.now();

            console.log("Syncing data for client:", clientId);

            // Collect all valid known codes from our master data
            const validCodes = new Set();
            Object.values(state.allItems).forEach(list => {
                list.forEach(item => validCodes.add(String(item.code)));
            });

            // Filter user codes to ONLY include those that match our app's items
            const ownedArray = Array.from(state.userOwnedCodes).filter(code => validCodes.has(code));

            // Send to API (fire and forget or wait, here we wait to log result)
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientId: clientId,
                    ownedCodes: ownedArray
                })
            });

            if (response.ok) {
                const data = await response.json();
                console.log("Database Sync Success:", data);
                if (data.rarityData) {
                    console.log("Rarity Data received:", data.rarityData);
                    state.communityRarity = data.rarityData;
                    state.hasCommunityData = true;
                    state.totalCollectors = data.totalUsers || 0;
                    updateUI(); // Re-render to show community stats
                    showToast("Community Stats", `Synced with ${data.totalUsers} collectors!`);
                }
            } else {
                console.warn("Database Sync Failed:", response.status);
            }
        } catch (err) {
            console.error("Database Error:", err);
        }
        // -----------------------------

    } else {
        showToast("Invalid JSON", result.message, "error");
    }
}

// Helper to get or create a unique client ID for this browser
function getOrCreateClientId() {
    let id = localStorage.getItem('village_vault_client_id');
    if (!id) {
        // Simple random ID generation
        id = 'client_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
        localStorage.setItem('village_vault_client_id', id);
    }
    return id;
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

    const analyticsBtn = document.getElementById("analytics-btn");
    if (analyticsBtn) {
        analyticsBtn.addEventListener("click", openAnalyticsModal);
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

});
