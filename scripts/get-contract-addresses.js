#!/usr/bin/env node

/**
 * Export contract addresses from TypeScript constants for use in shell scripts
 */

const fs = require('fs');
const path = require('path');

// Read the contract constants file
const constantsPath = path.join(__dirname, '../src/constants/contractAbis.ts');
const constantsContent = fs.readFileSync(constantsPath, 'utf8');

// Extract contract addresses using regex
const addressRegex = /([A-Z_]+):\s*'(0x[a-fA-F0-9]{40})'/g;
const addresses = {};
let match;

while ((match = addressRegex.exec(constantsContent)) !== null) {
  addresses[match[1]] = match[2];
}

// Also extract test user addresses
const testUsersPath = path.join(__dirname, '../src/constants/testUsers.ts');
if (fs.existsSync(testUsersPath)) {
  const testUsersContent = fs.readFileSync(testUsersPath, 'utf8');
  
  // Extract BOB and ALICE addresses
  const bobMatch = testUsersContent.match(/BOB:\s*{\s*address:\s*'(0x[a-fA-F0-9]{40})'/);
  const aliceMatch = testUsersContent.match(/ALICE:\s*{\s*address:\s*'(0x[a-fA-F0-9]{40})'/);
  
  if (bobMatch) addresses.BOB_ADDRESS = bobMatch[1];
  if (aliceMatch) addresses.ALICE_ADDRESS = aliceMatch[1];
}

// Output as shell variables based on command line argument
const format = process.argv[2] || 'shell';

if (format === 'json') {
  console.log(JSON.stringify(addresses, null, 2));
} else {
  // Output as shell variables
  Object.entries(addresses).forEach(([key, value]) => {
    console.log(`export ${key}="${value}"`);
  });
}