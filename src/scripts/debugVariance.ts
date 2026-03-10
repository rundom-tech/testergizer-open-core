// src/scripts/debugVariance.ts

import * as fs from 'fs';
import * as path from 'path';
import { DataMatrixResolver } from '../core/DataMatrixResolver';
import { JsonTestDefinition } from '../core/types';

function runDebug() {
  console.log("=== QUALITY INTELLIGENCE: COMPILE-TIME MATRIX UNROLLING ===");

  // 1. Load the base test definition
  // Adjust the path below if you save the JSON files in a different directory
  const testPath = path.resolve(__dirname, '../../login.test.json');
  
  if (!fs.existsSync(testPath)) {
    console.error(`Test file not found at ${testPath}`);
    return;
  }
  
  const testDef = JSON.parse(fs.readFileSync(testPath, 'utf-8')) as JsonTestDefinition;

  // Resolve the variance file path relative to the script execution for testing
  if (testDef.variance) {
    testDef.variance.filePath = path.resolve(path.dirname(testPath), testDef.variance.filePath);
  }

  // 2. Unroll the testlets
  const resolver = new DataMatrixResolver();
  const unrolledTestlets = resolver.resolve(testDef);

  // 3. Output the strict contracts
  unrolledTestlets.forEach((testlet, index) => {
    console.log(`\n--- Testlet ${index + 1}: ${testlet.instanceId} ---`);
    console.log(`Matrix Layer:`, testlet.testMatrix);
    console.log(`Inputs:`, testlet.inputs);
    
    // We log the action count and the first target to easily prove the flow was overridden
    console.log(`Action Count: ${testlet.actions.length}`);
    if (testlet.actions.length > 0) {
      console.log(`First Action Target: ${testlet.actions[0].target}`);
    }
    
    console.log(`Expectations:`, testlet.expect.map(e => `${e.target} ${e.matcher} ${e.value}`));
  });

  console.log("\n=== UNROLLING COMPLETE ===");
}

runDebug();