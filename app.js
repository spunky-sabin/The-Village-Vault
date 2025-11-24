/**
 * The Village Vault - Enhanced Version
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
    loading: false,
};

// Item descriptions and details (from Clash of Clans wiki data)
const itemDetails = {
    // This would be populated from your JSON files with additional metadata
    // Format: { code: { released: "date", availability: "how to get", description: "..." } }
};

// ============================================
// LOAD JSON FILES
// ============================================
async function loadJSON(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("HTTP Error " + res.status);
        return await res.json();
    } catch (err) {
        console.error("Error loading", url, err);
        return [];
    }
}

async function loadAllMasterData() {
    const decorations = await loadJSON("decorations.json");
    const obstacles = await loadJSON("obstacles.json");
    const heroesData = await loadJSON("heros.json");
    const sceneries = await loadJSON("sceneries.json") || { sceneries: [] };
    const clanCapital = await loadJSON("clan-capital.json") || [];

    // Format Decorations
    const formattedDecorations = decorations ? decorations.map(item => ({
        code: String(item.Code),
        name: item.name || "Unknown Decoration",
        image: item.image || "",
        rarity: item.rarity || "common",
        category: "Decoration",
        type: "decoration",
        owned: false,
        description: item.description || "A decorative item for your village.",
        released: item.released || "Unknown",
        availability: item.availability || "Available in shop"
    })) : [];

    // Format Obstacles
    const formattedObstacles = obstacles ? obstacles.map(item => ({
        code: String(item.Code),
        name: item.name || "Unknown Obstacle",
        image: item.image || "",
        rarity: item.rarity || "common",
        category: "Obstacle",
        type: "obstacle",
        owned: false,
        description: item.description || "An obstacle that can be removed or kept.",
        released: item.released || "Unknown",
        availability: item.availability || "Spawns naturally"
    })) : [];

    // Format Hero Skins
    const formattedHeroSkins = [];
    if (heroesData && heroesData.heroes) {
        heroesData.heroes.forEach(hero => {
            if (hero.skins && Array.isArray(hero.skins)) {
                const heroId = hero.name
                    .toLowerCase()
                    .replace(/\s+/g, '_')
                    .replace(/[^a-z0-9_]/g, '');
                
                hero.skins.forEach(skin => {
                    formattedHeroSkins.push({
                        code: String(skin.code),
                        name: skin.skin_name || "Unknown Skin",
                        image: skin.image_path || "",
                        rarity: skin.rarity || "common",
                        category: "Hero Skin",
                        heroName: hero.name,
                        heroId: heroId,
                        type: "heroskin",
                        owned: false,
                        description: skin.description || `A special skin for ${hero.name}.`,
                        released: skin.released || "Unknown",
                        availability: skin.availability || "Available in shop"
                    });
                });
            }
        });
    }

    // Format Sceneries
    const formattedSceneries = sceneries && sceneries.sceneries ? sceneries.sceneries.map(item => ({
        code: String(item.Code),
        name: item.name || "Unknown Scenery",
        image: item.image || "",
        rarity: item.rarity || "common",
        category: "Scenery",
        type: "scenery",
        owned: false,
        description: item.description || "A beautiful scenery for your village.",
        released: item.released || "Unknown",
        availability: item.availability || "Available in shop"
    })) : [];

    // Format Clan Capital Items
    const formattedClanCapital = clanCapital.length ? clanCapital.map(item => ({
        code: String(item.Code),
        name: item.name || "Unknown Clan Item",
        image: item.image || "",
        rarity: item.rarity || "common",
        category: item.category || "Clan Item",
        type: "clan",
        owned: false,
        description: item.description || "A decoration for your Clan Capital.",
        released: item.released || "Unknown",
        availability: item.availability || "Clan Capital exclusive"
    })) : [];

    // Organize by category
    state.allItems = {
        'cosmetic-compendium': [
            ...formattedDecorations,
            ...formattedObstacles,
            ...formattedHeroSkins,
            ...formattedSceneries,
            ...formattedClanCapital
        ],
        'hero-wardrobe': formattedHeroSkins,
        'home-village-decor': [...formattedDecorations, ...formattedObstacles, ...formattedSceneries],
        'clan-hall-aesthetics': formattedClanCapital
    };

    state.items = state.allItems['cosmetic-compendium'];
    console.log("Loaded items by category:", {
        'Cosmetic Compendium': state.allItems['cosmetic-compendium'].length,
        'Hero Wardrobe': state.allItems['hero-wardrobe'].length,
        'Home Village Decor': state.allItems['home-village-decor'].length,
        'Clan Hall Aesthetics': state.allItems['clan-hall-aesthetics'].length
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
    
    let filterHTML = '';
    
    if (categoryId === 'cosmetic-compendium') {
        filterHTML = `
            <button class="filter-btn active" data-type-filter="all">All Items</button>
            <button class="filter-btn" data-type-filter="heroskin">Hero Skins</button>
            <button class="filter-btn" data-type-filter="scenery">Sceneries</button>
            <button class="filter-btn" data-type-filter="obstacle">Obstacles</button>
            <button class="filter-btn" data-type-filter="decoration">Decorations</button>
            <button class="filter-btn" data-type-filter="clan">Clan House Parts</button>
        `;
    } else if (categoryId === 'hero-wardrobe') {
        filterHTML = '<button class="filter-btn active" data-type-filter="heroskin" disabled style="opacity: 0.7; cursor: not-allowed;">Hero Skins</button>';
    } else if (categoryId === 'clan-hall-aesthetics') {
        filterHTML = '<button class="filter-btn active" data-type-filter="clan" disabled style="opacity: 0.7; cursor: not-allowed;">Clan Items</button>';
    } else {
        filterHTML = `
            <button class="filter-btn active" data-type-filter="both">Both</button>
            <button class="filter-btn" data-type-filter="decoration">Decorations</button>
            <button class="filter-btn" data-type-filter="obstacle">Obstacles</button>
            <button class="filter-btn" data-type-filter="scenery">Sceneries</button>
        `;
    }
    
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
function createItemCard(item) {
    const container = document.createElement("div");
    container.className = "item-card-container";
    
    const card = document.createElement("div");
    card.className = `item-card rarity-${item.rarity} type-${item.type}`;
    if (state.hasUserData && !item.owned) card.classList.add("grayscale");

    let typeBadgeText = '';
    if (item.type === 'decoration') typeBadgeText = 'Decoration';
    else if (item.type === 'obstacle') typeBadgeText = 'Obstacle';
    else if (item.type === 'heroskin') typeBadgeText = 'Hero Skin';
    else if (item.type === 'scenery') typeBadgeText = 'Scenery';
    else if (item.type === 'clan') typeBadgeText = 'Clan Item';
    else typeBadgeText = item.category;

    const ownershipBadge = state.hasUserData ? `
        <div class="item-status-badge ${item.owned ? 'owned' : 'missing'}">
            ${item.owned ? '✓ Owned' : '✕ Missing'}
        </div>
    ` : '';

    // Front of card
    const frontHTML = `
        <div class="item-card-front">
            ${ownershipBadge}
            <div class="item-type-badge ${item.type}">
                ${typeBadgeText}
            </div>
            <div class="item-image-container">
                <img src="${item.image}" class="item-image" loading="lazy" alt="${item.name}">
            </div>
            <div class="item-info">
                <h3>${item.name}</h3>
                <p>${item.category}</p>
            </div>
        </div>
    `;

    // Back of card with details
    const backHTML = `
        <div class="item-card-back">
            <button class="item-close-btn" onclick="event.stopPropagation(); this.closest('.item-card').classList.remove('flipped');">×</button>
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
    
    // Add click handler to flip card
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

    list.innerHTML = "";
    count.textContent = items.length;

    if (!items.length) {
        msg.style.display = "block";
        return;
    }
    msg.style.display = "none";

    items.forEach(i => list.appendChild(createItemCard(i)));
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
        <div class="stat-item"><div class="stat-value">${owned}</div><div>Owned</div></div>
        <div class="stat-item"><div class="stat-value">${total}</div><div>Total Items</div></div>
        <div class="stat-item">
            <div class="stat-value">${pct}%</div>
            <div>Complete</div>
            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
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
        updateUI();
    } else {
        showToast("Invalid JSON", result.message, "error");
    }
}

function handleDataClear() {
    state.userOwnedCodes = new Set();
    state.items = state.items.map(i => ({ ...i, owned: false }));
    state.hasUserData = false;
    sessionStorage.removeItem('userCollectionData');
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
// INITIALIZE APP
// ============================================
document.addEventListener("DOMContentLoaded", async () => {
    console.log("Loading JSON data...");
    await loadAllMasterData();
    
    const userCollectionData = sessionStorage.getItem('userCollectionData');
    
    if (userCollectionData) {
        try {
            const parsed = JSON.parse(userCollectionData);
            const result = parseUserData(JSON.stringify(parsed));
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

    // Search
    const searchInput = document.getElementById("search-input");
    if (searchInput) {
        searchInput.addEventListener("input", e => {
            state.searchQuery = e.target.value;
            updateUI();
        });
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
        uploadBtn.addEventListener("click", () => openModal("upload-modal"));
    }
    
    const analyzeBtn = document.getElementById("analyze-btn");
    if (analyzeBtn) {
        analyzeBtn.addEventListener("click", handleDataUpload);
    }
    
    const clearDataBtn = document.getElementById("clear-data-btn");
    if (clearDataBtn) {
        clearDataBtn.addEventListener("click", handleDataClear);
    }
});

// ============================================
// UTILITY FUNCTIONS
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
// MODAL & FILTER EVENT HANDLERS
// ============================================
document.addEventListener("DOMContentLoaded", () => {
    // Modal close buttons
    document.querySelectorAll(".modal-close-btn").forEach(btn => {
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

    // Sync mobile search
    const mobileSearchInput = document.getElementById("mobile-search-input");
    if (mobileSearchInput) {
        mobileSearchInput.addEventListener("input", e => {
            state.searchQuery = e.target.value;
            const desktopSearch = document.getElementById("search-input");
            if (desktopSearch) {
                desktopSearch.value = e.target.value;
            }
            updateUI();
        });
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