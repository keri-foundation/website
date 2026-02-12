export function showHideTableRowsAndColumns() {
    console.log("Tables module loaded");

    // Storage key for collapsed state
    const STORAGE_KEY = 'table-collapsed-state';

    // Get stored state from localStorage
    function getStoredState() {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : { rows: {}, columns: {} };
    }

    // Save state to localStorage
    function saveState(state) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    // Create toggle icon element (uses Bootstrap icons)
    // The icon shows the action that will occur when clicked:
    // - if visible -> icon shows "eye-slash" meaning clicking will hide
    // - if hidden  -> icon shows "eye" meaning clicking will show
    function createEyeIcon(isVisible) {
        const icon = document.createElement('span');
        icon.className = 'table-toggle-icon';
        icon.innerHTML = isVisible
            ? '<i class="bi bi-eye-slash" aria-hidden="true"></i>'
            : '<i class="bi bi-eye" aria-hidden="true"></i>';
        icon.style.cssText = `
            cursor: pointer;
            font-size: 14px;
            padding: 2px;
            user-select: none;
            position: absolute;
            top: 2px;
            left: 2px;
            background: transparent;
            border-radius: 3px;
            z-index: 10;
        `;
        icon.title = isVisible ? 'Hide' : 'Show';
        return icon;
    }

    // Get unique identifier for a table
    function getTableId(table) {
        return table.id || `table-${Array.from(document.querySelectorAll('table')).indexOf(table)}`;
    }

    // Toggle row visibility
    function toggleRow(table, rowIndex, icon, state) {
        const tableId = getTableId(table);
        const rows = table.querySelectorAll('tr');
        const row = rows[rowIndex];

        if (!row) return;

        const isCollapsed = state.rows[tableId]?.[rowIndex];
        const isHeaderRow = rowIndex === 0 || row.querySelector('th');

        // Add transition to row
        row.style.transition = 'height 0.75s ease, max-height 0.75s ease';

        if (isCollapsed) {
            // Expand row
            row.classList.remove('print-hidden-row');
            row.style.height = '';
            row.style.maxHeight = '';
            Array.from(row.cells).forEach((cell, cellIndex) => {
                cell.style.transition = 'height 0.75s ease, max-height 0.75s ease, padding 0.75s ease';
                cell.style.height = '';
                cell.style.maxHeight = '';
                cell.style.padding = '';

                // Restore content visibility for non-header cells
                if (!isHeaderRow && cellIndex > 0) {
                    const content = cell.querySelector('.cell-content-wrapper');
                    if (content) {
                        // Delay showing content until animation completes
                        setTimeout(() => {
                            content.style.transition = 'opacity 0.5s ease';
                            content.style.opacity = '0';
                            content.style.display = '';
                            // Trigger fade-in after display is set
                            setTimeout(() => {
                                content.style.opacity = '1';
                            }, 10);
                        }, 750);
                    }
                }
            });
            // (no rotated-header changes here — rotated headers are per-column)
            // row expanded -> visible, set icon to action=Hide
            icon.innerHTML = '<i class="bi bi-eye-slash" aria-hidden="true"></i>';
            icon.title = 'Hide';

            // Update state
            if (state.rows[tableId]) {
                delete state.rows[tableId][rowIndex];
                if (Object.keys(state.rows[tableId]).length === 0) {
                    delete state.rows[tableId];
                }
            }
        } else {
            // Hide content immediately before collapsing
            Array.from(row.cells).forEach((cell, cellIndex) => {
                const isHeaderRow = rowIndex === 0 || row.querySelector('th');
                if (!isHeaderRow && cellIndex > 0) {
                    const content = cell.querySelector('.cell-content-wrapper');
                    if (content) {
                        content.style.transition = '';
                        content.style.opacity = '0';
                        content.style.display = 'none';
                    }
                }
            });

            // Collapse row
            row.classList.add('print-hidden-row');
            row.style.height = '24px';
            row.style.maxHeight = '24px';
            Array.from(row.cells).forEach((cell, cellIndex) => {
                cell.style.transition = 'height 0.75s ease, max-height 0.75s ease, padding 0.75s ease';
                cell.style.height = '24px';
                cell.style.maxHeight = '24px';
                cell.style.padding = '2px';

                // Hide content for non-header cells (except first cell with icon)
                if (!isHeaderRow && cellIndex > 0) {
                    // Wrap content if not already wrapped
                    if (!cell.querySelector('.cell-content-wrapper')) {
                        const wrapper = document.createElement('span');
                        wrapper.className = 'cell-content-wrapper';
                        wrapper.style.display = 'none';
                        while (cell.firstChild && !cell.firstChild.classList?.contains('table-toggle-icon')) {
                            wrapper.appendChild(cell.firstChild);
                        }
                        cell.appendChild(wrapper);
                    } else {
                        cell.querySelector('.cell-content-wrapper').style.display = 'none';
                    }
                }
            });
            // row collapsed -> hidden, set icon to action=Show
            icon.innerHTML = '<i class="bi bi-eye" aria-hidden="true"></i>';
            icon.title = 'Show';

            // Update state
            if (!state.rows[tableId]) {
                state.rows[tableId] = {};
            }
            state.rows[tableId][rowIndex] = true;
        }

        saveState(state);
    }

    // Reset table to fully visible
    function resetTableVisibility(table) {
        const tableId = getTableId(table);
        const rows = table.querySelectorAll('tr');

        // Get initial state
        let state = getStoredState();

        // Expand all collapsed rows
        if (state.rows[tableId]) {
            const rowIndices = Object.keys(state.rows[tableId]).map(idx => parseInt(idx));
            rowIndices.forEach(rowIndex => {
                const row = rows[rowIndex];
                if (row) {
                    const icon = row.cells[0]?.querySelector('.table-toggle-icon');
                    if (icon) {
                        // Get fresh state for each toggle
                        toggleRow(table, rowIndex, icon, getStoredState());
                    }
                }
            });
        }

        // Refresh state after row changes
        state = getStoredState();

        // Expand all collapsed columns
        if (state.columns[tableId]) {
            const firstRow = rows[0];
            const colIndices = Object.keys(state.columns[tableId]).map(idx => parseInt(idx));
            colIndices.forEach(colIndex => {
                const cell = firstRow?.cells[colIndex];
                if (cell) {
                    const icon = cell.querySelector('.table-toggle-icon');
                    if (icon) {
                        // Get fresh state for each toggle
                        toggleColumn(table, colIndex, icon, getStoredState());
                    }
                }
            });
        }
    }

    // Toggle column visibility
    function toggleColumn(table, colIndex, icon, state) {
        const tableId = getTableId(table);
        const rows = table.querySelectorAll('tr');

        const isCollapsed = state.columns[tableId]?.[colIndex];

        if (isCollapsed) {
            // Expand column
            rows.forEach((row, rowIndex) => {
                const cell = row.cells[colIndex];
                if (cell) {
                    cell.classList.remove('print-hidden-column');
                    cell.style.transition = 'width 0.75s ease, min-width 0.75s ease, max-width 0.75s ease, padding 0.75s ease';
                    cell.style.width = '';
                    cell.style.minWidth = '';
                    cell.style.maxWidth = '';
                    cell.style.padding = '';
                    cell.style.whiteSpace = '';
                    cell.style.overflow = '';
                    cell.style.writingMode = '';
                    cell.style.textOrientation = '';
                    cell.style.transform = '';
                    cell.style.verticalAlign = '';

                    // Restore content visibility for non-header cells
                    const isHeaderRow = rowIndex === 0 || row.querySelector('th');
                    if (isHeaderRow) {
                        // ensure rotated header class is removed when expanding
                        cell.classList.remove('rotated-header');
                    }
                    if (!isHeaderRow) {
                        const content = cell.querySelector('.cell-content-wrapper');
                        if (content) {
                            // Delay showing content until animation completes
                            setTimeout(() => {
                                content.style.transition = 'opacity 0.5s ease';
                                content.style.opacity = '0';
                                content.style.display = '';
                                // Trigger fade-in after display is set
                                setTimeout(() => {
                                    content.style.opacity = '1';
                                }, 10);
                            }, 750);
                        }
                    }
                }
            });
            // column expanded -> visible, set icon to action=Hide
            icon.innerHTML = '<i class="bi bi-eye-slash" aria-hidden="true"></i>';
            icon.title = 'Hide';

            // Update state
            if (state.columns[tableId]) {
                delete state.columns[tableId][colIndex];
                if (Object.keys(state.columns[tableId]).length === 0) {
                    delete state.columns[tableId];
                }
            }
        } else {
            // Hide content immediately before collapsing
            rows.forEach((row, rowIndex) => {
                const cell = row.cells[colIndex];
                if (cell) {
                    const isHeaderRow = rowIndex === 0 || row.querySelector('th');
                    if (!isHeaderRow) {
                        const content = cell.querySelector('.cell-content-wrapper');
                        if (content) {
                            content.style.transition = '';
                            content.style.opacity = '0';
                            content.style.display = 'none';
                        }
                    }
                }
            });

            // Collapse column
            rows.forEach((row, rowIndex) => {
                const cell = row.cells[colIndex];
                if (cell) {
                    cell.classList.add('print-hidden-column');
                    const isHeaderRow = rowIndex === 0 || row.querySelector('th');

                    cell.style.transition = 'width 0.75s ease, min-width 0.75s ease, max-width 0.75s ease, padding 0.75s ease';
                    cell.style.width = '30px';
                    cell.style.minWidth = '30px';
                    cell.style.maxWidth = '30px';
                    cell.style.overflow = 'visible';

                    if (isHeaderRow) {
                        // Rotate header cell content
                        // When rotated, visual "right" = actual "bottom", so reduce bottom padding
                        cell.style.padding = '6px 2px 2px 2px';
                        cell.style.writingMode = 'vertical-rl';
                        cell.style.textOrientation = 'mixed';
                        cell.style.whiteSpace = 'nowrap';
                        cell.style.verticalAlign = 'bottom';
                        // mark rotated so CSS adds spacing to avoid icon overlap
                        cell.classList.add('rotated-header');
                    } else {
                        // Hide content for non-header cells
                        cell.style.padding = '4px 2px';
                        if (!cell.querySelector('.cell-content-wrapper')) {
                            const wrapper = document.createElement('span');
                            wrapper.className = 'cell-content-wrapper';
                            wrapper.style.display = 'none';
                            const icons = cell.querySelectorAll('.table-toggle-icon');
                            while (cell.firstChild) {
                                const child = cell.firstChild;
                                if (!Array.from(icons).includes(child)) {
                                    wrapper.appendChild(child);
                                } else {
                                    break;
                                }
                            }
                            cell.appendChild(wrapper);
                        } else {
                            cell.querySelector('.cell-content-wrapper').style.display = 'none';
                        }
                    }
                }
            });
            // column collapsed -> hidden, set icon to action=Show
            icon.innerHTML = '<i class="bi bi-eye" aria-hidden="true"></i>';
            icon.title = 'Show';

            // Update state
            if (!state.columns[tableId]) {
                state.columns[tableId] = {};
            }
            state.columns[tableId][colIndex] = true;
        }

        saveState(state);
    }

    // Initialize table with toggle icons
    function initializeTable(table) {
        const state = getStoredState();
        const tableId = getTableId(table);
        const rows = table.querySelectorAll('tr');

        if (rows.length === 0) return;

        // Add row toggle icons to first cell of each row (skip first row)
        rows.forEach((row, rowIndex) => {
            // Skip first row
            if (rowIndex === 0) return;

            const firstCell = row.cells[0];
            if (!firstCell) return;

            // Check if icon already exists
            if (firstCell.querySelector('.table-toggle-icon')) return;

            // Make cell position relative for absolute positioning of icon
            firstCell.style.position = 'relative';

            const isCollapsed = state.rows[tableId]?.[rowIndex];
            const icon = createEyeIcon(!isCollapsed);

            // Append icon to the cell
            firstCell.appendChild(icon);

            // Apply collapsed state if stored
            if (isCollapsed) {
                const isHeaderRow = rowIndex === 0 || row.querySelector('th');
                row.classList.add('print-hidden-row');
                row.style.transition = 'height 0.75s ease, max-height 0.75s ease';
                row.style.height = '24px';
                row.style.maxHeight = '24px';
                Array.from(row.cells).forEach((cell, cellIndex) => {
                    cell.style.transition = 'height 0.75s ease, max-height 0.75s ease, padding 0.75s ease';
                    cell.style.height = '24px';
                    cell.style.maxHeight = '24px';
                    cell.style.padding = '2px';

                    // Hide content for non-header cells (except first cell with icon)
                    if (!isHeaderRow && cellIndex > 0) {
                        if (!cell.querySelector('.cell-content-wrapper')) {
                            const wrapper = document.createElement('span');
                            wrapper.className = 'cell-content-wrapper';
                            wrapper.style.display = 'none';
                            while (cell.firstChild && !cell.firstChild.classList?.contains('table-toggle-icon')) {
                                wrapper.appendChild(cell.firstChild);
                            }
                            cell.appendChild(wrapper);
                        } else {
                            cell.querySelector('.cell-content-wrapper').style.display = 'none';
                        }
                    }
                });
            }

            // Add click handler
            icon.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleRow(table, rowIndex, icon, getStoredState());
            });
        });

        // Add column toggle icons to first row cells
        const firstRow = rows[0];
        if (firstRow) {
            Array.from(firstRow.cells).forEach((cell, colIndex) => {
                // Skip if icon already exists
                const icons = cell.querySelectorAll('.table-toggle-icon');
                if (icons.length > 0) return;

                // Make cell position relative for absolute positioning of icon
                cell.style.position = 'relative';

                const isCollapsed = state.columns[tableId]?.[colIndex];
                const icon = createEyeIcon(!isCollapsed);
                // icon.style.left = colIndex === 0 ? '22px' : '2px'; // Offset for first column
                icon.style.left = '2px';

                // Append icon to the cell
                cell.appendChild(icon);

                // Apply collapsed state if stored
                if (isCollapsed) {
                    rows.forEach((row, rowIdx) => {
                        const targetCell = row.cells[colIndex];
                        if (targetCell) {
                            const isHeaderRow = rowIdx === 0 || row.querySelector('th');
                            targetCell.classList.add('print-hidden-column');

                            targetCell.style.transition = 'width 0.75s ease, min-width 0.75s ease, max-width 0.75s ease, padding 0.75s ease';
                            targetCell.style.width = '30px';
                            targetCell.style.minWidth = '30px';
                            targetCell.style.maxWidth = '30px';
                            targetCell.style.overflow = 'visible';

                            if (isHeaderRow) {
                                // Rotate header cell content
                                // When rotated, visual "right" = actual "bottom", so reduce bottom padding
                                // targetCell.style.padding = '6px 2px 2px 2px';
                                targetCell.style.padding = '0';
                                targetCell.style.writingMode = 'vertical-rl';
                                targetCell.style.textOrientation = 'mixed';
                                targetCell.style.whiteSpace = 'nowrap';
                                targetCell.style.verticalAlign = 'bottom';
                                // mark rotated so CSS adds spacing to avoid icon overlap
                                targetCell.classList.add('rotated-header');
                            } else {
                                // Hide content for non-header cells
                                // targetCell.style.padding = '4px 2px';
                                targetCell.style.padding = '0';
                                if (!targetCell.querySelector('.cell-content-wrapper')) {
                                    const wrapper = document.createElement('span');
                                    wrapper.className = 'cell-content-wrapper';
                                    wrapper.style.display = 'none';
                                    const icons = targetCell.querySelectorAll('.table-toggle-icon');
                                    while (targetCell.firstChild) {
                                        const child = targetCell.firstChild;
                                        if (!Array.from(icons).includes(child)) {
                                            wrapper.appendChild(child);
                                        } else {
                                            break;
                                        }
                                    }
                                    targetCell.appendChild(wrapper);
                                } else {
                                    targetCell.querySelector('.cell-content-wrapper').style.display = 'none';
                                }
                            }
                        }
                    });
                }

                // Add click handler
                icon.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleColumn(table, colIndex, icon, getStoredState());
                });
            });
        }
    }

    // Create reset button next to print button
    function createResetButton(table) {
        // Check if reset button already exists
        const container = table.closest('.wp-block-table, figure.wp-block-table') || table.parentElement;
        if (container.querySelector('.wysiwyg-table-reset-button')) {
            return; // Reset button already exists
        }

        const printButton = container?.querySelector('.wysiwyg-table-print-button');

        if (!printButton) {
            return; // Print button not found, will try again on next reinit
        }

        const resetButton = document.createElement('button');
        resetButton.className = 'wysiwyg-table-reset-button table-ui-button';
        resetButton.type = 'button';
        resetButton.setAttribute('aria-label', 'Reset table visibility');
        resetButton.setAttribute('title', 'Show all hidden rows and columns');

        // Add Bootstrap icon
        const icon = document.createElement('i');
        icon.className = 'bi bi-eye';

        // Add button text
        const text = document.createElement('span');
        text.classList.add('visually-hidden');
        text.textContent = 'Reset View';

        resetButton.appendChild(icon);
        resetButton.appendChild(text);

        // Insert after print button
        printButton.parentNode.insertBefore(resetButton, printButton.nextSibling);

        // Add click handler
        resetButton.addEventListener('click', (e) => {
            e.preventDefault();
            resetTableVisibility(table);
        });
    }

    // Initialize all tables on the page
    function initializeAllTables() {
        const tables = document.querySelectorAll('table');
        tables.forEach(table => {
            initializeTable(table);
        });
        // Defer reset button creation to allow print buttons to be added
        setTimeout(() => {
            const tables = document.querySelectorAll('table');
            tables.forEach(table => {
                createResetButton(table);
            });
        }, 100);
    }

    // Add scroll indicators to table containers
    function initializeScrollIndicators() {
        const tableContainers = document.querySelectorAll('.wp-block-table');

        tableContainers.forEach(container => {
            // updateScrollIndicators
            // -----------------------
            // Purpose:
            // - Decide when to show left/right subtle edge shadows on `.wp-block-table`.
            // - These shadows are implemented in CSS pseudo-elements and toggled via
            //   the `.can-scroll-left` and `.can-scroll-right` classes.
            //
            // Key behaviour details:
            // - `isOverflowing`: quick check to ensure content actually overflows.
            // - Thresholding: we use a 1px threshold so the right shadow only appears
            //   when the container is at (or essentially at) the left-most position.
            //   This makes the right hint disappear almost immediately once the user
            //   starts scrolling (prevents a lingering "still hinting" effect).
            // - Left shadow (`can-scroll-left`) appears once the user has scrolled
            //   more than 1px. Right shadow (`can-scroll-right`) is shown only while
            //   `scrollLeft <= 1`.
            //
            // Tuning:
            // - To show both shadows when in the middle of the scrollable area,
            //   change the `showRight` condition to `scrollLeft < (scrollWidth - clientWidth - 1)`.
            // - You can also use a fractional threshold (e.g. 0.5% of overflow) if
            //   you find a fixed pixel value too coarse on very wide screens.
            function updateScrollIndicators() {
                const { scrollLeft, scrollWidth, clientWidth } = container;

                // Only show indicators when content actually overflows
                const isOverflowing = scrollWidth > clientWidth + 1;

                // Show left when user has scrolled beyond 1px. Show right only when
                // at the very left edge (<=1px). This gives the behavior: right hint
                // disappears after ~1px of scroll.
                const showLeft = isOverflowing && scrollLeft > 1;
                const showRight = isOverflowing && scrollLeft <= 1;

                container.classList.toggle('can-scroll-left', showLeft);
                container.classList.toggle('can-scroll-right', showRight);
            }

            // Initial check
            updateScrollIndicators();

            // Update on scroll
            container.addEventListener('scroll', updateScrollIndicators);

            // Update on resize
            window.addEventListener('resize', updateScrollIndicators);
        });
    }

    initializeAllTables();
    initializeScrollIndicators();

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
            console.log("New tables detected, reinitializing...");
            initializeAllTables();
            initializeScrollIndicators();
        }
    });

    // Start observing the document for added nodes
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}