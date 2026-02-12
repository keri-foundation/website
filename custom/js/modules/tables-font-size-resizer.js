export function tableFontSizeResizer() {
    console.log("Table font size resizer module loaded");

    // Storage key for font size state
    const STORAGE_KEY = 'table-font-size-state';
    const MIN_FONT_SIZE = 8;
    const MAX_FONT_SIZE = 24;
    const DEFAULT_FONT_SIZE = 16;
    const STEP = 2;

    // Fixed base padding values (in pixels)
    const BASE_PADDING_VERTICAL = 8;   // Top/bottom padding at default size
    const BASE_PADDING_HORIZONTAL = 12; // Left/right padding at default size
    
    // Padding scale configuration
    const MIN_PADDING_SCALE = 0.25;   // At font size 8 (very compact for mobile)
    const MAX_PADDING_SCALE = 1.75;   // At font size 24 (spacious for presentations)

    // Calculate padding scale based on font size
    function calculatePaddingScale(fontSize) {
        // Linear interpolation between min and max
        const ratio = (fontSize - MIN_FONT_SIZE) / (MAX_FONT_SIZE - MIN_FONT_SIZE);
        return MIN_PADDING_SCALE + (ratio * (MAX_PADDING_SCALE - MIN_PADDING_SCALE));
    }

    // Get stored font size from localStorage
    function getStoredFontSize(tableId) {
        const stored = localStorage.getItem(STORAGE_KEY);
        const sizes = stored ? JSON.parse(stored) : {};
        return sizes[tableId] || DEFAULT_FONT_SIZE;
    }

    // Save font size to localStorage
    function saveFontSize(tableId, fontSize) {
        const stored = localStorage.getItem(STORAGE_KEY);
        const sizes = stored ? JSON.parse(stored) : {};
        sizes[tableId] = fontSize;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sizes));
    }

    // Get unique identifier for a table
    function getTableId(table) {
        return table.id || `table-${Array.from(document.querySelectorAll('table')).indexOf(table)}`;
    }

    // Apply font size and padding to table
    function applyFontSize(table, fontSize) {
        const paddingScale = calculatePaddingScale(fontSize);
        
        // Calculate scaled padding from fixed base values
        const paddingVertical = Math.max(1, Math.round(BASE_PADDING_VERTICAL * paddingScale));
        const paddingHorizontal = Math.max(2, Math.round(BASE_PADDING_HORIZONTAL * paddingScale));
        
        table.querySelectorAll('th, td').forEach(cell => {
            cell.style.fontSize = `${fontSize}px`;
            cell.style.padding = `${paddingVertical}px ${paddingHorizontal}px`;
        });
    }

    // Create font size buttons next to reset button
    function createFontSizeButtons(table) {
        const container = table.closest('.wp-block-table, figure.wp-block-table') || table.parentElement;
        
        // Check if buttons already exist
        if (container.querySelector('.wysiwyg-table-font-size-buttons')) {
            return;
        }

        const resetButton = container?.querySelector('.wysiwyg-table-reset-button');

        if (!resetButton) {
            return; // Reset button not found, will try again on next reinit
        }

        const tableId = getTableId(table);
        const currentSize = getStoredFontSize(tableId);

        // Create button container
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'wysiwyg-table-font-size-buttons';
        buttonContainer.style.cssText = 'display: inline-flex; gap: 4px; margin-left: 8px;';

        // Create decrease button
        const decreaseButton = document.createElement('button');
        decreaseButton.className = 'wysiwyg-table-font-size-button wysiwyg-table-font-decrease table-ui-button';
        decreaseButton.type = 'button';
        decreaseButton.setAttribute('aria-label', 'Decrease font size');
        decreaseButton.setAttribute('title', 'Decrease font size');

        const decreaseIcon = document.createElement('i');
        decreaseIcon.className = 'bi bi-dash-circle';

        const decreaseText = document.createElement('span');
        decreaseText.textContent = 'A';

        decreaseButton.appendChild(decreaseText);
        decreaseButton.appendChild(decreaseIcon);

        // Create increase button
        const increaseButton = document.createElement('button');
        increaseButton.className = 'wysiwyg-table-font-size-button wysiwyg-table-font-increase table-ui-button';
        increaseButton.type = 'button';
        increaseButton.setAttribute('aria-label', 'Increase font size');
        increaseButton.setAttribute('title', 'Increase font size');

        const increaseIcon = document.createElement('i');
        increaseIcon.className = 'bi bi-plus-circle';

        const increaseText = document.createElement('span');
        increaseText.textContent = 'A';

        increaseButton.appendChild(increaseText);
        increaseButton.appendChild(increaseIcon);

        // Add buttons to container
        buttonContainer.appendChild(decreaseButton);
        buttonContainer.appendChild(increaseButton);

        // Insert after reset button
        resetButton.parentNode.insertBefore(buttonContainer, resetButton.nextSibling);

        // Apply initial font size
        applyFontSize(table, currentSize);

        // Update button states
        function updateButtonStates(fontSize) {
            decreaseButton.disabled = fontSize <= MIN_FONT_SIZE;
            increaseButton.disabled = fontSize >= MAX_FONT_SIZE;
        }

        updateButtonStates(currentSize);

        // Add click handlers
        decreaseButton.addEventListener('click', (e) => {
            e.preventDefault();
            const currentSize = getStoredFontSize(tableId);
            const newSize = Math.max(MIN_FONT_SIZE, currentSize - STEP);
            applyFontSize(table, newSize);
            saveFontSize(tableId, newSize);
            updateButtonStates(newSize);
        });

        increaseButton.addEventListener('click', (e) => {
            e.preventDefault();
            const currentSize = getStoredFontSize(tableId);
            const newSize = Math.min(MAX_FONT_SIZE, currentSize + STEP);
            applyFontSize(table, newSize);
            saveFontSize(tableId, newSize);
            updateButtonStates(newSize);
        });
    }

    // Initialize all tables on the page
    function initializeAllTables() {
        const tables = document.querySelectorAll('table');
        tables.forEach(table => {
            const tableId = getTableId(table);
            const fontSize = getStoredFontSize(tableId);
            applyFontSize(table, fontSize);
        });
        
        // Defer button creation to allow reset buttons to be added
        setTimeout(() => {
            const tables = document.querySelectorAll('table');
            tables.forEach(table => {
                createFontSizeButtons(table);
            });
        }, 150);
    }

    initializeAllTables();

    // Watch for dynamically added tables and reinitialize
    const observer = new MutationObserver((mutations) => {
        let hasNewTables = false;
        mutations.forEach((mutation) => {
            if (mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) { // Element node
                        if (node.tagName === 'TABLE' || node.querySelector('table')) {
                            hasNewTables = true;
                        }
                    }
                });
            }
        });
        if (hasNewTables) {
            console.log("New tables detected, reinitializing font size controls...");
            initializeAllTables();
        }
    });

    // Start observing the document for added nodes
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}
