/**
 * Countdown Timer to April 21, 2026
 * Prepends an animated countdown to elements with class "countdown"
 */

export function initCountdown() {
    const countdownElement = document.querySelector('.countdown');
    
    if (!countdownElement) {
        console.warn('No element with class "countdown" found');
        return;
    }

    const targetDate = new Date('April 21, 2026 22:00:00').getTime();

    function updateCountdown() {
        const now = new Date().getTime();
        const distance = targetDate - now;

        if (distance < 0) {
            countdownElement.innerHTML = '<span>The event has started!</span>';
            return;
        }

        // Calculate time units (starting with weeks, no months)
        const weeks = Math.floor(distance / (1000 * 60 * 60 * 24 * 7));
        const days = Math.floor((distance % (1000 * 60 * 60 * 24 * 7)) / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        // Format the countdown text
        const countdownText = `
            <span>
                ${weeks} weeks — ${days} days — ${hours} hours — ${minutes} minutes — ${seconds} seconds
            </span>
        `;

        // Prepend to the element (insert before existing content)
        const existingContent = countdownElement.dataset.originalContent || countdownElement.innerHTML;
        if (!countdownElement.dataset.originalContent) {
            countdownElement.dataset.originalContent = existingContent;
        }
        
        countdownElement.innerHTML = existingContent +countdownText;
    }

    // Update immediately
    updateCountdown();

    // Update every second
    setInterval(updateCountdown, 1000);
}
