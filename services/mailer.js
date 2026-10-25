const FormData = require('form-data');
const Mailgun = require('mailgun.js');

const FROM_NAME = 'ISKED';
const DEFAULT_RESEND_FROM = 'notify@isked.app';

/** @type {{ resendSend?: Function, mailgunCreate?: Function } | null} */
let transportOverrides = null;

function configureTransportForTesting(overrides) {
    transportOverrides = overrides || null;
}

function clearTransportForTesting() {
    transportOverrides = null;
}

function usesResend() {
    return Boolean(process.env.RESEND_API_KEY && String(process.env.RESEND_API_KEY).trim());
}

function mailgunConfigured() {
    return Boolean(process.env.MAILGUN_DOMAIN && process.env.MAILGUN_API_KEY);
}

function isEnabled() {
    return usesResend() || mailgunConfigured();
}

function getProvider() {
    if (usesResend()) {
        return 'resend';
    }
    if (mailgunConfigured()) {
        return 'mailgun';
    }
    return null;
}

function getResendFromAddress() {
    const from = process.env.RESEND_FROM && String(process.env.RESEND_FROM).trim();
    return from || DEFAULT_RESEND_FROM;
}

function formatResendFromHeader() {
    return `${FROM_NAME} <${getResendFromAddress()}>`;
}

function formatMailgunFromHeader(domain) {
    return `isked <postmaster@${domain}>`;
}

function getMailgunClient() {
    const mailgun = new Mailgun(FormData);
    const mgConfig = {
        username: 'api',
        key: process.env.MAILGUN_API_KEY
    };
    if (process.env.MAILGUN_EU === 'true' || process.env.MAILGUN_URL) {
        mgConfig.url = process.env.MAILGUN_URL || 'https://api.eu.mailgun.net';
    }
    return mailgun.client(mgConfig);
}

function normalizeRecipients(to) {
    if (Array.isArray(to)) {
        return to.filter(Boolean).map(String);
    }
    return [String(to)];
}

function formatRfc2822Utc(date) {
    if (!date || !(date instanceof Date) || Number.isNaN(date.getTime())) {
        return null;
    }
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayName = days[date.getUTCDay()];
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = months[date.getUTCMonth()];
    const year = date.getUTCFullYear();
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    return `${dayName}, ${day} ${month} ${year} ${hours}:${minutes}:${seconds} +0000`;
}

function logSendError(provider, context, error) {
    const safeContext = { ...context };
    delete safeContext.apiKey;
    delete safeContext.key;
    console.error(`[MAILER] ${provider} send failed`, {
        ...safeContext,
        message: error?.message || String(error),
        status: error?.statusCode || error?.status || error?.response?.status,
        detail: error?.response?.body || error?.response?.data || error?.error || undefined
    });
}

/**
 * @param {{
 *   to: string | string[],
 *   subject: string,
 *   text: string,
 *   html: string,
 *   replyTo?: string | null,
 *   attachments?: Array<{ filename: string, data: Buffer }>,
 *   scheduledAt?: Date | null,
 * }} payload
 */
async function sendMessage(payload) {
    const provider = getProvider();
    if (!provider) {
        throw new Error('Mail transport is not configured');
    }

    const to = normalizeRecipients(payload.to);
    if (!to.length) {
        throw new Error('At least one recipient is required');
    }

    if (transportOverrides) {
        if (provider === 'resend' && transportOverrides.resendSend) {
            return transportOverrides.resendSend({ ...payload, to, provider });
        }
        if (provider === 'mailgun' && transportOverrides.mailgunCreate) {
            return transportOverrides.mailgunCreate({ ...payload, to, provider });
        }
    }

    if (provider === 'resend') {
        const { Resend } = require('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        const emailPayload = {
            from: formatResendFromHeader(),
            to,
            subject: payload.subject,
            text: payload.text,
            html: payload.html
        };
        if (payload.replyTo && String(payload.replyTo).trim()) {
            emailPayload.reply_to = String(payload.replyTo).trim();
        }
        if (payload.attachments && payload.attachments.length) {
            emailPayload.attachments = payload.attachments.map((att) => ({
                filename: att.filename,
                content: att.data
            }));
        }
        if (payload.scheduledAt instanceof Date && !Number.isNaN(payload.scheduledAt.getTime())) {
            emailPayload.scheduled_at = payload.scheduledAt.toISOString();
        }

        const { data, error } = await resend.emails.send(emailPayload);
        if (error) {
            logSendError('resend', { to, subject: payload.subject }, error);
            const err = new Error(error.message || 'Resend send failed');
            err.provider = 'resend';
            throw err;
        }
        return { id: data?.id, provider: 'resend' };
    }

    const domain = process.env.MAILGUN_DOMAIN;
    const mg = getMailgunClient();
    const messageData = {
        from: formatMailgunFromHeader(domain),
        to,
        subject: payload.subject,
        text: payload.text,
        html: payload.html
    };
    if (payload.replyTo && String(payload.replyTo).trim()) {
        messageData['h:Reply-To'] = String(payload.replyTo).trim();
    }
    if (payload.attachments && payload.attachments.length) {
        messageData.attachment = payload.attachments.map((att) => ({
            filename: att.filename,
            data: att.data
        }));
    }
    if (payload.scheduledAt instanceof Date && !Number.isNaN(payload.scheduledAt.getTime())) {
        const rfc2822 = formatRfc2822Utc(payload.scheduledAt);
        if (rfc2822) {
            messageData['o:deliverytime'] = rfc2822;
        }
    }

    try {
        const result = await mg.messages.create(domain, messageData);
        return { id: result?.id, provider: 'mailgun', raw: result };
    } catch (error) {
        logSendError('mailgun', { to, subject: payload.subject, domain }, error);
        error.provider = 'mailgun';
        throw error;
    }
}

module.exports = {
    FROM_NAME,
    DEFAULT_RESEND_FROM,
    configureTransportForTesting,
    clearTransportForTesting,
    usesResend,
    mailgunConfigured,
    isEnabled,
    getProvider,
    getResendFromAddress,
    formatResendFromHeader,
    formatMailgunFromHeader,
    formatRfc2822Utc,
    sendMessage
};
