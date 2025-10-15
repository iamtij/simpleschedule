#!/usr/bin/env node

/**
 * Production Conflict Detection Test Script
 * 
 * This script tests Google Calendar conflict detection in production
 * Run with: node test-conflict-detection.js
 */

const https = require('https');
const http = require('http');

// Configuration - UPDATE THESE VALUES
const CONFIG = {
    // Your production domain (without https://)
    domain: 'isked.app',
    // Your username for booking
    username: 'tjtalusan',
    // Test date (October 16 with conflicts)
    testDate: '2024-10-16',
    // Test time slot (conflicts with Google Calendar 10am event)
    startTime: '2024-10-16T10:00:00',
    endTime: '2024-10-16T11:00:00'
};

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function makeRequest(options, postData = null) {
    return new Promise((resolve, reject) => {
        const client = options.protocol === 'https:' ? https : http;
        
        const req = client.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: jsonData
                    });
                } catch (error) {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: data
                    });
                }
            });
        });
        
        req.on('error', (error) => {
            reject(error);
        });
        
        if (postData) {
            req.write(postData);
        }
        
        req.end();
    });
}

async function testConflictDetection() {
    log('\n🔍 Testing Google Calendar Conflict Detection in Production', 'cyan');
    log('=' .repeat(60), 'cyan');
    
    // Test 1: Check available slots
    log('\n📅 Test 1: Checking available slots for Thursday...', 'blue');
    
    const slotsOptions = {
        hostname: CONFIG.domain,
        port: 443,
        path: `/booking/${CONFIG.username}/slots?date=${CONFIG.testDate}`,
        method: 'GET',
        protocol: 'https:',
        headers: {
            'User-Agent': 'Conflict Detection Test Script'
        }
    };
    
    try {
        const slotsResponse = await makeRequest(slotsOptions);
        
        if (slotsResponse.statusCode === 200) {
            const slots = slotsResponse.data.slots || [];
            log(`✅ Slots API Response: ${slots.length} available slots`, 'green');
            
            if (slots.length > 0) {
                log(`📋 Available slots:`, 'yellow');
                slots.forEach((slot, index) => {
                    log(`   ${index + 1}. ${slot.start_time} - ${slot.end_time}`, 'yellow');
                });
            } else {
                log(`❌ No slots available - this might indicate conflicts are being detected!`, 'red');
            }
        } else {
            log(`❌ Slots API failed: ${slotsResponse.statusCode}`, 'red');
            log(`   Response: ${JSON.stringify(slotsResponse.data)}`, 'red');
        }
    } catch (error) {
        log(`❌ Error testing slots API: ${error.message}`, 'red');
    }
    
    // Test 2: Direct conflict detection
    log('\n🔍 Test 2: Direct conflict detection test...', 'blue');
    
    const conflictOptions = {
        hostname: CONFIG.domain,
        port: 443,
        path: `/booking/${CONFIG.username}/check-conflicts`,
        method: 'POST',
        protocol: 'https:',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Conflict Detection Test Script'
        }
    };
    
    const postData = JSON.stringify({
        startTime: CONFIG.startTime,
        endTime: CONFIG.endTime
    });
    
    try {
        const conflictResponse = await makeRequest(conflictOptions, postData);
        
        if (conflictResponse.statusCode === 200) {
            const data = conflictResponse.data;
            
            log(`✅ Conflict Detection API Response:`, 'green');
            log(`   Success: ${data.success}`, 'green');
            log(`   Google Sync Enabled: ${data.googleSyncEnabled}`, 'green');
            log(`   Has Conflicts: ${data.hasConflicts}`, data.hasConflicts ? 'red' : 'green');
            
            if (data.hasConflicts && data.conflicts) {
                log(`   📋 Conflicts found:`, 'red');
                data.conflicts.forEach((conflict, index) => {
                    log(`      ${index + 1}. ${conflict.title} (${conflict.start} - ${conflict.end})`, 'red');
                    log(`         Calendar: ${conflict.calendar}`, 'red');
                });
            } else if (data.hasConflicts === false) {
                log(`   ✅ No conflicts detected for this time slot`, 'green');
            }
            
            if (data.error) {
                log(`   ⚠️  Error: ${data.error}`, 'yellow');
            }
        } else {
            log(`❌ Conflict Detection API failed: ${conflictResponse.statusCode}`, 'red');
            log(`   Response: ${JSON.stringify(conflictResponse.data)}`, 'red');
        }
    } catch (error) {
        log(`❌ Error testing conflict detection API: ${error.message}`, 'red');
    }
    
    // Test 3: Check Google Calendar connection status
    log('\n🔍 Test 3: Checking Google Calendar connection status...', 'blue');
    
    // Test the Google Calendar connection endpoint
    const connectionOptions = {
        hostname: CONFIG.domain,
        port: 443,
        path: `/dashboard/google-calendar/status`,
        method: 'GET',
        protocol: 'https:',
        headers: {
            'User-Agent': 'Conflict Detection Test Script'
        }
    };
    
    try {
        const connectionResponse = await makeRequest(connectionOptions);
        
        if (connectionResponse.statusCode === 200) {
            const data = connectionResponse.data;
            log(`✅ Google Calendar Status:`, 'green');
            log(`   Connected: ${data.connected}`, data.connected ? 'green' : 'red');
            log(`   Sync Enabled: ${data.syncEnabled}`, data.syncEnabled ? 'green' : 'red');
            log(`   Blocking Enabled: ${data.blockingEnabled}`, data.blockingEnabled ? 'green' : 'red');
            
            if (data.error) {
                log(`   ⚠️  Error: ${data.error}`, 'yellow');
            }
        } else {
            log(`❌ Connection status API failed: ${connectionResponse.statusCode}`, 'red');
        }
    } catch (error) {
        log(`❌ Error checking connection status: ${error.message}`, 'red');
    }
    
    // Test 4: Testing with different time slot
    log('\n🔍 Test 4: Testing with different time slot...', 'blue');
    
    const testSlot2 = {
        startTime: '2024-01-16T14:00:00',
        endTime: '2024-01-16T15:00:00'
    };
    
    const conflictOptions2 = {
        hostname: CONFIG.domain,
        port: 443,
        path: `/booking/${CONFIG.username}/check-conflicts`,
        method: 'POST',
        protocol: 'https:',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Conflict Detection Test Script'
        }
    };
    
    const postData2 = JSON.stringify(testSlot2);
    
    try {
        const conflictResponse2 = await makeRequest(conflictOptions2, postData2);
        
        if (conflictResponse2.statusCode === 200) {
            const data = conflictResponse2.data;
            log(`✅ Second test (2:00-3:00 PM):`, 'green');
            log(`   Has Conflicts: ${data.hasConflicts}`, data.hasConflicts ? 'red' : 'green');
            
            if (data.hasConflicts && data.conflicts) {
                log(`   📋 Conflicts: ${data.conflicts.length} found`, 'red');
            }
        }
    } catch (error) {
        log(`❌ Error in second test: ${error.message}`, 'red');
    }
    
    // Summary
    log('\n📊 Test Summary:', 'magenta');
    log('=' .repeat(40), 'magenta');
    log('1. Check if slots are being filtered by Google Calendar conflicts', 'cyan');
    log('2. Verify conflict detection API is working', 'cyan');
    log('3. Test multiple time slots for consistency', 'cyan');
    log('\n💡 Next Steps:', 'yellow');
    log('- If conflicts are detected but slots still show: Check slot generation logic', 'yellow');
    log('- If no conflicts detected: Check Google Calendar connection and tokens', 'yellow');
    log('- If API fails: Check environment variables and user permissions', 'yellow');
}

// Main execution
if (require.main === module) {
    log('🚀 Starting Production Conflict Detection Test', 'bright');
    
    // Check if config is updated
    if (CONFIG.domain === 'your-production-domain.com' || CONFIG.username === 'your-username') {
        log('\n❌ Please update the CONFIG section in this script first!', 'red');
        log('   - Set your production domain', 'red');
        log('   - Set your username', 'red');
        log('   - Update test date if needed', 'red');
        process.exit(1);
    }
    
    testConflictDetection()
        .then(() => {
            log('\n✅ Test completed!', 'green');
        })
        .catch((error) => {
            log(`\n❌ Test failed: ${error.message}`, 'red');
            process.exit(1);
        });
}

module.exports = { testConflictDetection };
