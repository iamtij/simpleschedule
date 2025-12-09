/**
 * Global Timezone Utility Module
 * 
 * This module provides consistent timezone handling across the application.
 * Currently defaults to Asia/Manila (Philippines) but can be easily extended
 * to support per-user timezone preferences.
 */

const DEFAULT_TIMEZONE = 'Asia/Manila';
const DEFAULT_UTC_OFFSET = '+08:00';

/**
 * Get the default timezone for the application
 * @returns {string} Timezone identifier (e.g., 'Asia/Manila')
 */
function getDefaultTimezone() {
    return DEFAULT_TIMEZONE;
}

/**
 * Get the default UTC offset for the application
 * @returns {string} UTC offset (e.g., '+08:00')
 */
function getDefaultUtcOffset() {
    return DEFAULT_UTC_OFFSET;
}

/**
 * Get user's timezone, falling back to default if not set
 * @param {string|null} userTimezone - User's timezone from database
 * @returns {string} Timezone identifier
 */
function getUserTimezone(userTimezone = null) {
    return userTimezone || DEFAULT_TIMEZONE;
}

/**
 * Format a time string with timezone information
 * @param {string} timeStr - Time string (e.g., '2025-10-17T09:00:00')
 * @param {string} timezone - Timezone to use (optional)
 * @returns {string} Formatted time string with timezone
 */
function formatTimeWithTimezone(timeStr, timezone = DEFAULT_TIMEZONE) {
    if (!timeStr) return timeStr;
    
    // If already has timezone info, return as is
    if (timeStr.includes('+') || timeStr.includes('Z')) {
        return timeStr;
    }
    
    // For Google Calendar API, we need proper ISO format
    // If it's a simple date-time string without timezone, add the offset
    if (timeStr.includes('T') && !timeStr.includes('+') && !timeStr.includes('Z')) {
        return timeStr + DEFAULT_UTC_OFFSET;
    }
    
    // For simple date strings like '2025-10-17', add timezone for day boundaries
    if (timeStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return timeStr + 'T00:00:00' + DEFAULT_UTC_OFFSET;
    }
    
    // For date with time like '2025-10-17T23:59:59', add timezone
    if (timeStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)) {
        return timeStr + DEFAULT_UTC_OFFSET;
    }
    
    return timeStr;
}

/**
 * Convert a Date object to a date string in YYYY-MM-DD format
 * Handles timezone conversion properly
 * @param {Date} date - Date object
 * @param {string} timezone - Target timezone (optional)
 * @returns {string} Date string in YYYY-MM-DD format
 */
function formatDateForDisplay(date, timezone = DEFAULT_TIMEZONE) {
    if (!date) return null;
    
    try {
        // Create a new Date object to avoid mutating the original
        const dateObj = new Date(date);
        
        // Use toLocaleDateString with the specified timezone
        return dateObj.toLocaleDateString('en-CA', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    } catch (error) {
        // Fallback to simple date extraction
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
}

/**
 * Convert a Date object to a time string in HH:MM format
 * @param {Date} date - Date object
 * @param {string} timezone - Target timezone (optional)
 * @returns {string} Time string in HH:MM format
 */
function formatTimeForDisplay(date, timezone = DEFAULT_TIMEZONE) {
    if (!date) return null;
    
    try {
        const dateObj = new Date(date);
        return dateObj.toLocaleTimeString('en-US', {
            timeZone: timezone,
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        // Fallback
        const hours = String(dateObj.getHours()).padStart(2, '0');
        const minutes = String(dateObj.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    }
}

/**
 * Create a Date object from date and time strings, considering timezone
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @param {string} timeStr - Time string in HH:MM format
 * @param {string} timezone - Source timezone (optional)
 * @returns {Date} Date object
 */
function createDateFromDateTime(dateStr, timeStr, timezone = DEFAULT_TIMEZONE) {
    if (!dateStr || !timeStr) return null;
    
    try {
        // Parse the date components
        const [year, month, day] = dateStr.split('-').map(Number);
        const [hours, minutes] = timeStr.split(':').map(Number);
        
        // Create date string in ISO format with timezone
        const isoString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00${DEFAULT_UTC_OFFSET}`;
        
        return new Date(isoString);
    } catch (error) {
        return null;
    }
}

/**
 * Get current time in the specified timezone
 * @param {string} timezone - Target timezone (optional)
 * @returns {Date} Current time in the specified timezone
 */
function getCurrentTime(timezone = DEFAULT_TIMEZONE) {
    try {
        return new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
    } catch (error) {
        return new Date();
    }
}

/**
 * Check if a date is in the past (considering timezone)
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @param {string} timezone - Timezone to use for comparison (optional)
 * @returns {boolean} True if the date is in the past
 */
function isDateInPast(dateStr, timezone = DEFAULT_TIMEZONE) {
    if (!dateStr) return true;
    
    try {
        const [year, month, day] = dateStr.split('-').map(Number);
        const targetDate = new Date(Date.UTC(year, month - 1, day));
        const currentDate = getCurrentTime(timezone);
        
        // Set current date to midnight for comparison
        const today = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
        
        return targetDate < today;
    } catch (error) {
        return true;
    }
}

/**
 * Get day of week (0-6, where 0 is Sunday) for a given date
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @param {string} timezone - Timezone to use (optional)
 * @returns {number} Day of week (0-6)
 */
function getDayOfWeek(dateStr, timezone = DEFAULT_TIMEZONE) {
    if (!dateStr) return 0;
    
    try {
        const [year, month, day] = dateStr.split('-').map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        return date.getUTCDay();
    } catch (error) {
        return 0;
    }
}

/**
 * Convert time to minutes since midnight
 * @param {string} timeStr - Time string in HH:MM format
 * @returns {number} Minutes since midnight
 */
function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    
    try {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    } catch (error) {
        return 0;
    }
}

/**
 * Convert minutes since midnight to time string
 * @param {number} minutes - Minutes since midnight
 * @returns {string} Time string in HH:MM format
 */
function minutesToTime(minutes) {
    if (typeof minutes !== 'number' || minutes < 0) return '00:00';
    
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * Convert a local date/time to UTC Date object
 * Uses a reliable method: create dates in both timezones and calculate the difference
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @param {string} timeStr - Time string in HH:MM format
 * @param {string} timezone - Timezone identifier (e.g., 'Asia/Manila')
 * @returns {Date} Date object in UTC
 */
function localToUtc(dateStr, timeStr, timezone = DEFAULT_TIMEZONE) {
    if (!dateStr || !timeStr) {
        return null;
    }

    try {
        const [year, month, day] = dateStr.split('-').map(Number);
        const [hours, minutes] = timeStr.split(':').map(Number);

        if ([year, month, day, hours, minutes].some(Number.isNaN)) {
            return null;
        }

        // Create a date string in ISO format (without timezone)
        const localISOString = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
        
        // Method: Create a date representing this time, then use Intl API to see what UTC time it corresponds to
        // We'll iterate through possible UTC times to find the one that represents our local time
        
        // Start with an estimate: assume the timezone offset is around +8 hours (480 minutes) for Asia/Manila
        // Create a UTC date that might correspond to our local time
        let estimatedUtcDate = new Date(Date.UTC(year, month - 1, day, hours - 8, minutes, 0));
        
        // Format this UTC date in the target timezone to see what local time it represents
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        
        // Try a few UTC times around our estimate to find the right one
        let bestMatch = null;
        let smallestDiff = Infinity;
        
        // Try UTC times from 12 hours before to 12 hours after our estimate
        for (let hourOffset = -12; hourOffset <= 12; hourOffset++) {
            const testUtcDate = new Date(Date.UTC(year, month - 1, day, hours + hourOffset, minutes, 0));
            const parts = formatter.formatToParts(testUtcDate);
            const tzHour = parseInt(parts.find(p => p.type === 'hour').value);
            const tzMinute = parseInt(parts.find(p => p.type === 'minute').value);
            const tzDay = parseInt(parts.find(p => p.type === 'day').value);
            
            // Check if this UTC time represents our target local time
            // Allow day difference of up to 1 day (timezone can cause day rollover)
            const hourMatch = tzHour === hours;
            const minuteMatch = tzMinute === minutes;
            const dayDiff = Math.abs(tzDay - day);
            const dayMatch = dayDiff <= 1; // Allow same day or adjacent day
            
            if (hourMatch && minuteMatch && dayMatch) {
                return testUtcDate; // Found exact match
            }
            
            // Calculate difference for closest match
            const hourDiff = Math.abs(tzHour - hours);
            const minuteDiff = Math.abs(tzMinute - minutes);
            // For day diff, only count if it's more than 1 day difference
            const dayDiffPenalty = dayDiff > 1 ? (dayDiff - 1) * 24 * 60 : 0;
            const totalDiff = dayDiffPenalty + hourDiff * 60 + minuteDiff;
            
            if (totalDiff < smallestDiff) {
                smallestDiff = totalDiff;
                bestMatch = testUtcDate;
            }
        }
        
        // If we found a close match, use it
        if (bestMatch && smallestDiff < 60) { // Within 1 hour
            return bestMatch;
        }
        
        // Fallback: use the offset calculation method
        const referenceDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));
        const offsetMinutes = getTimezoneOffset(timezone, referenceDate);
        return new Date(referenceDate.getTime() - (offsetMinutes * 60 * 1000));
    } catch (error) {
        console.error('[TIMEZONE] Error converting local to UTC:', error);
        return null;
    }
}

/**
 * Get timezone offset in minutes for a given timezone at a specific date/time
 * Returns positive value for timezones ahead of UTC (e.g., +480 for UTC+8)
 * @param {string} timezone - Timezone identifier (e.g., 'Asia/Manila')
 * @param {Date} referenceDate - Date to calculate offset for (important for DST)
 * @returns {number} Offset in minutes (positive for ahead of UTC, negative for behind)
 */
function getTimezoneOffset(timezone = DEFAULT_TIMEZONE, referenceDate = new Date()) {
    const resolvedTimezone = timezone || DEFAULT_TIMEZONE;

    try {
        const dateInstance = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);

        if (Number.isNaN(dateInstance.getTime())) {
            throw new Error('Invalid reference date provided for timezone offset calculation');
        }

        // Use a reliable method: get what a UTC timestamp represents in the target timezone
        // Then calculate the offset
        
        // Get UTC components
        const utcTime = dateInstance.getTime();
        
        // Get what this UTC time represents in the target timezone
        const tzFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: resolvedTimezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        
        const utcFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'UTC',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        
        const tzParts = tzFormatter.formatToParts(dateInstance);
        const utcParts = utcFormatter.formatToParts(dateInstance);
        
        // Extract time components
        const tzHour = parseInt(tzParts.find(p => p.type === 'hour').value);
        const tzMinute = parseInt(tzParts.find(p => p.type === 'minute').value);
        const tzDay = parseInt(tzParts.find(p => p.type === 'day').value);
        const tzMonth = parseInt(tzParts.find(p => p.type === 'month').value);
        const tzYear = parseInt(tzParts.find(p => p.type === 'year').value);
        
        const utcHour = parseInt(utcParts.find(p => p.type === 'hour').value);
        const utcMinute = parseInt(utcParts.find(p => p.type === 'minute').value);
        const utcDay = parseInt(utcParts.find(p => p.type === 'day').value);
        const utcMonth = parseInt(utcParts.find(p => p.type === 'month').value);
        const utcYear = parseInt(utcParts.find(p => p.type === 'year').value);
        
        // Calculate the difference
        // If timezone is ahead (e.g., UTC+8), tzHour will be larger than utcHour for the same moment
        // Example: 10:00 UTC = 18:00 in UTC+8, so offset = 18 - 10 = 8 hours = +480 minutes
        
        // Calculate total minutes difference, accounting for day rollover
        // Create date objects for easier calculation (using UTC epoch as reference)
        const tzTotalMinutes = tzHour * 60 + tzMinute;
        const utcTotalMinutes = utcHour * 60 + utcMinute;
        
        // Account for day difference
        let dayOffsetMinutes = 0;
        if (tzDay !== utcDay) {
            // If timezone day is different, we need to account for it
            // If tzDay > utcDay, timezone is ahead (next day), so add 24 hours
            // If tzDay < utcDay, timezone is behind (previous day), so subtract 24 hours
            dayOffsetMinutes = (tzDay - utcDay) * 24 * 60;
        }
        
        // Calculate total offset
        // If timezone is ahead, tzTotalMinutes will be larger when accounting for day
        const offsetMinutes = (tzTotalMinutes + dayOffsetMinutes) - utcTotalMinutes;
        
        // Normalize to reasonable range (-12 to +14 hours to handle most timezones)
        // This handles edge cases where day calculation might be off
        let normalizedOffset = offsetMinutes;
        if (normalizedOffset > 14 * 60) {
            normalizedOffset -= 24 * 60;
        } else if (normalizedOffset < -12 * 60) {
            normalizedOffset += 24 * 60;
        }
        
        return normalizedOffset;
    } catch (error) {
        if (resolvedTimezone !== DEFAULT_TIMEZONE) {
            return getTimezoneOffset(DEFAULT_TIMEZONE, referenceDate);
        }

        return 480; // Default to +8 hours (480 minutes) for Asia/Manila
    }
}

module.exports = {
    getDefaultTimezone,
    getDefaultUtcOffset,
    getUserTimezone,
    formatTimeWithTimezone,
    formatDateForDisplay,
    formatTimeForDisplay,
    createDateFromDateTime,
    getCurrentTime,
    isDateInPast,
    getDayOfWeek,
    timeToMinutes,
    minutesToTime,
    getTimezoneOffset,
    localToUtc
};
