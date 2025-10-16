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
        console.error('Error formatting date:', error);
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
        console.error('Error formatting time:', error);
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
        console.error('Error creating date from date/time:', error);
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
        console.error('Error getting current time:', error);
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
        console.error('Error checking if date is in past:', error);
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
        console.error('Error getting day of week:', error);
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
        console.error('Error converting time to minutes:', error);
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
 * Get timezone offset in minutes for a given timezone
 * @param {string} timezone - Timezone identifier
 * @returns {number} Offset in minutes
 */
function getTimezoneOffset(timezone = DEFAULT_TIMEZONE) {
    try {
        const now = new Date();
        const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
        const local = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
        return (local.getTime() - utc.getTime()) / (1000 * 60);
    } catch (error) {
        console.error('Error getting timezone offset:', error);
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
    getTimezoneOffset
};
