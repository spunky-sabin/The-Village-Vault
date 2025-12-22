// ============================================
// THE VILLAGE VAULT - SHARED CORE MODULE
// Common utilities, state management, and rendering functions
// Used by all tracker sub-pages
// ============================================

// ============================================
// STATE MANAGEMENT
// ============================================
const state = {
    allItems: {},
    items: [],
    userOwnedCodes: new Set(),
    hasUserData: false,
    activeCategory: 'cosmetic-compendium', // Default, overridden by page-specific init
    searchQuery: '',
    selectedHeroes: [],
    selectedOwnership: [],
    selectedTypes: [],
    selectedRarity: [], // Community rarity filter: 'legendary', 'ultra-rare', 'very-rare', 'rare', 'common'
    sortBy: 'newest',
    visibleLimit: 50,
    communityRarity: {},
    hasCommunityData: false,
    totalCollectors: 0
};

// ============================================
// UTILITY FUNCTIONS
// ============================================
let imageObserver = null;

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
    }
}

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

function generateSlug(name, code = '') {
    if (!name) return 'unknown';
    let slug = name
        .toLowerCase()
        .trim()
        .replace(/[\s_]+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (!slug || slug.length < 2) {
        slug = code ? `item-${code}` : 'unknown';
    }
    return slug;
}

function formatItem(item, type, category, heroName = null, heroId = null, details = null) {
    const name = item.name || item.skin_name || "Unknown Item";
    const code = String(item.Code || item.code);
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

async function preloadImages(items, maxImages = 100) {
    const itemsToPreload = items.slice(0, maxImages);
    const promises = itemsToPreload.map(item => {
        return new Promise(resolve => {
            if (!item.image) return resolve();
            const img = new Image();
            img.src = item.image;
            img.onload = resolve;
            img.onerror = () => resolve();
            setTimeout(resolve, 5000);
        });
    });
    return Promise.all(promises);
}

// ============================================
// DATA LOADING
// ============================================
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
        if (!itemDetails) return null;
        if (itemCode) {
            const codeStr = String(itemCode);
            if (itemType === 'heroskin' && itemDetails.hero_skins) {
                for (const hero in itemDetails.hero_skins) {
                    if (Array.isArray(itemDetails.hero_skins[hero])) {
                        const found = itemDetails.hero_skins[hero].find(s => String(s.code) === codeStr);
                        if (found) return found;
                    }
                }
            } else if (itemType === 'decoration' && itemDetails.decorations) {
                const categories = ['permanent_shop', 'war_league', 'limited_events', 'lunar_new_year'];
                for (const cat of categories) {
                    if (itemDetails.decorations[cat]) {
                        const found = itemDetails.decorations[cat].find(d => String(d.code) === codeStr);
                        if (found) return found;
                    }
                }
            } else if (itemType === 'obstacle' && itemDetails.obstacles) {
                const categories = ['clashmas_trees', 'halloween', 'anniversary_cakes', 'special_events', 'meteorites_2025'];
                for (const cat of categories) {
                    if (itemDetails.obstacles[cat]) {
                        const found = itemDetails.obstacles[cat].find(o => String(o.code) === codeStr);
                        if (found) return found;
                    }
                }
            } else if (itemType === 'scenery' && itemDetails.sceneries) {
                let sceneryArray = Array.isArray(itemDetails.sceneries) ? itemDetails.sceneries :
                    (itemDetails.sceneries.all_sceneries || []);
                const found = sceneryArray.find(s => String(s.code) === codeStr);
                if (found) return found;
            }
        }
        if (!itemName) return null;
        const normalizedName = itemName.toLowerCase().trim();
        if (itemType === 'decoration' && itemDetails.decorations) {
            const categories = ['permanent_shop', 'war_league', 'limited_events', 'lunar_new_year'];
            for (const cat of categories) {
                if (itemDetails.decorations[cat]) {
                    const found = itemDetails.decorations[cat].find(d => d.name.toLowerCase().trim() === normalizedName);
                    if (found) return found;
                }
            }
        } else if (itemType === 'obstacle' && itemDetails.obstacles) {
            const categories = ['clashmas_trees', 'halloween', 'anniversary_cakes', 'special_events', 'meteorites_2025'];
            for (const cat of categories) {
                if (itemDetails.obstacles[cat]) {
                    const found = itemDetails.obstacles[cat].find(o => o.name.toLowerCase().trim() === normalizedName);
                    if (found) return found;
                }
            }
        } else if (itemType === 'heroskin' && itemDetails.hero_skins) {
            for (const hero in itemDetails.hero_skins) {
                if (Array.isArray(itemDetails.hero_skins[hero])) {
                    const found = itemDetails.hero_skins[hero].find(s => s.name.toLowerCase().trim() === normalizedName);
                    if (found) return found;
                }
            }
        } else if (itemType === 'scenery' && itemDetails.sceneries) {
            let sceneryArray = Array.isArray(itemDetails.sceneries) ? itemDetails.sceneries :
                (itemDetails.sceneries.all_sceneries || []);
            const found = sceneryArray.find(s => s.name && s.name.toLowerCase().trim() === normalizedName);
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

    state.items = state.allItems[state.activeCategory] || [];
    await preloadImages(state.items, 50);
}

// ============================================
// JSON PARSER
// ============================================
function extractCodesFromJSON(obj) {
    const codes = new Set();
    function walk(v) {
        if (Array.isArray(v)) {
            v.forEach(item => {
                if (typeof item === "number") codes.add(String(item));
                else if (item && typeof item === "object") walk(item);
            });
        } else if (v && typeof v === "object") {
            if ("data" in v && typeof v.data === "number") codes.add(String(v.data));
            if ("code" in v && (typeof v.code === "string" || typeof v.code === "number")) codes.add(String(v.code));
            Object.values(v).forEach(walk);
        }
    }
    walk(obj);
    return [...codes];
}

function parseUserData(jsonString) {
    try {
        const parsed = JSON.parse(jsonString);
        const codes = extractCodesFromJSON(parsed);
        state.userOwnedCodes = new Set(codes);
        localStorage.setItem('userCollectionData', jsonString);
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
        const playerTag = parsed.tag || (parsed.player && parsed.player.tag) || null;
        return { success: true, message: `Matched ${codes.length} unique codes.`, playerTag };
    } catch (err) {
        console.error("Parse error:", err);
        return { success: false, message: "Invalid JSON. Check formatting." };
    }
}

// ============================================
// URL ROUTING SYSTEM
// ============================================
const Router = {
    typeToPrefix: {
        'heroskin': 'skins',
        'scenery': 'sceneries',
        'obstacle': 'obstacles',
        'decoration': 'decorations',
        'clan': 'clan-items'
    },
    prefixToType: {
        'skins': 'heroskin',
        'sceneries': 'scenery',
        'obstacles': 'obstacle',
        'decorations': 'decoration',
        'clan-items': 'clan'
    },
    navigateToItem(item) {
        const prefix = this.typeToPrefix[item.type] || 'items';
        const url = `/tracker/${prefix}/${item.slug}`;
        history.pushState({ item }, '', url);
        document.title = `${item.name} - The Village Vault`;
        renderDetailView(item);
    },
    navigateToGrid() {
        const currentPage = window.PAGE_CATEGORY || 'compendium';
        history.pushState({}, '', `/tracker/${currentPage}/`);
        document.title = document.querySelector('title')?.textContent || 'The Village Vault';
        hideDetailView();
    },
    parseCurrentURL() {
        const path = window.location.pathname;
        const match = path.match(/\/tracker\/(skins|sceneries|obstacles|decorations|clan-items)\/([^/]+)/);
        if (match) {
            return { prefix: match[1], slug: match[2], type: this.prefixToType[match[1]] };
        }
        return null;
    },
    findItemBySlug(type, slug) {
        for (const categoryId in state.allItems) {
            const items = state.allItems[categoryId];
            const found = items.find(item => item.type === type && item.slug === slug);
            if (found) return found;
        }
        return null;
    },
    handlePopState(event) {
        if (event.state && event.state.item) {
            renderDetailView(event.state.item);
            document.title = `${event.state.item.name} - The Village Vault`;
        } else {
            hideDetailView();
        }
    },
    init() {
        const urlData = this.parseCurrentURL();
        if (urlData) {
            const item = this.findItemBySlug(urlData.type, urlData.slug);
            if (item) {
                renderDetailView(item);
                document.title = `${item.name} - The Village Vault`;
            }
        }
        window.addEventListener('popstate', (e) => this.handlePopState(e));
    }
};

// ============================================
// FILTERING & SORTING
// ============================================
function filterByType(type) {
    if (type === 'all') state.selectedTypes = [];
    else state.selectedTypes = [type];
    updateUI();
}

function filterByHero(heroId) {
    if (state.selectedHeroes.includes(heroId)) {
        state.selectedHeroes = state.selectedHeroes.filter(h => h !== heroId);
    } else {
        state.selectedHeroes = [...state.selectedHeroes, heroId];
    }
    updateUI();
}

function filterByOwnership(ownership) {
    if (state.selectedOwnership.includes(ownership)) {
        state.selectedOwnership = [];
    } else {
        state.selectedOwnership = [ownership];
    }
    updateUI();
}

function filterByRarity(rarity) {
    if (state.selectedRarity.includes(rarity)) {
        state.selectedRarity = state.selectedRarity.filter(r => r !== rarity);
    } else {
        state.selectedRarity = [...state.selectedRarity, rarity];
    }
    updateUI();
}

// Helper function to get community rarity label for an item
function getItemCommunityRarityLabel(itemCode) {
    if (!state.hasCommunityData || !state.communityRarity[itemCode]) return null;
    return state.communityRarity[itemCode].label;
}

// Map display labels to filter values
const RARITY_LABEL_MAP = {
    'Legendary': 'legendary',
    'Ultra Rare': 'ultra-rare',
    'Very Rare': 'very-rare',
    'Rare': 'rare',
    'Common': 'common'
};

function getFilteredItems() {
    let filtered = state.items.filter(item => {
        const matchSearch = item.name.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
            (item.code && item.code.toString().includes(state.searchQuery));
        const matchType = state.selectedTypes.length === 0 || state.selectedTypes.includes(item.type);
        const matchHero = state.activeCategory !== 'hero-wardrobe' ||
            state.selectedHeroes.length === 0 ||
            (item.heroId && state.selectedHeroes.includes(item.heroId));
        const matchOwnership = state.selectedOwnership.length === 0 ||
            (state.selectedOwnership.includes("owned") && item.owned) ||
            (state.selectedOwnership.includes("missing") && !item.owned);

        // Community rarity filter
        let matchRarity = true;
        if (state.selectedRarity.length > 0 && state.hasCommunityData) {
            const itemRarityLabel = getItemCommunityRarityLabel(item.code);
            if (itemRarityLabel) {
                const itemRarityValue = RARITY_LABEL_MAP[itemRarityLabel];
                matchRarity = state.selectedRarity.includes(itemRarityValue);
            } else {
                // Item has no community data, don't show if filtering by rarity
                matchRarity = false;
            }
        }

        return matchSearch && matchType && matchHero && matchOwnership && matchRarity;
    });
    switch (state.sortBy) {
        case "oldest": filtered.sort((a, b) => a.code - b.code); break;
        case "name-asc": filtered.sort((a, b) => a.name.localeCompare(b.name)); break;
        case "name-desc": filtered.sort((a, b) => b.name.localeCompare(a.name)); break;
        case "newest": default: filtered.sort((a, b) => b.code - a.code);
    }
    return filtered;
}

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
        'hero-wardrobe': [{ value: 'heroskin', label: 'Hero Skins', disabled: true }],
        'clan-hall-aesthetics': [{ value: 'clan', label: 'Clan Items', disabled: true }],
        'home-village-decor': [
            { value: 'all', label: 'All Items' },
            { value: 'decoration', label: 'Decorations' },
            { value: 'obstacle', label: 'Obstacles' }
        ],
        'sceneries': [{ value: 'scenery', label: 'Sceneries', disabled: true }]
    };
    const filters = filterConfigs[categoryId] || [];
    const filterHTML = filters.map((f, i) =>
        `<button class="filter-btn ${i === 0 ? 'active' : ''}" data-type-filter="${f.value}" ${f.disabled ? 'disabled style="opacity: 0.7; cursor: not-allowed;"' : ''}>${f.label}</button>`
    ).join('');
    if (typeFilterOptions) typeFilterOptions.innerHTML = filterHTML;
    if (mobileTypeFilterOptions) mobileTypeFilterOptions.innerHTML = filterHTML;
    attachTypeFilterListeners();
}

// ============================================
// RENDERING UI
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

function getCommunityRarityBadge(itemCode) {
    if (!state.hasCommunityData || !state.communityRarity[itemCode]) return '';
    const rarity = state.communityRarity[itemCode];
    const labelClass = rarity.label.toLowerCase().replace(' ', '-');
    return `<div class="community-rarity-badge ${labelClass}" title="${rarity.percentage}% of collectors own this">${rarity.percentage}%</div>`;
}

function getCommunityStatsSection(itemCode) {
    if (!state.hasCommunityData || !state.communityRarity[itemCode]) return '';
    const rarity = state.communityRarity[itemCode];
    const labelClass = rarity.label.toLowerCase().replace(' ', '-');
    return `
        <div class="detail-community-stats">
            <h3>Community Stats</h3>
            <div class="community-stats-grid">
                <div class="stat-item"><span class="stat-label">Ownership</span><span class="stat-value">${rarity.percentage}%</span></div>
                <div class="stat-item"><span class="stat-label">Total Owners</span><span class="stat-value">${rarity.count}</span></div>
                <div class="stat-item"><span class="stat-label">Rarity Tier</span><span class="stat-value rarity-tier ${labelClass}">${rarity.label}</span></div>
            </div>
        </div>`;
}

function createItemCard(item) {
    const container = document.createElement("div");
    container.className = "item-card-container";
    const card = document.createElement("div");
    card.className = `item-card rarity-${item.rarity} type-${item.type}`;
    if (state.hasUserData && !item.owned) card.classList.add("grayscale");
    const typeBadgeText = getTypeBadgeText(item.type, item.category);
    const ownershipBadge = state.hasUserData ? `
        <div class="item-status-badge ${item.owned ? 'owned' : 'missing'}" title="${item.owned ? 'Owned' : 'Missing'}">${item.owned ? '✓' : '✕'}</div>` : '';
    const communityBadge = getCommunityRarityBadge(item.code);
    const frontHTML = `
        <div class="item-card-front">
            ${ownershipBadge}
            <div class="item-type-badge ${item.type}">${typeBadgeText}</div>
            <div class="item-image-container">
                <img src="${item.image}" class="item-image" loading="lazy" alt="${item.name}" width="100%" height="auto" style="display: block;">
                ${communityBadge}
            </div>
            <div class="item-info"><h3>${item.name}</h3></div>
        </div>`;
    const backHTML = `
        <div class="item-card-back">
            <button class="item-close-btn" aria-label="Close details" onclick="event.stopPropagation(); this.closest('.item-card').classList.remove('flipped');">×</button>
            <div class="item-details">
                ${state.hasUserData && !item.owned ? '<div class="missing-indicator">✕</div>' : ''}
                <h3>${item.name}</h3>
                <div class="item-details-section"><div class="item-details-label">Type</div><div class="item-details-value">${typeBadgeText}</div></div>
                <div class="item-details-section"><div class="item-details-label">Description</div><div class="item-details-value">${item.description || 'No description available.'}</div></div>
                <div class="item-details-section"><div class="item-details-label">Released</div><div class="item-details-value">${item.released || 'Unknown'}</div></div>
                <div class="item-details-section"><div class="item-details-label">Availability</div><div class="item-details-value">${item.availability || 'Unknown'}</div></div>
                ${item.heroName ? `<div class="item-details-section"><div class="item-details-label">Hero</div><div class="item-details-value">${item.heroName}</div></div>` : ''}
            </div>
        </div>`;
    card.innerHTML = frontHTML + backHTML;
    const imgEl = card.querySelector('.item-image');
    if (imgEl) {
        imgEl.onload = () => imgEl.classList.add('loaded');
        imgEl.onerror = () => { imgEl.style.opacity = '0.5'; };
    }
    card.dataset.slug = item.slug;
    card.dataset.type = item.type;
    card.addEventListener('click', (e) => {
        if (!e.target.closest('.item-close-btn')) Router.navigateToItem(item);
    });
    container.appendChild(card);
    return container;
}

function renderItems() {
    const list = document.getElementById("items-grid");
    const msg = document.getElementById("no-items-message");
    const count = document.getElementById("items-count");
    const items = getFilteredItems();
    const visibleItems = items.slice(0, state.visibleLimit);
    list.innerHTML = "";
    count.textContent = items.length;
    if (!items.length) { msg.style.display = "block"; return; }
    msg.style.display = "none";
    const fragment = document.createDocumentFragment();
    visibleItems.forEach(i => fragment.appendChild(createItemCard(i)));
    list.appendChild(fragment);
    if (items.length > state.visibleLimit) {
        const sentinel = document.createElement('div');
        sentinel.id = "scroll-sentinel";
        sentinel.style.height = "1px";
        list.appendChild(sentinel);
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

function updateProgressTracker() {
    const el = document.getElementById("progress-tracker");
    if (!el) return;
    if (!state.hasUserData) { el.style.display = "none"; return; }
    let categoryItems = state.allItems[state.activeCategory] || [];
    if (state.selectedTypes.length > 0) categoryItems = categoryItems.filter(item => state.selectedTypes.includes(item.type));
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
        </div>`;
}

// ============================================
// DETAIL VIEW
// ============================================
function renderDetailView(item) {
    let detailView = document.getElementById('item-detail-view');
    if (!detailView) {
        detailView = document.createElement('div');
        detailView.id = 'item-detail-view';
        detailView.className = 'detail-view-overlay';
        document.body.appendChild(detailView);
    }
    const typeBadgeText = getTypeBadgeText(item.type, item.category);
    const ownershipBadge = state.hasUserData ? `
        <div class="detail-status-badge ${item.owned ? 'owned' : 'missing'}">${item.owned ? '✓ Owned' : '✕ Missing'}</div>` : '';
    detailView.innerHTML = `
        <div class="detail-view-backdrop" onclick="Router.navigateToGrid()"></div>
        <div class="detail-view-content">
            <button class="detail-close-btn" onclick="Router.navigateToGrid()" aria-label="Close detail view">
                <svg viewBox="0 0 24 24" width="24" height="24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
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
                        ${item.heroName ? `<div class="detail-meta-item"><span class="detail-meta-label">Hero</span><span class="detail-meta-value">${item.heroName}</span></div>` : ''}
                        <div class="detail-meta-item"><span class="detail-meta-label">Rarity</span><span class="detail-meta-value rarity-${item.rarity}">${item.rarity}</span></div>
                        <div class="detail-meta-item"><span class="detail-meta-label">Released</span><span class="detail-meta-value">${item.released || 'Unknown'}</span></div>
                        <div class="detail-meta-item"><span class="detail-meta-label">Availability</span><span class="detail-meta-value">${item.availability || 'Unknown'}</span></div>
                    </div>
                    <div class="detail-description"><h3>Description</h3><p>${item.description || 'No description available.'}</p></div>
                    ${getCommunityStatsSection(item.code)}
                    <div class="detail-url-share">
                        <label>Share this item:</label>
                        <div class="url-copy-container">
                            <input type="text" readonly value="${window.location.href}" class="url-input" id="share-url-input">
                            <button class="copy-url-btn" onclick="copyShareURL()" aria-label="Copy URL">
                                <svg viewBox="0 0 24 24" width="20" height="20"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke="currentColor" stroke-width="2" fill="none"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="2" fill="none"/></svg>
                                Copy
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    detailView.classList.add('visible');
    document.body.style.overflow = 'hidden';
}

function hideDetailView() {
    const detailView = document.getElementById('item-detail-view');
    if (detailView) {
        detailView.classList.remove('visible');
        document.body.style.overflow = '';
    }
}

function copyShareURL() {
    const input = document.getElementById('share-url-input');
    if (input) {
        input.select();
        navigator.clipboard.writeText(input.value).then(() => {
            showToast('Copied!', 'URL copied to clipboard', 'success');
        }).catch(err => {
            showToast('Error', 'Failed to copy URL', 'error');
        });
    }
}

// ============================================
// ANALYTICS MODAL
// ============================================
function openAnalyticsModal() {
    const allItemsList = Object.values(state.allItems).flat();
    const totalItems = allItemsList.length;
    const ownedItems = allItemsList.filter(item => state.userOwnedCodes.has(item.code)).length;
    const percentage = totalItems > 0 ? Math.round((ownedItems / totalItems) * 100) : 0;
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
            if (state.userOwnedCodes.has(item.code)) categories[item.type].owned++;
        }
    });
    let categoryHTML = '<div class="category-breakdown" style="margin-top: 1rem; display: flex; flex-direction: column; gap: 0.5rem;">';
    Object.values(categories).forEach(cat => {
        if (cat.total > 0) {
            const catPct = Math.round((cat.owned / cat.total) * 100);
            categoryHTML += `<div class="rarity-row" style="background: var(--card); border-left: 3px solid var(--primary);"><div style="display: flex; align-items: center; gap: 0.5rem;"><span class="rarity-name">${cat.label}</span></div><div style="text-align: right;"><div class="rarity-count" style="color: var(--foreground);">${cat.owned}/${cat.total}</div><div style="font-size: 0.75rem; color: var(--muted-foreground);">${catPct}%</div></div></div>`;
        }
    });
    categoryHTML += '</div>';
    const collectionStats = document.getElementById('collection-stats');
    if (collectionStats) {
        collectionStats.innerHTML = `
            <div class="stat-card"><div class="stat-number">${ownedItems}</div><div class="stat-label">Owned</div></div>
            <div class="stat-card"><div class="stat-number">${totalItems - ownedItems}</div><div class="stat-label">Missing</div></div>
            <div class="stat-card"><div class="stat-number">${totalItems}</div><div class="stat-label">Total Items</div></div>
            <div class="stat-card highlight"><div class="stat-number">${percentage}%</div><div class="stat-label">Complete</div></div>
            <div style="grid-column: 1 / -1;"><h4 style="margin: 0.5rem 0; color: var(--muted-foreground); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em;">Category Breakdown</h4>${categoryHTML}</div>`;
    }
    const communitySection = document.getElementById('community-section');
    const rarityBreakdown = document.getElementById('rarity-breakdown');
    if (state.hasCommunityData && Object.keys(state.communityRarity).length > 0 && communitySection && rarityBreakdown) {
        communitySection.style.display = 'block';
        const rarityCounts = { 'Legendary': 0, 'Ultra Rare': 0, 'Very Rare': 0, 'Rare': 0, 'Common': 0 };
        // Store which items belong to each rarity tier (for the user's owned items)
        const rarityItems = { 'Legendary': [], 'Ultra Rare': [], 'Very Rare': [], 'Rare': [], 'Common': [] };
        Object.keys(state.communityRarity).forEach(itemCode => {
            if (state.userOwnedCodes.has(itemCode)) {
                const itemData = state.communityRarity[itemCode];
                if (rarityCounts.hasOwnProperty(itemData.label)) {
                    rarityCounts[itemData.label]++;
                    rarityItems[itemData.label].push(itemCode);
                }
            }
        });

        // Create clickable rarity rows
        rarityBreakdown.innerHTML = `
            <div class="rarity-row legendary clickable" data-rarity="legendary" title="Click to view your ${rarityCounts['Legendary']} Legendary items"><span class="rarity-name">Legendary (&lt;1%)</span><span class="rarity-count">${rarityCounts['Legendary']} items</span></div>
            <div class="rarity-row ultra-rare clickable" data-rarity="ultra-rare" title="Click to view your ${rarityCounts['Ultra Rare']} Ultra Rare items"><span class="rarity-name">Ultra Rare (&lt;5%)</span><span class="rarity-count">${rarityCounts['Ultra Rare']} items</span></div>
            <div class="rarity-row very-rare clickable" data-rarity="very-rare" title="Click to view your ${rarityCounts['Very Rare']} Very Rare items"><span class="rarity-name">Very Rare (&lt;15%)</span><span class="rarity-count">${rarityCounts['Very Rare']} items</span></div>
            <div class="rarity-row rare clickable" data-rarity="rare" title="Click to view your ${rarityCounts['Rare']} Rare items"><span class="rarity-name">Rare (&lt;30%)</span><span class="rarity-count">${rarityCounts['Rare']} items</span></div>
            <div class="rarity-row common clickable" data-rarity="common" title="Click to view your ${rarityCounts['Common']} Common items"><span class="rarity-name">Common (≥30%)</span><span class="rarity-count">${rarityCounts['Common']} items</span></div>`;

        // Add click handlers to rarity rows
        rarityBreakdown.querySelectorAll('.rarity-row.clickable').forEach(row => {
            row.addEventListener('click', () => {
                const rarityValue = row.dataset.rarity;
                // Set filters to show only owned items of this rarity
                state.selectedOwnership = ['owned'];
                state.selectedRarity = [rarityValue];
                // Update ownership filter checkboxes
                document.querySelectorAll('.ownership-filter').forEach(cb => {
                    cb.checked = cb.value === 'owned';
                });
                document.querySelectorAll('.btn-mobile-filter-ownership').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.ownership === 'owned');
                });
                // Update rarity filter checkboxes
                document.querySelectorAll('.rarity-filter').forEach(cb => {
                    cb.checked = cb.value === rarityValue;
                });
                document.querySelectorAll('.mobile-rarity-filter').forEach(cb => {
                    cb.checked = cb.value === rarityValue;
                });
                // Close modal and update UI
                closeModal('analytics-modal');
                updateUI();
                showToast("Filter Applied", `Showing your ${row.querySelector('.rarity-name').textContent.split(' (')[0]} items`);
            });
        });

        const totalCollectorsEl = document.getElementById('total-collectors');
        if (totalCollectorsEl) totalCollectorsEl.textContent = state.totalCollectors || '?';
    } else if (communitySection) {
        communitySection.style.display = 'none';
    }
    openModal('analytics-modal');
}

function updateUI() {
    renderItems();
    updateProgressTracker();
    const heroFilterGroup = document.getElementById('hero-filter-group');
    const mobileHeroFilterGroup = document.getElementById('mobile-hero-filter-group');
    const isHeroWardrobe = state.activeCategory === 'hero-wardrobe';
    if (heroFilterGroup) heroFilterGroup.style.display = isHeroWardrobe ? 'block' : 'none';
    if (mobileHeroFilterGroup) mobileHeroFilterGroup.style.display = isHeroWardrobe ? 'block' : 'none';
    const analyticsBtn = document.getElementById('analytics-btn');
    if (analyticsBtn) analyticsBtn.style.display = state.hasUserData ? 'inline-flex' : 'none';
}

// ============================================
// DATABASE SYNC
// ============================================
async function syncUserDataToDatabase(playerTag) {
    try {
        let clientId = playerTag ? playerTag.replace('#', '') : getOrCreateClientId();
        if (!clientId) clientId = 'unknown_user_' + Date.now();
        const validCodes = new Set();
        Object.values(state.allItems).forEach(list => list.forEach(item => validCodes.add(String(item.code))));
        const ownedArray = Array.from(state.userOwnedCodes).filter(code => validCodes.has(code));
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, ownedCodes: ownedArray })
        });
        if (response.ok) {
            const data = await response.json();
            if (data.rarityData) {
                state.communityRarity = data.rarityData;
                state.hasCommunityData = true;
                state.totalCollectors = data.totalUsers || 0;
                // Save community data to localStorage for cross-page persistence
                localStorage.setItem('communityRarityData', JSON.stringify(data.rarityData));
                localStorage.setItem('totalCollectors', String(data.totalUsers || 0));
                // Show rarity filter now that we have community data
                const rarityFilterGroup = document.getElementById('rarity-filter-group');
                const mobileRarityFilterGroup = document.getElementById('mobile-rarity-filter-group');
                if (rarityFilterGroup) rarityFilterGroup.style.display = 'block';
                if (mobileRarityFilterGroup) mobileRarityFilterGroup.style.display = 'block';
                updateUI();
                showToast("Community Stats", `Synced with ${data.totalUsers} collectors!`);
            }
        }
    } catch (err) {
        console.error("Database Error:", err);
    }
}

function getOrCreateClientId() {
    let id = localStorage.getItem('village_vault_client_id');
    if (!id) {
        id = 'client_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
        localStorage.setItem('village_vault_client_id', id);
    }
    return id;
}

// ============================================
// EVENT HANDLERS
// ============================================
async function handleDataUpload() {
    const input = document.getElementById("json-input").value.trim();
    if (!input) { showToast("Error", "Please paste your JSON!", "error"); return; }
    const result = parseUserData(input);
    if (result.success) {
        showToast("Success!", result.message);
        closeModal("upload-modal");
        document.getElementById("clear-data-btn").style.display = "block";
        updateUI();
        await syncUserDataToDatabase(result.playerTag);
    } else {
        showToast("Invalid JSON", result.message, "error");
    }
}

function handleDataClear() {
    state.userOwnedCodes = new Set();
    Object.keys(state.allItems).forEach(categoryId => {
        state.allItems[categoryId] = state.allItems[categoryId].map(i => ({ ...i, owned: false }));
    });
    state.items = state.items.map(i => ({ ...i, owned: false }));
    state.hasUserData = false;
    state.hasCommunityData = false;
    state.communityRarity = {};
    state.totalCollectors = 0;
    state.selectedRarity = [];
    localStorage.removeItem('userCollectionData');
    localStorage.removeItem('communityRarityData');
    localStorage.removeItem('totalCollectors');
    document.getElementById("clear-data-btn").style.display = "none";
    // Hide rarity filter when no community data
    const rarityFilterGroup = document.getElementById('rarity-filter-group');
    const mobileRarityFilterGroup = document.getElementById('mobile-rarity-filter-group');
    if (rarityFilterGroup) rarityFilterGroup.style.display = 'none';
    if (mobileRarityFilterGroup) mobileRarityFilterGroup.style.display = 'none';
    updateUI();
    showToast("Cleared", "Your data has been reset.");
}

async function handlePasteFromClipboard() {
    const isMobile = navigator.userAgent.match(/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i);
    const isSecureContext = location.protocol === 'https:' || location.hostname === 'localhost';
    if (navigator.clipboard && navigator.clipboard.readText) {
        try {
            if (!isSecureContext) {
                showToast("HTTPS Required", "Automatic paste requires secure connection. Please use manual paste.", "error");
                openModal("upload-modal");
                return;
            }
            let clipboardText = await navigator.clipboard.readText();
            if (!clipboardText.trim()) { showToast("Error", "Clipboard is empty!", "error"); return; }
            let cleanedText = clipboardText.trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
            const jsonMatch = cleanedText.match(/(\{[\s\S]*\})|(\[[\s\S]*\])/);
            if (jsonMatch) cleanedText = jsonMatch[0];
            const result = parseUserData(cleanedText);
            if (result.success) {
                showToast("Success!", result.message);
                document.getElementById("clear-data-btn").style.display = "block";
                updateUI();
                await syncUserDataToDatabase(result.playerTag);
            } else {
                showToast("Invalid JSON", result.message, "error");
                openModal("upload-modal");
            }
            return;
        } catch (err) {
            console.error("Clipboard API error:", err);
        }
    }
    openModal("upload-modal");
    setTimeout(() => {
        const textarea = document.getElementById("json-input");
        if (textarea) { textarea.focus(); showToast("Instructions", "Please paste your data in the text area below", "error"); }
    }, 100);
}

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
// MODALS & NOTIFICATIONS
// ============================================
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'flex';
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = "none";
}

function showToast(title, message, type = "success") {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<div class="toast-content"><div class="toast-title">${title}</div><div class="toast-message">${message}</div></div>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add("toast-fade-out"); setTimeout(() => toast.remove(), 300); }, 3000);
}

// ============================================
// COMMON INITIALIZATION
// ============================================
async function initializePage(categoryId) {
    state.activeCategory = categoryId;
    window.PAGE_CATEGORY = categoryId.replace('hero-wardrobe', 'wardrobe').replace('cosmetic-compendium', 'compendium').replace('home-village-decor', 'decorations');

    initImageObserver();
    await loadAllMasterData();

    state.items = state.allItems[categoryId] || [];

    // Load user collection data from localStorage (persists across pages)
    const userCollectionData = localStorage.getItem('userCollectionData');
    if (userCollectionData) {
        try {
            const parsed = JSON.parse(userCollectionData);
            const result = parseUserData(JSON.stringify(parsed));
            if (result.success) {
                const clearBtn = document.getElementById("clear-data-btn");
                if (clearBtn) clearBtn.style.display = "block";
            }
        } catch (err) {
            console.error("Error loading stored collection data:", err);
        }
    }

    // Load community rarity data from localStorage (persists across pages)
    const storedCommunityData = localStorage.getItem('communityRarityData');
    const storedTotalCollectors = localStorage.getItem('totalCollectors');
    if (storedCommunityData) {
        try {
            state.communityRarity = JSON.parse(storedCommunityData);
            state.hasCommunityData = true;
            state.totalCollectors = parseInt(storedTotalCollectors) || 0;
            // Show rarity filter if we have community data
            const rarityFilterGroup = document.getElementById('rarity-filter-group');
            const mobileRarityFilterGroup = document.getElementById('mobile-rarity-filter-group');
            if (rarityFilterGroup) rarityFilterGroup.style.display = 'block';
            if (mobileRarityFilterGroup) mobileRarityFilterGroup.style.display = 'block';
        } catch (err) {
            console.error("Error loading stored community data:", err);
        }
    }

    updateTypeFilterUI(categoryId);
    updateUI();
    Router.init();

    // Common event listeners
    setupCommonEventListeners();

    // Hide loading screen
    const loadingScreen = document.getElementById("loading-screen");
    if (loadingScreen) loadingScreen.style.display = "none";
}

function setupCommonEventListeners() {
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
        sortSelect.addEventListener("change", e => { state.sortBy = e.target.value; updateUI(); });
    }

    attachTypeFilterListeners();

    const ownershipCheckboxes = document.querySelectorAll('.ownership-filter');
    ownershipCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', e => {
            const ownership = e.target.value;
            if (ownership !== 'all' && !state.hasUserData) {
                e.target.checked = false;
                showToast("No Data", "Please paste your JSON file first to use ownership filters", "error");
                openModal("upload-modal");
                return;
            }
            ownershipCheckboxes.forEach(cb => { if (cb !== e.target) cb.checked = false; });
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

    // Rarity filter checkboxes (desktop)
    const rarityFilterCheckboxes = document.querySelectorAll('.rarity-filter');
    rarityFilterCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', e => {
            const rarity = e.target.value;
            if (!state.hasCommunityData) {
                e.target.checked = false;
                showToast("No Community Data", "Community rarity data is not available yet", "error");
                return;
            }
            filterByRarity(rarity);
            // Sync with mobile
            const mobileCheckbox = document.querySelector(`.mobile-rarity-filter[value="${rarity}"]`);
            if (mobileCheckbox) mobileCheckbox.checked = checkbox.checked;
        });
    });

    // Rarity filter checkboxes (mobile)
    const mobileRarityFilterCheckboxes = document.querySelectorAll('.mobile-rarity-filter');
    mobileRarityFilterCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', e => {
            const rarity = e.target.value;
            if (!state.hasCommunityData) {
                e.target.checked = false;
                showToast("No Community Data", "Community rarity data is not available yet", "error");
                return;
            }
            filterByRarity(rarity);
            // Sync with desktop
            const desktopCheckbox = document.querySelector(`.rarity-filter[value="${rarity}"]`);
            if (desktopCheckbox) desktopCheckbox.checked = checkbox.checked;
        });
    });

    const uploadBtn = document.getElementById("upload-btn");
    if (uploadBtn) uploadBtn.addEventListener("click", () => openModal("upload-modal"));

    const pasteBtn = document.getElementById("paste-btn");
    if (pasteBtn) pasteBtn.addEventListener("click", handlePasteFromClipboard);

    const analyzeBtn = document.getElementById("analyze-btn");
    if (analyzeBtn) analyzeBtn.addEventListener("click", handleDataUpload);

    const analyticsBtn = document.getElementById("analytics-btn");
    if (analyticsBtn) analyticsBtn.addEventListener("click", openAnalyticsModal);

    const clearDataBtn = document.getElementById("clear-data-btn");
    if (clearDataBtn) clearDataBtn.addEventListener("click", handleDataClear);

    document.querySelectorAll(".modal-close-btn").forEach(btn => {
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
    if (mobileFilterBtn) mobileFilterBtn.addEventListener("click", () => openModal("filter-modal"));

    const applyFiltersBtn = document.getElementById("apply-filters-btn");
    if (applyFiltersBtn) applyFiltersBtn.addEventListener("click", () => closeModal("filter-modal"));

    document.querySelectorAll('.btn-mobile-filter-ownership').forEach(btn => {
        btn.addEventListener('click', () => {
            const ownership = btn.dataset.ownership;
            if (ownership !== 'all' && !state.hasUserData) {
                showToast("No Data", "Please paste your JSON file first to use ownership filters", "error");
                openModal("upload-modal");
                return;
            }
            state.selectedOwnership = ownership === 'all' ? [] : [ownership];
            document.querySelectorAll('.btn-mobile-filter-ownership').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
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
}
