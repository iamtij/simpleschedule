const axios = require('axios');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const N8N_WEBHOOK_URL = process.env.N8N_TELEGRAM_WEBHOOK_URL;

class TelegramService {
    constructor() {
        this.enabled = !!(TELEGRAM_BOT_TOKEN && N8N_WEBHOOK_URL);
        if (!this.enabled) {
            console.warn('Telegram integration disabled: missing configuration');
        }
    }

    async sendMessage(chatId, text, options = {}) {
        if (!this.enabled) return null;
        
        try {
            const response = await axios.post(`${TELEGRAM_API_URL}/sendMessage`, {
                chat_id: chatId,
                text: text,
                parse_mode: 'HTML',
                ...options
            });
            return response.data;
        } catch (error) {
            console.error('Telegram send message error:', error.response?.data || error.message);
            return null;
        }
    }

    async sendBookingNotification(booking, host, chatId) {
        if (!this.enabled || !chatId) return null;

        const meetingLink = host.meeting_link || host.zoom_link || host.gmeet_link;
        const message = `
🗓️ <b>Booking Confirmed!</b>

📅 Date: ${this.formatDate(booking.date)}
⏰ Time: ${this.formatTime(booking.start_time)}
👤 Client: ${booking.client_name}
${booking.client_email ? `📧 Email: ${booking.client_email}` : ''}
${booking.client_phone ? `📱 Phone: ${booking.client_phone}` : ''}
${meetingLink ? `🔗 Meeting Link: ${meetingLink}` : ''}

${booking.notes ? `📝 Notes: ${booking.notes}` : ''}
`.trim();

        const keyboard = {
            inline_keyboard: [[
                { text: '✅ Confirm', callback_data: `confirm_${booking.id}` },
                { text: '✏️ Reschedule', callback_data: `reschedule_${booking.id}` },
                { text: '❌ Cancel', callback_data: `cancel_${booking.id}` }
            ]]
        };

        return this.sendMessage(chatId, message, { reply_markup: keyboard });
    }

    async sendBookingReminder(booking, host, chatId, hoursUntil) {
        if (!this.enabled || !chatId) return null;

        const meetingLink = host.meeting_link || host.zoom_link || host.gmeet_link;
        const message = `
⏰ <b>Meeting Reminder</b>

Your meeting with ${booking.client_name} starts in ${hoursUntil} hour${hoursUntil > 1 ? 's' : ''}!

📅 Date: ${this.formatDate(booking.date)}
⏰ Time: ${this.formatTime(booking.start_time)}
${meetingLink ? `🔗 Join: ${meetingLink}` : ''}
`.trim();

        return this.sendMessage(chatId, message);
    }

    async sendContactNotification(contact, user, chatId, action) {
        if (!this.enabled || !chatId) return null;

        const actionText = {
            'created': '➕ New Contact Added',
            'updated': '✏️ Contact Updated',
            'interaction': '💬 New Interaction Logged'
        }[action] || 'Contact Update';

        const message = `
${actionText}

👤 <b>${contact.name}</b>
${contact.company ? `🏢 ${contact.company}` : ''}
${contact.position ? `💼 ${contact.position}` : ''}
📊 Status: ${this.formatStatus(contact.status)}
⭐ Referral: ${contact.referral_potential}/5

<a href="${process.env.APP_URL}/contacts/${contact.id}">View Contact</a>
`.trim();

        return this.sendMessage(chatId, message);
    }

    formatDate(date) {
        return new Date(date).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
    }

    formatTime(time) {
        const [hours, minutes] = time.split(':');
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        return `${hour12}:${minutes} ${ampm}`;
    }

    formatStatus(status) {
        const statusMap = {
            'new_lead': 'New Lead',
            'qualified_lead': 'Qualified Lead',
            'warm_prospect': 'Warm Prospect',
            'hot_prospect': 'Hot Prospect'
        };
        return statusMap[status] || status;
    }
}

module.exports = new TelegramService();
