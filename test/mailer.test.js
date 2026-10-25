'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const mailerPath = path.join(__dirname, '..', 'services', 'mailer.js');
const mailPath = path.join(__dirname, '..', 'services', 'mail.js');

function loadMailer() {
    delete require.cache[mailerPath];
    return require(mailerPath);
}

function loadMailService() {
    delete require.cache[mailPath];
    return require(mailPath);
}

function withEnv(overrides, fn) {
    const saved = {};
    for (const key of Object.keys(overrides)) {
        saved[key] = process.env[key];
        if (overrides[key] === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = overrides[key];
        }
    }
    try {
        return fn();
    } finally {
        for (const key of Object.keys(overrides)) {
            if (saved[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = saved[key];
            }
        }
    }
}

describe('mailer', () => {
    beforeEach(() => {
        const mailer = loadMailer();
        mailer.clearTransportForTesting();
    });

    afterEach(() => {
        const mailer = loadMailer();
        mailer.clearTransportForTesting();
    });

    it('selects Resend when RESEND_API_KEY is set', () => {
        withEnv(
            {
                RESEND_API_KEY: 're_test_key',
                MAILGUN_API_KEY: 'mg-key',
                MAILGUN_DOMAIN: 'mg.example.com'
            },
            () => {
                const mailer = loadMailer();
                assert.equal(mailer.getProvider(), 'resend');
                assert.equal(mailer.usesResend(), true);
            }
        );
    });

    it('falls back to Mailgun when RESEND_API_KEY is not set', () => {
        withEnv(
            {
                RESEND_API_KEY: undefined,
                MAILGUN_API_KEY: 'mg-key',
                MAILGUN_DOMAIN: 'mg.isked.app'
            },
            () => {
                const mailer = loadMailer();
                assert.equal(mailer.getProvider(), 'mailgun');
            }
        );
    });

    it('formats Resend from header as ISKED <notify@isked.app> by default', () => {
        withEnv({ RESEND_FROM: undefined }, () => {
            const mailer = loadMailer();
            assert.equal(mailer.getResendFromAddress(), 'notify@isked.app');
            assert.equal(mailer.formatResendFromHeader(), 'ISKED <notify@isked.app>');
        });
    });

    it('allows RESEND_FROM to override the default address', () => {
        withEnv({ RESEND_FROM: 'custom@isked.app' }, () => {
            const mailer = loadMailer();
            assert.equal(mailer.formatResendFromHeader(), 'ISKED <custom@isked.app>');
        });
    });

    it('sends via Resend mock with expected payload', async () => {
        await withEnv({ RESEND_API_KEY: 're_test_key', RESEND_FROM: undefined }, async () => {
            const mailer = loadMailer();
            let captured;
            mailer.configureTransportForTesting({
                resendSend: async (payload) => {
                    captured = payload;
                    return { id: 'resend-msg-1', provider: 'resend' };
                }
            });

            const result = await mailer.sendMessage({
                to: 'client@example.com',
                subject: 'Test',
                text: 'Plain',
                html: '<p>Html</p>',
                replyTo: 'team@smallsimplesteps.co'
            });

            assert.equal(result.id, 'resend-msg-1');
            assert.equal(captured.provider, 'resend');
            assert.deepEqual(captured.to, ['client@example.com']);
            assert.equal(captured.subject, 'Test');
            assert.equal(captured.replyTo, 'team@smallsimplesteps.co');
            assert.equal(mailer.formatResendFromHeader(), 'ISKED <notify@isked.app>');
        });
    });

    it('sends via Mailgun mock with existing from address format', async () => {
        await withEnv(
            {
                RESEND_API_KEY: undefined,
                MAILGUN_API_KEY: 'mg-key',
                MAILGUN_DOMAIN: 'mg.isked.app'
            },
            async () => {
                const mailer = loadMailer();
                let captured;
                mailer.configureTransportForTesting({
                    mailgunCreate: async (payload) => {
                        captured = payload;
                        return { id: 'mg-msg-1', provider: 'mailgun' };
                    }
                });

                await mailer.sendMessage({
                    to: ['host@example.com'],
                    subject: 'Reminder',
                    text: 'Plain',
                    html: '<p>Html</p>'
                });

                assert.equal(captured.provider, 'mailgun');
                assert.equal(mailer.formatMailgunFromHeader('mg.isked.app'), 'isked <postmaster@mg.isked.app>');
            }
        );
    });
});

describe('MailService reminders', () => {
    beforeEach(() => {
        const mailer = loadMailer();
        mailer.clearTransportForTesting();
    });

    afterEach(() => {
        const mailer = loadMailer();
        mailer.clearTransportForTesting();
    });

    it('sendClientReminder routes through the shared mailer', async () => {
        await withEnv({ RESEND_API_KEY: 're_test_key' }, async () => {
            delete require.cache[mailerPath];
            delete require.cache[mailPath];
            const mailer = require(mailerPath);
            const sends = [];
            mailer.configureTransportForTesting({
                resendSend: async (payload) => {
                    sends.push(payload);
                    return { id: 'reminder-1', provider: 'resend' };
                }
            });

            const mailService = require(mailPath);
            await mailService.sendClientReminder(
                {
                    client_name: 'Jane',
                    client_email: 'jane@example.com',
                    date: '2026-11-01',
                    start_time: '14:00',
                    end_time: '15:00',
                    formatted_start_time: '2:00 PM',
                    formatted_end_time: '3:00 PM',
                    notes: null
                },
                { name: 'Host', username: 'host', meeting_link: null }
            );

            assert.equal(sends.length, 1);
            assert.equal(sends[0].to[0], 'jane@example.com');
            assert.match(sends[0].subject, /30 minutes/);
        });
    });
});

describe('runReminders script', () => {
    it('uses mailService for reminder emails', () => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'runReminders.js'), 'utf8');
        assert.match(source, /require\('\.\.\/services\/mail'\)/);
        assert.match(source, /mailService\.sendClientReminder/);
        assert.match(source, /mailService\.sendHostReminder/);
    });
});
