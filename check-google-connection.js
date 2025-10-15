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
    console.log('🔍 Checking Google Calendar Connection Status...\n');
    
    // Test 1: Check conflict detection (this tells us if Google Calendar is connected)
    console.log('1️⃣ Testing conflict detection API...');
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
            console.log(`   ✅ API Response: ${response.statusCode}`);
            console.log(`   📊 Success: ${data.success}`);
            console.log(`   🔗 Google Sync Enabled: ${data.googleSyncEnabled}`);
            console.log(`   ⚠️  Has Conflicts: ${data.hasConflicts}`);
            
            if (data.googleSyncEnabled === false) {
                console.log('\n❌ PROBLEM FOUND: Google Calendar sync is DISABLED!');
                console.log('   This means Google Calendar is not connected or tokens are invalid.');
            } else {
                console.log('\n✅ Google Calendar sync is ENABLED');
            }
            
            if (data.error) {
                console.log(`   🚨 Error: ${data.error}`);
            }
        } else {
            console.log(`   ❌ API Failed: ${response.statusCode}`);
            console.log(`   Response: ${response.rawData}`);
        }
    } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
    }
    
    // Test 2: Check available slots
    console.log('\n2️⃣ Testing available slots...');
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
            console.log(`   ✅ Slots API Response: ${slotsResponse.statusCode}`);
            console.log(`   📅 Available slots: ${slots.length}`);
            
            if (slots.length > 0) {
                console.log('   📋 Slots found:');
                slots.forEach((slot, i) => {
                    console.log(`      ${i + 1}. ${slot.start_time} - ${slot.end_time}`);
                });
                console.log('\n❌ PROBLEM: Slots are showing despite Google Calendar conflicts!');
            } else {
                console.log('\n✅ No slots available - conflicts are being detected correctly');
            }
        } else {
            console.log(`   ❌ Slots API Failed: ${slotsResponse.statusCode}`);
        }
    } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
    }
    
    console.log('\n📋 Summary:');
    console.log('===========');
    console.log('If Google Sync Enabled = false: You need to reconnect Google Calendar');
    console.log('If slots are showing: Conflict detection is not working properly');
    console.log('If no slots showing: Conflict detection is working correctly');
}

checkGoogleConnection().catch(console.error);
