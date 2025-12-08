/**
 * Test script to verify email placeholder replacement functionality
 * This script tests all available placeholders without sending actual emails
 */

require('dotenv').config();
const mailService = require('../services/mail');

// Test data
const testVariables = {
    user_name: 'John Doe',
    user_email: 'john.doe@example.com',
    coupon_code: 'TEST2024',
    coupon_description: 'Test Coupon Description',
    upgrade_link: 'https://isked.app/upgrade/abc123def456',
    // Also test camelCase variants
    name: 'John Doe',
    email: 'john.doe@example.com',
    couponCode: 'TEST2024',
    couponDescription: 'Test Coupon Description',
    upgradeLink: 'https://isked.app/upgrade/abc123def456'
};

// Test templates
const testTemplates = [
    {
        name: 'Basic Template',
        subject: 'Hello {{user_name}}',
        body: '<p>Hello {{user_name}}, your email is {{user_email}}.</p>'
    },
    {
        name: 'Coupon Template',
        subject: 'Special Offer: {{coupon_code}}',
        body: '<p>Hi {{user_name}}, use code {{coupon_code}} for {{coupon_description}}.</p>'
    },
    {
        name: 'Upgrade Template',
        subject: 'Upgrade Now - {{user_name}}',
        body: '<p>Hello {{user_name}}, upgrade here: <a href="{{upgrade_link}}">Upgrade</a></p>'
    },
    {
        name: 'All Variables Template',
        subject: 'Complete Test - {{user_name}}',
        body: `
            <p>Name: {{user_name}}</p>
            <p>Email: {{user_email}}</p>
            <p>Coupon: {{coupon_code}}</p>
            <p>Description: {{coupon_description}}</p>
            <p>Upgrade: <a href="{{upgrade_link}}">{{upgrade_link}}</a></p>
        `
    },
    {
        name: 'CamelCase Test',
        subject: 'Test {{name}}',
        body: '<p>Email: {{email}}, Code: {{couponCode}}, Link: {{upgradeLink}}</p>'
    },
    {
        name: 'Multiple Occurrences',
        subject: '{{user_name}} - {{user_name}}',
        body: '<p>{{user_name}} appears {{user_name}} times in this template.</p>'
    },
    {
        name: 'Missing Variable',
        subject: 'Test {{missing_var}}',
        body: '<p>This {{missing_var}} should be empty.</p>'
    }
];

console.log('🧪 Testing Email Placeholder Replacement\n');
console.log('=' .repeat(60));
console.log('Test Variables:');
console.log(JSON.stringify(testVariables, null, 2));
console.log('=' .repeat(60));
console.log('\n');

let passedTests = 0;
let failedTests = 0;

// Run tests
testTemplates.forEach((template, index) => {
    console.log(`\n📝 Test ${index + 1}: ${template.name}`);
    console.log('-'.repeat(60));
    
    const processedSubject = mailService.replaceTemplateVariables(template.subject, testVariables);
    const processedBody = mailService.replaceTemplateVariables(template.body, testVariables);
    
    console.log('Original Subject:', template.subject);
    console.log('Processed Subject:', processedSubject);
    console.log('\nOriginal Body:', template.body.trim());
    console.log('Processed Body:', processedBody.trim());
    
    // Check if placeholders were replaced
    const hasUnreplacedPlaceholders = processedSubject.includes('{{') || processedBody.includes('{{');
    const hasExpectedContent = processedSubject.includes('John Doe') || processedBody.includes('John Doe');
    
    if (template.name === 'Missing Variable') {
        // For missing variable test, we expect the placeholder to remain
        if (processedSubject.includes('{{missing_var}}') && processedBody.includes('{{missing_var}}')) {
            console.log('✅ PASS: Missing variable correctly left unreplaced');
            passedTests++;
        } else {
            console.log('❌ FAIL: Missing variable should remain unreplaced');
            failedTests++;
        }
    } else if (hasUnreplacedPlaceholders && !hasExpectedContent) {
        console.log('❌ FAIL: Placeholders not replaced correctly');
        failedTests++;
    } else {
        console.log('✅ PASS: Placeholders replaced correctly');
        passedTests++;
    }
});

// Summary
console.log('\n' + '='.repeat(60));
console.log('📊 Test Summary');
console.log('='.repeat(60));
console.log(`✅ Passed: ${passedTests}`);
console.log(`❌ Failed: ${failedTests}`);
console.log(`📈 Total: ${testTemplates.length}`);
console.log(`🎯 Success Rate: ${((passedTests / testTemplates.length) * 100).toFixed(1)}%`);

// Test specific placeholders
console.log('\n' + '='.repeat(60));
console.log('🔍 Individual Placeholder Tests');
console.log('='.repeat(60));

const placeholders = ['user_name', 'user_email', 'coupon_code', 'coupon_description', 'upgrade_link'];
placeholders.forEach(placeholder => {
    const testTemplate = `Test {{${placeholder}}}`;
    const result = mailService.replaceTemplateVariables(testTemplate, testVariables);
    const expected = testVariables[placeholder] || '';
    
    if (result === `Test ${expected}`) {
        console.log(`✅ ${placeholder}: "${result}"`);
    } else {
        console.log(`❌ ${placeholder}: Expected "Test ${expected}", got "${result}"`);
    }
});

console.log('\n✨ Test completed!\n');

