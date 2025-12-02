#!/usr/bin/env node

/**
 * Simple Google Calendar Connection Checker
 * Checks if Google Calendar is properly connected in production
 */

const https = require('https');

const CONFIG = {
    domain: 'isked.app',
    username: 'tjtalusan'
};

function makeRequest(options, postData = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve({
                        statusCode: res.statusCode,
                        data: JSON.parse(data),
                        rawData: data
                    });
                } catch (error) {
                    resolve({
                        statusCode: res.statusCode,
                        data: data,
                        rawData: data
                    });
                }
            });
        });
        
        req.on('error', reject);
        if (postData) req.write(postData);
        req.end();
    });
}

async function checkGoogleConnection() {
    // Test 1: Check conflict detection (this tells us if Google Calendar is connected)
    const conflictOptions = {
        hostname: CONFIG.domain,
        port: 443,
        path: `/booking/${CONFIG.username}/check-conflicts`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    };
    
    const postData = JSON.stringify({
        startTime: '2024-10-16T10:00:00',
        endTime: '2024-10-16T11:00:00'
    });
    
    try {
        const response = await makeRequest(conflictOptions, postData);
        
        if (response.statusCode === 200) {
            const data = response.data;
            if (data.googleSyncEnabled === false) {
                } else {
                }
            
            if (data.error) {
                }
        } else {
            }
    } catch (error) {
        }
    
    // Test 2: Check available slots
    const slotsOptions = {
        hostname: CONFIG.domain,
        port: 443,
        path: `/booking/${CONFIG.username}/slots?date=2024-10-16`,
        method: 'GET'
    };
    
    try {
        const slotsResponse = await makeRequest(slotsOptions);
        
        if (slotsResponse.statusCode === 200) {
            const slots = slotsResponse.data.slots || [];
            if (slots.length > 0) {
                slots.forEach((slot, i) => {
                    });
                } else {
                }
        } else {
            }
    } catch (error) {
        }
    
    }

checkGoogleConnection().catch(() => {});
