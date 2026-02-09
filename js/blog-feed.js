document.addEventListener('DOMContentLoaded', () => {
    const BLOG_GRID = document.getElementById('blog-grid');
    const LOADING_INDICATOR = document.getElementById('loading-indicator');
    const PAGINATION_CONTAINER = document.getElementById('pagination-container');
    const LOAD_MORE_BTN = document.getElementById('load-more-btn');
    const FILTER_BTNS = document.querySelectorAll('.filter-btn');

    if (!BLOG_GRID) return;

    // Configuration
    const ITEMS_PER_PAGE = 9;

    let allItems = []; // All item elements
    let filteredItems = []; // Currently visible item elements
    let displayedCount = 0;
    let currentFilter = 'all';

    // Hydrate from DOM
    function hydrate() {
        // Hide loading indicator if it still exists (it shouldn't if build script ran, but good for safety)
        if (LOADING_INDICATOR) LOADING_INDICATOR.style.display = 'none';

        // Get all article cards that were rendered by the build script
        const cards = Array.from(BLOG_GRID.querySelectorAll('.article-card'));

        // Store them in memory and remove from DOM temporarily to manage pagination/filtering
        // Or better: keep them in DOM but toggle display:none? 
        // Approach: Extract them, then re-append based on filter/pagination.

        allItems = cards;

        // Clear grid to prepare for controlled rendering
        // BLOG_GRID.innerHTML = ''; 
        // Actually, for SEO, we want them to remain in the source. 
        // But for "Load More" functionality, we need to hide the ones that overflow.
        // So we will just hide them via CSS/style.

        applyFilter('all');
    }

    // Filter Click Handler
    FILTER_BTNS.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active state
            FILTER_BTNS.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Apply filter
            const filterType = btn.getAttribute('data-filter');
            applyFilter(filterType);
        });
    });

    function applyFilter(filterType) {
        currentFilter = filterType;
        displayedCount = 0;

        // Filter items
        if (filterType === 'all') {
            filteredItems = allItems;
        } else {
            filteredItems = allItems.filter(card => card.getAttribute('data-category') === filterType);
        }

        // Reset display
        allItems.forEach(card => {
            card.style.display = 'none';
        });

        // Show first batch
        showMoreItems();
        updatePagination();
    }

    // Load More Click Handler
    if (LOAD_MORE_BTN) {
        LOAD_MORE_BTN.addEventListener('click', () => {
            showMoreItems();
            updatePagination();
        });
    }

    function showMoreItems() {
        const nextBatch = filteredItems.slice(displayedCount, displayedCount + ITEMS_PER_PAGE);

        nextBatch.forEach(card => {
            card.style.display = 'flex'; // Restore display
            // If we detached them, we would appendChild here. 
            // Since we just hid them, we change style.
            // Ensure they are in the grid. If we haven't removed them from DOM, this is fine.
        });

        displayedCount += nextBatch.length;
    }

    function updatePagination() {
        if (displayedCount >= filteredItems.length) {
            PAGINATION_CONTAINER.style.display = 'none';
        } else {
            PAGINATION_CONTAINER.style.display = 'block';
        }

        // Handle empty state
        if (filteredItems.length === 0) {
            // We could show a message here if needed
        }
    }

    // Initialize
    hydrate();
});

