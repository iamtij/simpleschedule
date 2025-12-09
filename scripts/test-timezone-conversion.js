#!/usr/bin/env node

require('dotenv').config();
const timezone = require('../utils/timezone');

function testTimezoneConversion() {
    console.log('=== Comprehensive Timezone Conversion Tests ===\n');
    
    const testCases = [
        {
            name: 'Asia/Manila (UTC+8) - Morning',
            date: '2025-12-09',
            time: '09:00',
            tz: 'Asia/Manila',
            expectedUtcHour: 1, // 9am - 8 hours = 1am UTC
        },
        {
            name: 'Asia/Manila (UTC+8) - Afternoon',
            date: '2025-12-09',
            time: '14:00',
            tz: 'Asia/Manila',
            expectedUtcHour: 6, // 2pm - 8 hours = 6am UTC
        },
        {
            name: 'Asia/Manila (UTC+8) - Evening',
            date: '2025-12-09',
            time: '18:00',
            tz: 'Asia/Manila',
            expectedUtcHour: 10, // 6pm - 8 hours = 10am UTC
        },
        {
            name: 'America/New_York (UTC-5 in winter) - Afternoon',
            date: '2025-12-09',
            time: '14:00',
            tz: 'America/New_York',
            expectedUtcHour: 19, // 2pm + 5 hours = 7pm UTC (approximate)
        },
        {
            name: 'Europe/London (UTC+0 in winter) - Afternoon',
            date: '2025-12-09',
            time: '14:00',
            tz: 'Europe/London',
            expectedUtcHour: 14, // 2pm = 2pm UTC (approximate)
        },
    ];
    
    let passed = 0;
    let failed = 0;
    
    testCases.forEach((testCase, index) => {
        console.log(`\nTest ${index + 1}: ${testCase.name}`);
        console.log(`  Input: ${testCase.date} ${testCase.time} (${testCase.tz})`);
        
        try {
            const utcDate = timezone.localToUtc(testCase.date, testCase.time, testCase.tz);
            
            if (!utcDate) {
                console.log(`  ❌ FAILED: Returned null`);
                failed++;
                return;
            }
            
            const utcHour = utcDate.getUTCHours();
            const utcDateStr = utcDate.toISOString();
            
            console.log(`  UTC Result: ${utcDateStr}`);
            console.log(`  UTC Hour: ${utcHour} (expected around ${testCase.expectedUtcHour})`);
            
            // Verify by converting back
            const backToLocal = utcDate.toLocaleString('en-US', {
                timeZone: testCase.tz,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
            
            const [localDateStr, localTime] = backToLocal.split(', ');
            // Convert date format from MM/DD/YYYY to YYYY-MM-DD for comparison
            const [month, day, year] = localDateStr.split('/');
            const localDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            const expectedDate = testCase.date;
            const expectedTime = testCase.time;
            
            console.log(`  Converted back: ${localDate} ${localTime}`);
            
            if (localDate === expectedDate && localTime.startsWith(expectedTime)) {
                console.log(`  ✓ PASSED: Conversion verified`);
                passed++;
            } else {
                console.log(`  ❌ FAILED: Round-trip conversion doesn't match`);
                console.log(`     Expected: ${expectedDate} ${expectedTime}`);
                console.log(`     Got: ${localDate} ${localTime}`);
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

testTimezoneConversion();

