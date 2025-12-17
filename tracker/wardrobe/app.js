// Wardrobe Page - Hero Skins Only
// Initializes with hero-wardrobe category

document.addEventListener("DOMContentLoaded", async () => {
    await initializePage('hero-wardrobe');

    // Show hero filter by default since this page is hero-skins only
    const heroFilterGroup = document.getElementById('hero-filter-group');
    const mobileHeroFilterGroup = document.getElementById('mobile-hero-filter-group');
    if (heroFilterGroup) heroFilterGroup.style.display = 'block';
    if (mobileHeroFilterGroup) mobileHeroFilterGroup.style.display = 'block';
});
