const fs = require('fs');
const path = require('path');

console.log('🚀 Running Nova Master Test Suite...\n');

const testFiles = [
  './tests/nlpParser.test.js',
  './tests/taskDatabase.test.js',
  './tests/ipcContract.test.js',
  './tests/notification.test.js',
  './tests/geminiSecurity.test.js'
];

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runSuite(file) {
  console.log(`📁 Executing ${file}:`);
  let currentSuite = '';
  
  global.describe = (name, fn) => {
    currentSuite = name;
    console.log(`  SUITE: ${name}`);
    fn();
  };

  global.beforeEach = (fn) => {
    global._beforeEachFn = fn;
  };

  global.afterEach = (fn) => {
    global._afterEachFn = fn;
  };

  global.it = (name, fn) => {
    totalTests++;
    try {
      if (global._beforeEachFn) global._beforeEachFn();
      fn();
      if (global._afterEachFn) global._afterEachFn();
      passedTests++;
      console.log(`    ✅ ${name}`);
    } catch (err) {
      failedTests++;
      console.error(`    ❌ ${name}`);
      console.error(`       Error: ${err.message}`);
    }
  };

  require(file);
  console.log('');
}

testFiles.forEach(file => {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    runSuite(file);
  }
});

console.log('==================================================');
console.log(`📊 TEST RESULTS SUMMARY:`);
console.log(`   Total Tests:  ${totalTests}`);
console.log(`   Passed:       ${passedTests}`);
console.log(`   Failed:       ${failedTests}`);
console.log('==================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
}
