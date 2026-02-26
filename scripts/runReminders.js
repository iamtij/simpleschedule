#!/usr/bin/env node
/**
 * Railway Cron: 30-min-before reminders (email + SMS for Pro)
 * Run: node scripts/runReminders.js
 * Schedule: every 15 min (e.g. 0,15,30,45)
 *
 * Uses 15-45 min window so multiple cron runs overlap; dedup prevents duplicates.
 */
require('dotenv').config();

const db = require('../db');
const mailService = require('../services/mail');
const smsService = require('../services/sms');
const timezone = require('../utils/timezone');

// Send when appointment is 15-45 min away (multiple cron runs overlap)
const WINDOW_START_MINUTES = 15;  // latest: 15 min before appt
const WINDOW_END_MINUTES = 45;    // earliest: 45 min before appt

let reminderColumnsCache = null;

function normalizeTime(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') {
        return '';
    }
    const [hours = '00', minutes = '00'] = timeStr.split(':');
    return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
}

function formatTime12Hour(timeStr) {
    if (!timeStr) return '';
    const [hoursStr, minutesStr = '00'] = timeStr.split(':');
    const hours = parseInt(hoursStr, 10);
    const minutes = parseInt(minutesStr, 10);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return timeStr;
    const suffix = hours >= 12 ? 'PM' : 'AM';
    const hour12 = ((hours + 11) % 12) + 1;
    return `${hour12}:${minutes.toString().padStart(2, '0')} ${suffix}`;
}

function getHostDisplayName(row) {
    return row.host_display_name || row.host_full_name || row.host_name || row.username;
}

function getBookingDateStr(row) {
    if (typeof row.date_str === 'string' && row.date_str.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(row.date_str)) {
        return row.date_str;
    }
    if (typeof row.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
        return row.date;
    }
    const d = row.date instanceof Date && !Number.isNaN(row.date.getTime()) ? row.date : null;
    if (d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
    return null;
}

function computeBookingStartUtc(row) {
    const dateStr = getBookingDateStr(row);
    if (!dateStr) return null;
    const normalizedStartTime = normalizeTime(row.start_time);
    if (!normalizedStartTime) return null;
    const userTimezone = timezone.getUserTimezone(row.timezone);
    return timezone.localToUtc(dateStr, normalizedStartTime, userTimezone);
}

async function checkReminderColumnsExist() {
    if (reminderColumnsCache !== null) return reminderColumnsCache;
    try {
        const result = await db.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'bookings'
            AND column_name IN ('client_reminder_30_sent', 'host_reminder_30_sent')
        `);
        const existingColumns = new Set(result.rows.map(r => r.column_name));
        reminderColumnsCache = {
            client_reminder_30_sent: existingColumns.has('client_reminder_30_sent'),
            host_reminder_30_sent: existingColumns.has('host_reminder_30_sent')
        };
        return reminderColumnsCache;
    } catch (error) {
        reminderColumnsCache = { client_reminder_30_sent: false, host_reminder_30_sent: false };
        return reminderColumnsCache;
    }
}

async function fetchCandidateBookings() {
    const columnsExist = await checkReminderColumnsExist();
    let reminderColumns = '';
    let reminderWhereClause = '';
    if (columnsExist.client_reminder_30_sent && columnsExist.host_reminder_30_sent) {
        reminderColumns = `
            COALESCE(b.client_reminder_30_sent, FALSE) AS client_reminder_30_sent,
            COALESCE(b.host_reminder_30_sent, FALSE) AS host_reminder_30_sent,
        `;
        reminderWhereClause = `
          AND (COALESCE(b.client_reminder_30_sent, FALSE) = FALSE OR COALESCE(b.host_reminder_30_sent, FALSE) = FALSE)
        `;
    } else {
        reminderColumns = `
            FALSE AS client_reminder_30_sent,
            FALSE AS host_reminder_30_sent,
        `;
    }
    const query = `
        SELECT
            b.id, b.user_id, b.client_name, b.client_email, b.client_phone,
            b.date, TO_CHAR(b.date, 'YYYY-MM-DD') AS date_str,
            b.start_time, b.end_time, b.notes, b.status, b.confirmation_uuid,
            ${reminderColumns}
            u.email AS host_email, u.username, u.meeting_link, u.timezone,
            u.display_name AS host_display_name, u.full_name AS host_full_name,
            COALESCE(u.display_name, u.full_name, u.username) AS host_name, u.is_pro AS host_is_pro, u.pro_expires_at AS host_pro_expires_at,
            u.sms_phone AS host_sms_phone
        FROM bookings b
        JOIN users u ON u.id = b.user_id
        WHERE b.status != 'cancelled'
          ${reminderWhereClause}
          AND b.date >= (CURRENT_DATE - INTERVAL '1 day')
          AND b.date <= (CURRENT_DATE + INTERVAL '30 day')
    `;
    const result = await db.query(query);
    return result.rows || [];
}

async function processBooking(row, sentCount) {
    const bookingStartUtc = computeBookingStartUtc(row);
    if (!bookingStartUtc) return sentCount;

    const now = new Date();
    const windowStart = new Date(now.getTime() + WINDOW_START_MINUTES * 60 * 1000);
    const windowEnd = new Date(now.getTime() + WINDOW_END_MINUTES * 60 * 1000);

    if (bookingStartUtc < windowStart || bookingStartUtc > windowEnd) {
        return sentCount;
    }

    const normalizedStartTime = normalizeTime(row.start_time);
    const normalizedEndTime = normalizeTime(row.end_time);
    const booking = {
        id: row.id,
        client_name: row.client_name,
        client_email: row.client_email,
        client_phone: row.client_phone,
        date: row.date,
        start_time: normalizedStartTime,
        end_time: normalizedEndTime,
        formatted_start_time: formatTime12Hour(normalizedStartTime),
        formatted_end_time: formatTime12Hour(normalizedEndTime),
        notes: row.notes,
        confirmation_uuid: row.confirmation_uuid
    };

    const host = {
        id: row.user_id,
        name: getHostDisplayName(row),
        full_name: row.host_full_name,
        username: row.username,
        email: row.host_email,
        meeting_link: row.meeting_link,
        is_pro: row.host_is_pro,
        pro_expires_at: row.host_pro_expires_at,
        sms_phone: row.host_sms_phone
    };

    let clientReminderSent = false;
    let hostReminderSent = false;

    try {
        if (!row.client_reminder_30_sent && booking.client_email) {
            await mailService.sendClientReminder(booking, host);
            clientReminderSent = true;
        }
        if (!row.host_reminder_30_sent && host.email) {
            await mailService.sendHostReminder(booking, host);
            hostReminderSent = true;
        }

        if (clientReminderSent || hostReminderSent) {
            try {
                if (clientReminderSent && booking.client_phone) {
                    await smsService.sendClientReminder30MinSMS(booking, host).catch((err) => {
                        console.error('[REMINDERS] Client 30-min SMS failed for booking', booking.id, err?.message || err);
                    });
                }
                if (hostReminderSent && host.sms_phone) {
                    await smsService.sendHostReminder30MinSMS(booking, host).catch((err) => {
                        console.error('[REMINDERS] Host 30-min SMS failed for booking', booking.id, err?.message || err);
                    });
                }
            } catch (err) {
                console.error('[REMINDERS] SMS reminder error for booking', row.id, err?.message || err);
            }

            const columnsExist = await checkReminderColumnsExist();
            if (columnsExist.client_reminder_30_sent && columnsExist.host_reminder_30_sent) {
                await db.query(
                    `UPDATE bookings SET client_reminder_30_sent = $1, host_reminder_30_sent = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
                    [row.client_reminder_30_sent || clientReminderSent, row.host_reminder_30_sent || hostReminderSent, row.id]
                );
            } else {
                await db.query(`UPDATE bookings SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [row.id]);
            }
            return sentCount + 1;
        }
    } catch (error) {
        console.error('[REMINDERS] Failed to send reminder for booking', row.id, error?.message || error);
    }
    return sentCount;
}

async function main() {
    console.log('[REMINDERS] Run started');
    try {
        const candidates = await fetchCandidateBookings();
        console.log('[REMINDERS] Candidates:', candidates.length);

        let sentCount = 0;
        for (const row of candidates) {
            sentCount = await processBooking(row, sentCount);
        }

        console.log('[REMINDERS] Run complete. Sent:', sentCount);
    } catch (error) {
        console.error('[REMINDERS] Run failed:', error?.message || error);
        throw error;
    } finally {
        await db.end();
    }
}

main()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
