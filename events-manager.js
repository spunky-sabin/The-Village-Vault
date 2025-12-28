/**
 * Clash of Clans Events Manager
 * Dynamically handles in-game events with repeating (monthly/weekly) and one-time configurations
 * All times are in UTC to match Clash of Clans official event timing (08:00 UTC)
 * 
 * @module EventsManager
 * @version 2.0.0 - UTC Implementation
 */

class EventsManager {
    constructor() {
        this.eventsConfig = null;
        this.cachedActiveEvents = null;
        this.lastUpdateTime = null;
    }

    /**
     * Load events configuration from JSON file or object
     * @param {string|object} source - URL to JSON file or events config object
     * @returns {Promise<void>}
     */
    async loadEvents(source) {
        try {
            if (typeof source === 'string') {
                const response = await fetch(source);
                if (!response.ok) {
                    throw new Error(`Failed to load events: ${response.statusText}`);
                }
                this.eventsConfig = await response.json();
            } else {
                this.eventsConfig = source;
            }

            this.validateConfig();
            console.log('Events configuration loaded successfully');
        } catch (error) {
            console.error('Error loading events configuration:', error);
            throw error;
        }
    }

    /**
     * Validate the events configuration structure
     * @private
     */
    validateConfig() {
        if (!this.eventsConfig) {
            throw new Error('Events configuration is empty');
        }

        if (!this.eventsConfig.repeating_events && !this.eventsConfig.one_time_events) {
            throw new Error('Configuration must have repeating_events or one_time_events');
        }

        // Validate repeating events
        if (this.eventsConfig.repeating_events) {
            this.eventsConfig.repeating_events.forEach((event, index) => {
                if (!event.title || !event.modifier || !event.baseDate || event.durationDays === undefined) {
                    throw new Error(`Invalid repeating event at index ${index}`);
                }
            });
        }

        // Validate one-time events
        if (this.eventsConfig.one_time_events) {
            this.eventsConfig.one_time_events.forEach((event, index) => {
                if (!event.title || !event.start || !event.end) {
                    throw new Error(`Invalid one-time event at index ${index}`);
                }
            });
        }
    }

    /**
     * Calculate start and end dates for a repeating event
     * @private
     * @param {object} event - The repeating event configuration
     * @param {Date} referenceDate - The current date/time
     * @returns {object} Object with start and end Date objects
     */
    calculateRepeatingEventDates(event, referenceDate = new Date()) {
        const { baseDate, modifier, durationDays } = event;

        if (modifier === 'monthly') {
            return this.calculateMonthlyEvent(baseDate, durationDays, referenceDate);
        } else if (modifier === 'weekly') {
            return this.calculateWeeklyEvent(baseDate, durationDays, referenceDate);
        } else {
            throw new Error(`Unknown modifier: ${modifier}`);
        }
    }

    /**
     * Calculate monthly repeating event dates using UTC time
     * Events start at 08:00 UTC on the specified day of month
     * @private
     * @param {string} baseDate - Day of month (e.g., "01", "15", "22")
     * @param {number} durationDays - How many days the event lasts
     * @param {Date} referenceDate - Current date
     * @returns {object} Object with start and end dates in UTC
     */
    calculateMonthlyEvent(baseDate, durationDays, referenceDate) {
        const dayOfMonth = parseInt(baseDate, 10);
        const currentDate = new Date(referenceDate);

        // Get current UTC date components
        const currentYear = currentDate.getUTCFullYear();
        const currentMonth = currentDate.getUTCMonth();
        const currentDay = currentDate.getUTCDate();

        // Start with this month's occurrence at 08:00 UTC
        let startDate = new Date(Date.UTC(currentYear, currentMonth, dayOfMonth, 8, 0, 0, 0));

        // If the event day hasn't occurred yet this month, use this month
        // If it has passed and we're still within the event duration, keep this month's date
        // If it has completely passed, move to next month
        if (currentDay < dayOfMonth) {
            // Event hasn't started this month yet
            startDate = new Date(Date.UTC(currentYear, currentMonth, dayOfMonth, 8, 0, 0, 0));
        } else {
            // Check if we're still within the current month's event duration
            const potentialStart = new Date(Date.UTC(currentYear, currentMonth, dayOfMonth, 8, 0, 0, 0));
            const potentialEnd = new Date(potentialStart);
            potentialEnd.setUTCDate(potentialEnd.getUTCDate() + durationDays);

            if (currentDate >= potentialStart && currentDate < potentialEnd) {
                // We're within the current event
                startDate = potentialStart;
            } else {
                // Event has passed, calculate next month's occurrence
                startDate = new Date(Date.UTC(currentYear, currentMonth + 1, dayOfMonth, 8, 0, 0, 0));
            }
        }

        const endDate = new Date(startDate);
        endDate.setUTCDate(endDate.getUTCDate() + durationDays);

        return { start: startDate, end: endDate };
    }

    /**
     * Calculate weekly repeating event dates using UTC time
     * Events start at 08:00 UTC on the specified day of week
     * @private
     * @param {string} baseDate - Day of week (e.g., "Monday", "Friday")
     * @param {number} durationDays - How many days the event lasts
     * @param {Date} referenceDate - Current date
     * @returns {object} Object with start and end dates in UTC
     */
    calculateWeeklyEvent(baseDate, durationDays, referenceDate) {
        const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const targetDay = daysOfWeek.indexOf(baseDate);

        if (targetDay === -1) {
            throw new Error(`Invalid day of week: ${baseDate}`);
        }

        const currentDate = new Date(referenceDate);

        // Get current UTC day of week
        const currentDay = currentDate.getUTCDay();

        // Calculate days until target day
        let daysUntilTarget = targetDay - currentDay;

        // IMPORTANT: Check if the PREVIOUS week's event is still active
        // This handles events that span across week boundaries (e.g., Fri-Mon Raid Weekend active on Sunday)
        // daysSinceTarget is how many days ago the target day occurred (0 for today, 1 for yesterday, etc.)
        const daysSinceTarget = (currentDay - targetDay + 7) % 7; // Days since target day, 0-6

        if (daysSinceTarget > 0 && daysSinceTarget <= durationDays) {
            // Calculate last week's start
            const lastWeekStart = new Date(currentDate);
            lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - daysSinceTarget);
            lastWeekStart.setUTCHours(8, 0, 0, 0);

            const lastWeekEnd = new Date(lastWeekStart);
            lastWeekEnd.setUTCDate(lastWeekEnd.getUTCDate() + durationDays);

            // Check if we're still within last week's event
            if (currentDate >= lastWeekStart && currentDate < lastWeekEnd) {
                return { start: lastWeekStart, end: lastWeekEnd };
            }
        }

        // If not in a previous event, calculate the next occurrence
        // If target day is today or in the past this week, move to next week
        if (daysUntilTarget <= 0) {
            daysUntilTarget += 7;
        }

        const startDate = new Date(currentDate);
        startDate.setUTCDate(startDate.getUTCDate() + daysUntilTarget);
        startDate.setUTCHours(8, 0, 0, 0);

        const endDate = new Date(startDate);
        endDate.setUTCDate(endDate.getUTCDate() + durationDays);

        return { start: startDate, end: endDate };
    }

    /**
     * Calculate countdown values for an event
     * @private
     * @param {Date} endDate - When the event ends
     * @param {Date} currentDate - Current date/time
     * @returns {object} Countdown object with days, hours, minutes, seconds
     */
    calculateCountdown(endDate, currentDate = new Date()) {
        const timeRemaining = endDate.getTime() - currentDate.getTime();

        if (timeRemaining <= 0) {
            return { days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 };
        }

        const days = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
        const hours = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);

        return {
            days,
            hours,
            minutes,
            seconds,
            totalMs: timeRemaining
        };
    }

    /**
     * Format countdown as human-readable string
     * @param {object} countdown - Countdown object
     * @returns {string} Formatted string (e.g., "2d 4h" or "5h 30m")
     */
    formatCountdown(countdown) {
        if (countdown.days > 0) {
            return `${countdown.days}d ${countdown.hours}h`;
        } else if (countdown.hours > 0) {
            return `${countdown.hours}h ${countdown.minutes}m`;
        } else if (countdown.minutes > 0) {
            return `${countdown.minutes}m ${countdown.seconds}s`;
        } else {
            return `${countdown.seconds}s`;
        }
    }

    /**
     * Get all currently active events
     * @param {Date} currentDate - Optional current date for testing
     * @param {boolean} forceRefresh - Force recalculation even if cached
     * @returns {Array} Array of active event objects
     */
    getActiveEvents(currentDate = new Date(), forceRefresh = false) {
        if (!this.eventsConfig) {
            console.warn('Events configuration not loaded');
            return [];
        }

        // Check cache (refresh every second)
        if (!forceRefresh && this.cachedActiveEvents && this.lastUpdateTime) {
            const timeSinceUpdate = currentDate.getTime() - this.lastUpdateTime;
            if (timeSinceUpdate < 1000) {
                return this.cachedActiveEvents;
            }
        }

        const activeEvents = [];

        // Process repeating events
        if (this.eventsConfig.repeating_events) {
            this.eventsConfig.repeating_events.forEach(event => {
                if (event.active === false) return;

                try {
                    const { start, end } = this.calculateRepeatingEventDates(event, currentDate);

                    // Check if event is currently active
                    if (currentDate >= start && currentDate < end) {
                        const countdown = this.calculateCountdown(end, currentDate);
                        activeEvents.push({
                            title: event.title,
                            icon: event.icon,
                            image: event.image || null,
                            description: event.description || '',
                            type: 'repeating',
                            modifier: event.modifier,
                            start: start,
                            end: end,
                            countdown: countdown,
                            countdownText: this.formatCountdown(countdown)
                        });
                    }
                } catch (error) {
                    console.error(`Error processing repeating event "${event.title}":`, error);
                }
            });
        }

        // Process one-time events
        if (this.eventsConfig.one_time_events) {
            this.eventsConfig.one_time_events.forEach(event => {
                if (event.active === false) return;

                try {
                    const start = new Date(event.start);
                    const end = new Date(event.end);

                    // Check if event is currently active
                    if (currentDate >= start && currentDate < end) {
                        const countdown = this.calculateCountdown(end, currentDate);
                        activeEvents.push({
                            title: event.title,
                            icon: event.icon,
                            image: event.image || null,
                            description: event.description || '',
                            type: 'one-time',
                            start: start,
                            end: end,
                            countdown: countdown,
                            countdownText: this.formatCountdown(countdown)
                        });
                    }
                } catch (error) {
                    console.error(`Error processing one-time event "${event.title}":`, error);
                }
            });
        }

        // Sort by end time (events ending soonest first)
        activeEvents.sort((a, b) => a.countdown.totalMs - b.countdown.totalMs);

        // Cache results
        this.cachedActiveEvents = activeEvents;
        this.lastUpdateTime = currentDate.getTime();

        return activeEvents;
    }

    /**
     * Get all upcoming events (next 30 days)
     * @param {Date} currentDate - Optional current date for testing
     * @param {number} daysAhead - How many days to look ahead
     * @returns {Array} Array of upcoming event objects
     */
    getUpcomingEvents(currentDate = new Date(), daysAhead = 30) {
        if (!this.eventsConfig) {
            console.warn('Events configuration not loaded');
            return [];
        }

        const upcomingEvents = [];
        const endDate = new Date(currentDate);
        endDate.setDate(endDate.getDate() + daysAhead);

        // Process repeating events
        if (this.eventsConfig.repeating_events) {
            this.eventsConfig.repeating_events.forEach(event => {
                if (event.active === false) return;

                try {
                    const { start, end } = this.calculateRepeatingEventDates(event, currentDate);

                    // Check if event falls within the upcoming period
                    if (start < endDate) {
                        upcomingEvents.push({
                            title: event.title,
                            icon: event.icon,
                            image: event.image || null,
                            description: event.description || '',
                            type: 'repeating',
                            modifier: event.modifier,
                            start: start,
                            end: end,
                            isActive: currentDate >= start && currentDate < end
                        });
                    }
                } catch (error) {
                    console.error(`Error processing repeating event "${event.title}":`, error);
                }
            });
        }

        // Process one-time events
        if (this.eventsConfig.one_time_events) {
            this.eventsConfig.one_time_events.forEach(event => {
                if (event.active === false) return;

                try {
                    const start = new Date(event.start);
                    const end = new Date(event.end);

                    // Check if event falls within the upcoming period
                    if (start < endDate && end > currentDate) {
                        upcomingEvents.push({
                            title: event.title,
                            icon: event.icon,
                            image: event.image || null,
                            description: event.description || '',
                            type: 'one-time',
                            start: start,
                            end: end,
                            isActive: currentDate >= start && currentDate < end
                        });
                    }
                } catch (error) {
                    console.error(`Error processing one-time event "${event.title}":`, error);
                }
            });
        }

        // Sort by start time
        upcomingEvents.sort((a, b) => a.start.getTime() - b.start.getTime());
        return upcomingEvents;
    }

    /**
     * Get calendar entries for a specific month (START and END dates only)
     * @param {number} year - Year
     * @param {number} month - Month (0-11)
     * @returns {Array} Array of calendar day objects with start/end markers
     */
    getCalendarForMonth(year, month) {
        if (!this.eventsConfig) {
            console.warn('Events configuration not loaded');
            return [];
        }

        const calendarEntries = [];

        // Get all events for this month (using UTC)
        const monthStart = new Date(Date.UTC(year, month, 1, 0, 0, 0));
        const monthEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59));

        // Process repeating events
        if (this.eventsConfig.repeating_events) {
            this.eventsConfig.repeating_events.forEach(event => {
                if (event.active === false) return;

                try {
                    if (event.modifier === 'monthly') {
                        // Monthly events - calculate once for the month
                        const { start, end } = this.calculateRepeatingEventDates(event, monthStart);

                        if (end > monthStart && start <= monthEnd) {
                            // Add START marker
                            const startDay = start.getUTCDate();
                            if (start >= monthStart) {
                                calendarEntries.push({
                                    date: startDay,
                                    fullDate: new Date(start),
                                    title: event.title,
                                    icon: event.icon,
                                    type: 'repeating',
                                    isStart: true,
                                    isEnd: false
                                });
                            }

                            // Add END marker
                            const endDay = end.getUTCDate();
                            if (end <= monthEnd) {
                                calendarEntries.push({
                                    date: endDay,
                                    fullDate: new Date(end),
                                    title: event.title,
                                    icon: event.icon,
                                    type: 'repeating',
                                    isStart: false,
                                    isEnd: true
                                });
                            }
                        }
                    } else if (event.modifier === 'weekly') {
                        // Weekly events - need to find ALL occurrences in the month
                        let searchDate = new Date(monthStart);

                        // Search through the entire month
                        while (searchDate <= monthEnd) {
                            const { start, end } = this.calculateRepeatingEventDates(event, searchDate);

                            // Check if this occurrence overlaps with our month
                            if (end > monthStart && start <= monthEnd) {
                                // Add START marker
                                const startDay = start.getUTCDate();
                                if (start >= monthStart && start <= monthEnd) {
                                    calendarEntries.push({
                                        date: startDay,
                                        fullDate: new Date(start),
                                        title: event.title,
                                        icon: event.icon,
                                        type: 'repeating',
                                        isStart: true,
                                        isEnd: false
                                    });
                                }

                                // Add END marker
                                const endDay = end.getUTCDate();
                                if (end >= monthStart && end <= monthEnd) {
                                    calendarEntries.push({
                                        date: endDay,
                                        fullDate: new Date(end),
                                        title: event.title,
                                        icon: event.icon,
                                        type: 'repeating',
                                        isStart: false,
                                        isEnd: true
                                    });
                                }
                            }

                            // Move search forward by 7 days to find next weekly occurrence
                            searchDate.setUTCDate(searchDate.getUTCDate() + 7);
                        }
                    }
                } catch (error) {
                    console.error(`Error processing repeating event "${event.title}" for calendar:`, error);
                }
            });
        }

        // Process one-time events
        if (this.eventsConfig.one_time_events) {
            this.eventsConfig.one_time_events.forEach(event => {
                if (event.active === false) return;

                try {
                    const start = new Date(event.start);
                    const end = new Date(event.end);

                    // Check if event overlaps with our month
                    if (end > monthStart && start <= monthEnd) {
                        // Add START marker
                        const startDay = start.getUTCDate();
                        if (start >= monthStart && start <= monthEnd) {
                            calendarEntries.push({
                                date: startDay,
                                fullDate: new Date(start),
                                title: event.title,
                                icon: event.icon,
                                type: 'one-time',
                                isStart: true,
                                isEnd: false
                            });
                        }

                        // Add END marker
                        const endDay = end.getUTCDate();
                        if (end >= monthStart && end <= monthEnd) {
                            calendarEntries.push({
                                date: endDay,
                                fullDate: new Date(end),
                                title: event.title,
                                icon: event.icon,
                                type: 'one-time',
                                isStart: false,
                                isEnd: true
                            });
                        }
                    }
                } catch (error) {
                    console.error(`Error processing one-time event "${event.title}" for calendar:`, error);
                }
            });
        }

        return calendarEntries;
    }

    /**
     * Check if a specific event is currently active
     * @param {string} eventTitle - Title of the event to check
     * @param {Date} currentDate - Optional current date for testing
     * @returns {boolean} True if event is active
     */
    isEventActive(eventTitle, currentDate = new Date()) {
        const activeEvents = this.getActiveEvents(currentDate);
        return activeEvents.some(event => event.title === eventTitle);
    }
}

// Create singleton instance
const eventsManager = new EventsManager();

// Export for use in browser or Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EventsManager, eventsManager };
} else {
    window.EventsManager = EventsManager;
    window.eventsManager = eventsManager;
}
