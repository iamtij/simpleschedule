#!/usr/bin/env node

require('dotenv').config();
const mailService = require('../services/mail');
const timezone = require('../utils/timezone');

function testReminderCalculations() {
    console.log('=== Reminder Calculation Tests ===\n');
    
    const testCases = [
        {
            name: 'Asia/Manila - 2:00 PM appointment',
            date: '2025-12-09',
            time: '14:00',
            tz: 'Asia/Manila',
            minutesBefore: 60,
            expectedLocalHour: 13, // 1:00 PM
            expectedLocalMinute: 0,
        },
        {
            name: 'Asia/Manila - 2:00 PM appointment (30 min)',
            date: '2025-12-09',
            time: '14:00',
            tz: 'Asia/Manila',
            minutesBefore: 30,
            expectedLocalHour: 13, // 1:30 PM
            expectedLocalMinute: 30,
        },
    ];
    
    let passed = 0;
    let failed = 0;
    
    testCases.forEach((testCase, index) => {
        console.log(`\nTest ${index + 1}: ${testCase.name}`);
        console.log(`  Appointment: ${testCase.date} ${testCase.time} (${testCase.tz})`);
        console.log(`  Reminder: ${testCase.minutesBefore} minutes before`);
        
        try {
            const deliveryTime = mailService._calculateDeliveryTime(
                testCase.date,
                testCase.time,
                testCase.tz,
                testCase.minutesBefore
            );
            
            if (!deliveryTime) {
                console.log(`  ❌ FAILED: Returned null`);
                failed++;
                return;
            }
            
            // Get local time components
            const localTime = deliveryTime.toLocaleString('en-US', {
                timeZone: testCase.tz,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
            
            const [localDateStr, localTimeStr] = localTime.split(', ');
            // Convert date format from MM/DD/YYYY to YYYY-MM-DD for comparison
            const [month, day, year] = localDateStr.split('/');
            const localDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            const [localHour, localMinute] = localTimeStr.split(':').map(Number);
            
            console.log(`  Delivery time (UTC): ${deliveryTime.toISOString()}`);
            console.log(`  Delivery time (Local): ${localDate} ${localTimeStr}`);
            console.log(`  Expected local hour: ${testCase.expectedLocalHour}, got: ${localHour}`);
            console.log(`  Expected local minute: ${testCase.expectedLocalMinute}, got: ${localMinute}`);
            
            if (localDate === testCase.date && 
                localHour === testCase.expectedLocalHour && 
                localMinute === testCase.expectedLocalMinute) {
                console.log(`  ✓ PASSED`);
                passed++;
            } else {
                console.log(`  ❌ FAILED: Times don't match`);
                failed++;
            }
            
        } catch (error) {
            console.log(`  ❌ FAILED: ${error.message}`);
            failed++;
        }
    });
    
    console.log('\n=== TEST SUMMARY ===');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total: ${testCases.length}`);
    
    if (failed === 0) {
        console.log('\n✓ All tests passed!');
        process.exit(0);
    } else {
        console.log('\n❌ Some tests failed. Review the output above.');
        process.exit(1);
    }
}

testReminderCalculations();

