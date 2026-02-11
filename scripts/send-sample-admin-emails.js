#!/usr/bin/env node
/**
 * Send sample admin notification emails to tjtalusan@gmail.com
 * Run: node scripts/send-sample-admin-emails.js
 */
require('dotenv').config();
const mailService = require('../services/mail');

const ADMIN_EMAIL = 'tjtalusan@gmail.com';

async function main() {
    try {
        console.log('Sending sample admin notification emails to', ADMIN_EMAIL, '...');
        const results = await mailService.sendSampleAdminNotifications(ADMIN_EMAIL);
        console.log('Success! Sent', results.length, 'sample emails:');
        results.forEach((r) => console.log('  -', r.type));
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main();
