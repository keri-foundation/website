import { showHideTableRowsAndColumns } from './modules/tables-show-hide-rows-and-columns.js';
import { tableFontSizeResizer } from './modules/tables-font-size-resizer.js';
import { initCountdown } from './modules/countdown.js';

export function initialize() {
    showHideTableRowsAndColumns();
    tableFontSizeResizer();
    initCountdown();
    console.log("Initialization complete");
}