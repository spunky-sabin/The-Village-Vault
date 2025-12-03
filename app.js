/**
 * The Village Vault - Main Application
 * Consolidated from all HTML files and scripts
 * Features: Card flip animations, detailed item info, enhanced filtering
 */

// ============================================
// STATE MANAGEMENT
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
    visibleLimit: 50
};

let itemDetailsDatabase = {};

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

// Initialize Intersection Observer for lazy loading images
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
        }, { rootMargin: '100px' }); // Load images 100px before they enter viewport
    } else {
        console.warn('IntersectionObserver not supported, falling back to immediate loading');
    }
}

async function loadJSON(url) {
    try {
        // Resolve relative paths correctly
        const fullPath = url.startsWith('src/') ? url : `src/data-json/${url}`;
        const res = await fetch(fullPath);
        if (!res.ok) throw new Error("HTTP Error " + res.status);
        return await res.json();
    } catch (err) {
        console.error("Error loading", url, err);
        return null;
    }
}

// Generic item formatter
function formatItem(item, type, category, heroName = null, heroId = null, details = null) {
    return {
        code: String(item.Code || item.code),
        name: item.name || item.skin_name || "Unknown Item",
        image: item.image || item.image_path || "",
        rarity: details?.rarity || item.rarity || "common",
        category,
        type,
        owned: false,
        description: details?.description || item.description || "",
        released: details?.released || item.released || "Unknown",
        availability: details?.availability || item.availability || "",
        ...(heroName && { heroName }),
        ...(heroId && { heroId })
    };
}

// Preload images with better error handling and timeout
async function preloadImages(items, maxImages = 20) {
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
            
            // Add timeout for very slow images (5 seconds)
            setTimeout(resolve, 5000);
        });
    });

    return Promise.all(promises);
}

async function loadAllMasterData() {
    // Use Promise.all to fetch all JSON files in parallel
    const [decorations, obstacles, heroesData, sceneries, clanCapital, itemDetails] = await Promise.all([
        loadJSON("decorations.json"),
        loadJSON("obstacles.json"),
        loadJSON("heros.json"),
        loadJSON("sceneries.json"),
        loadJSON("clan-capital.json"),
        loadJSON("item-details.json")
    ]).then(results => [
        results[0],
        results[1],
        results[2],
        results[3] || { sceneries: [] },
        results[4] || [],
        results[5] || {}
    ]);

    itemDetailsDatabase = itemDetails || {};

    function findItemDetails(itemName, itemType) {
        if (!itemDetails || !itemName) {
            return null;
        }
        
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
            const heroes = ['barbarian_king', 'archer_queen', 'grand_warden', 'royal_champion', 'minion_prince'];
            for (const hero of heroes) {
                if (itemDetails.hero_skins[hero]) {
                    const found = itemDetails.hero_skins[hero].find(s => 
                        s.name.toLowerCase().trim() === normalizedName
                    );
                    if (found) return found;
                }
            }
        } else if (itemType === 'scenery' && itemDetails.sceneries) {
            const found = itemDetails.sceneries.find(s => 
                s.name.toLowerCase().trim() === normalizedName
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
    
    const formattedSceneries = sceneries.sceneries?.map(item => {
        const details = findItemDetails(item.name, 'scenery');
        return formatItem(item, "scenery", "Scenery", null, null, details);
    }) || [];

    const formattedClanCapital = clanCapital?.map(item => formatItem(item, "clan", "Clan Item")) || [];

    // Format Hero Skins with hero context
    const formattedHeroSkins = [];
    if (heroesData?.heroes) {
        heroesData.heroes.forEach(hero => {
            if (hero.skins && Array.isArray(hero.skins)) {
                const heroId = hero.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                hero.skins.forEach(skin => {
                    const details = findItemDetails(skin.skin_name, 'heroskin');
                    formattedHeroSkins.push(formatItem(skin, "heroskin", "Hero Skin", hero.name, heroId, details));
                });
            }
        });
    }

    // Organize by category
    state.allItems = {
        'cosmetic-compendium': [...formattedDecorations, ...formattedObstacles, ...formattedHeroSkins, ...formattedSceneries, ...formattedClanCapital],
        'hero-wardrobe': formattedHeroSkins,
        'home-village-decor': [...formattedDecorations, ...formattedObstacles, ...formattedSceneries],
        'clan-hall-aesthetics': formattedClanCapital
    };

    state.items = state.allItems['cosmetic-compendium'];
    
    // Preload only the first batch of images (visible items)
    console.log("Preloading initial images...");
    await preloadImages(state.items, 50);
    
    console.log("Loaded items:", {
        'Decorations': formattedDecorations.length,
        'Obstacles': formattedObstacles.length,
        'Hero Skins': formattedHeroSkins.length,
        'Sceneries': formattedSceneries.length,
        'Clan Items': formattedClanCapital.length
    });
}

// ============================================
// JSON PARSER
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
        return { success: true, message: `Matched ${codes.length} unique codes.` };
    } catch (err) {
        console.error("Parse error:", err);
        return { success: false, message: "Invalid JSON. Check formatting." };
    }
}

// ============================================
// FILTERING & SORTING
// ============================================
function filterByType(type) {
    if (type === 'all') {
        state.selectedTypes = [];
    } else {
        state.selectedTypes = [type];
    }
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

function switchCategory(categoryId) {
    state.activeCategory = categoryId;
    state.items = state.allItems[categoryId] || [];
    state.visibleLimit = 50; // Reset pagination when switching categories
    
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
            { value: 'obstacle', label: 'Obstacles' },
            { value: 'scenery', label: 'Sceneries' }
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

function filterByOwnership(ownership) {
    if (state.selectedOwnership.includes(ownership)) {
        state.selectedOwnership = [];
    } else {
        state.selectedOwnership = [ownership];
    }
    updateUI();
}

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

function createItemCard(item) {
    const container = document.createElement("div");
    container.className = "item-card-container";
    
    const card = document.createElement("div");
    card.className = `item-card rarity-${item.rarity} type-${item.type}`;
    if (state.hasUserData && !item.owned) card.classList.add("grayscale");

    const typeBadgeText = getTypeBadgeText(item.type, item.category);

    const ownershipBadge = state.hasUserData ? `
        <div class="item-status-badge ${item.owned ? 'owned' : 'missing'}">
            ${item.owned ? '✓ Owned' : '✕ Missing'}
        </div>
    ` : '';

    const frontHTML = `
        <div class="item-card-front">
            ${ownershipBadge}
            <div class="item-type-badge ${item.type}">
                ${typeBadgeText}
            </div>
            <div class="item-image-container">
                <img src="" data-src="${item.image}" class="item-image" loading="lazy" alt="${item.name}" width="100%" height="auto" style="display: block;">
            </div>
            <div class="item-info">
                <h3>${item.name}</h3>
                <p>${item.category}</p>
            </div>
        </div>
    `;

    const backHTML = `
        <div class="item-card-back">
            <button class="item-close-btn" aria-label="Close details" onclick="event.stopPropagation(); this.closest('.item-card').classList.remove('flipped');">×</button>
            <div class="item-details">
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
                
                <div class="item-details-section">
                    <div class="item-details-label">Item Code</div>
                    <div class="item-details-value">${item.code}</div>
                </div>
            </div>
        </div>
    `;

    card.innerHTML = frontHTML + backHTML;
    
    // Set up lazy loading with IntersectionObserver
    const imgEl = card.querySelector('.item-image');
    if (imageObserver && imgEl) {
        imageObserver.observe(imgEl);
    } else if (imgEl && !imageObserver) {
        // Fallback for browsers without IntersectionObserver
        imgEl.src = imgEl.dataset.src;
        imgEl.onload = () => imgEl.classList.add('loaded');
    }
    
    card.addEventListener('click', (e) => {
        if (!e.target.closest('.item-close-btn')) {
            card.classList.toggle('flipped');
        }
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

    if (!items.length) {
        msg.style.display = "block";
        return;
    }
    msg.style.display = "none";

    // Use DocumentFragment for efficient DOM rendering
    const fragment = document.createDocumentFragment();
    visibleItems.forEach(i => fragment.appendChild(createItemCard(i)));
    list.appendChild(fragment);

    // Add "Load More" button if there are more items
    if (items.length > state.visibleLimit) {
        const loadMoreContainer = document.createElement('div');
        loadMoreContainer.className = "item-card-container";
        loadMoreContainer.innerHTML = `
            <button id="load-more-btn" class="btn btn-secondary" style="width: 100%; padding: 1rem; cursor: pointer;">
                Load More (${items.length - state.visibleLimit} remaining)
            </button>
        `;
        list.appendChild(loadMoreContainer);

        document.getElementById('load-more-btn').addEventListener('click', () => {
            state.visibleLimit += 50;
            renderItems();
        });
    }
}

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
// ============================================
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

function handleDataClear() {
    state.userOwnedCodes = new Set();
    // Reset owned flag for all items across all categories
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
// ============================================
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

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
// ============================================
document.addEventListener("DOMContentLoaded", async () => {
    console.log("Initializing app...");
    
    // Initialize the IntersectionObserver for lazy loading
    initImageObserver();
    
    console.log("Loading JSON data...");
    await loadAllMasterData();
    
    const userCollectionData = sessionStorage.getItem('userCollectionData');
    
    if (userCollectionData) {
        try {
            const parsed = JSON.parse(userCollectionData);
            const result = parseUserData(JSON.stringify(parsed));
            if (result.success) {
                document.getElementById("clear-data-btn").style.display = "block";
            }
            console.log("Loaded collection data from session:", result);
        } catch (err) {
            console.error("Error loading session collection data:", err);
        }
    }
    
    updateUI();

    // Category Tab Switching
    const categoryTabs = document.querySelectorAll('.category-tab');
    categoryTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const categoryId = tab.getAttribute('data-category');
            
            categoryTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            switchCategory(categoryId);
        });
    });

    // Search with debounce to prevent excessive re-renders
    const searchInput = document.getElementById("search-input");
    if (searchInput) {
        const debouncedSearch = debounce(e => {
            state.searchQuery = e.target.value;
            state.visibleLimit = 50; // Reset pagination on search
            updateUI();
        }, 300);
        searchInput.addEventListener("input", debouncedSearch);
    }

    // Sort
    const sortSelect = document.getElementById("sort-select");
    if (sortSelect) {
        sortSelect.addEventListener("change", e => {
            state.sortBy = e.target.value;
            updateUI();
        });
    }

    // Type filters
    attachTypeFilterListeners();

    // Ownership filters
    const ownershipCheckboxes = document.querySelectorAll('.ownership-filter');
    ownershipCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', e => {
            const ownership = e.target.value;
            
            ownershipCheckboxes.forEach(cb => {
                if (cb !== e.target) {
                    cb.checked = false;
                }
            });
            
            filterByOwnership(ownership);
        });
    });

    // Hero filters
    const heroFilterCheckboxes = document.querySelectorAll('.hero-filter');
    heroFilterCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', e => {
            const heroId = e.target.value;
            filterByHero(heroId);
            const mobileCheckbox = document.querySelector(`.mobile-hero-filter[value="${heroId}"]`);
            if (mobileCheckbox) {
                mobileCheckbox.checked = checkbox.checked;
            }
        });
    });

    // Mobile Hero filters
    const mobileHeroFilterCheckboxes = document.querySelectorAll('.mobile-hero-filter');
    mobileHeroFilterCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', e => {
            const heroId = e.target.value;
            filterByHero(heroId);
            const desktopCheckbox = document.querySelector(`.hero-filter[value="${heroId}"]`);
            if (desktopCheckbox) {
                desktopCheckbox.checked = checkbox.checked;
            }
        });
    });

    // Upload / Clear
    const uploadBtn = document.getElementById("upload-btn");
    if (uploadBtn) {
        uploadBtn.setAttribute('aria-label', 'Upload your collection data');
        uploadBtn.addEventListener("click", () => openModal("upload-modal"));
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

    // Modal close buttons
    document.querySelectorAll(".modal-close-btn").forEach(btn => {
        btn.setAttribute('aria-label', 'Close modal');
        btn.addEventListener("click", () => {
            const modal = btn.closest(".modal");
            if (modal) {
                modal.style.display = "none";
            }
        });
    });

    // Modal overlay close
    document.querySelectorAll(".modal-overlay").forEach(overlay => {
        overlay.addEventListener("click", () => {
            const modal = overlay.closest(".modal");
            if (modal) {
                modal.style.display = "none";
            }
        });
    });

    // Cancel buttons
    document.querySelectorAll(".modal-cancel-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const modal = btn.closest(".modal");
            if (modal) {
                modal.style.display = "none";
            }
        });
    });

    // Mobile filter button
    const mobileFilterBtn = document.getElementById("mobile-filter-btn");
    if (mobileFilterBtn) {
        mobileFilterBtn.addEventListener("click", () => openModal("filter-modal"));
    }

    // Mobile ownership filters
    document.querySelectorAll(".mobile-ownership-filter").forEach(checkbox => {
        checkbox.addEventListener("change", () => {
            const ownership = checkbox.value;
            
            document.querySelectorAll(".mobile-ownership-filter").forEach(cb => {
                if (cb !== checkbox) {
                    cb.checked = false;
                }
            });
            
            filterByOwnership(ownership);
        });
    });

    // Apply filters button (mobile)
    const applyFiltersBtn = document.getElementById("apply-filters-btn");
    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener("click", () => {
            closeModal("filter-modal");
        });
    }

    // Sync mobile search with debounce
    const mobileSearchInput = document.getElementById("mobile-search-input");
    if (mobileSearchInput) {
        const debouncedMobileSearch = debounce(e => {
            state.searchQuery = e.target.value;
            state.visibleLimit = 50; // Reset pagination on search
            const desktopSearch = document.getElementById("search-input");
            if (desktopSearch) {
                desktopSearch.value = e.target.value;
            }
            updateUI();
        }, 300);
        mobileSearchInput.addEventListener("input", debouncedMobileSearch);
    }

    // Sync mobile sort
    const mobileSortSelect = document.getElementById("mobile-sort-select");
    if (mobileSortSelect) {
        mobileSortSelect.addEventListener("change", e => {
            state.sortBy = e.target.value;
            const desktopSort = document.getElementById("sort-select");
            if (desktopSort) {
                desktopSort.value = e.target.value;
            }
            updateUI();
        });
    }
});