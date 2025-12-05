require('dotenv').config();
const mailService = require('../services/mail');

async function sendTestEmails() {
    try {
        console.log('Sending test trial expiration emails...');
        const result = await mailService.sendTestTrialExpirationEmail();
        console.log('Success!', result);
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

sendTestEmails();

