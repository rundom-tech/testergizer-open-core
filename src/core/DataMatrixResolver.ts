// src/core/DataMatrixResolver.ts

import * as fs from 'fs';
import { JsonTestDefinition, UnrolledTestlet, VarianceDataRow, Assertion } from './types';

export class DataMatrixResolver {
  
  /**
   * Evaluates a JsonTestDefinition and unrolls it into independent Testlet contracts.
   * Enforces the Quality Intelligence paradigm by ensuring deterministic, isolated boundaries.
   */
  public resolve(testDef: JsonTestDefinition): UnrolledTestlet[] {
    if (!testDef.variance) {
      // If there is no variance matrix, the base test itself acts as a single atomic testlet.
      return [this.createBaseTestlet(testDef)];
    }

    // Quality Intelligence Auto-Detect: Infer sourceType from file extension if missing
    let sourceType = testDef.variance.sourceType;
    if (!sourceType && testDef.variance.filePath) {
      sourceType = testDef.variance.filePath.toLowerCase().endsWith('.csv') ? 'CSV' : 'JSON';
    }

    const dataRows = this.fetchDataRows(sourceType, testDef.variance.filePath);
    
    return dataRows.map(row => this.hydrateTestlet(testDef, row));
  }

  /**
   * Creates a baseline contract when no data variance is present.
   */
  private createBaseTestlet(testDef: JsonTestDefinition): UnrolledTestlet {
    // Gracefully handle both "steps" and "actions" depending on schema version
    const baseActions = testDef.actions && testDef.actions.length > 0 
      ? testDef.actions 
      : testDef.steps || [];

    return {
      instanceId: testDef.id,
      parentTestId: testDef.id,
      description: testDef.name || testDef.title, // Preserve the base name if no matrix exists
      testMatrix: testDef.testMatrix,
      actions: baseActions,
      steps: [], 
      inputs: {},
      expect: testDef.expect || []
    } as UnrolledTestlet;
  }

  /**
   * Fuses the base test definition with a specific matrix row to create an immutable Testlet.
   * Passes Divergent Topologies safely down to the SuiteCoordinator for compilation.
   */
  private hydrateTestlet(testDef: JsonTestDefinition, row: any): UnrolledTestlet {
    // Extract the variant's specific structural additions
    const variantSteps = row.steps || row.actions || [];

    // Resolve the proper variation ID, treating id and variationId as semantic equivalents
    const variationId = row.id || row.variationId || 'unnamed';

    return {
      instanceId: `${testDef.id}_${variationId}`,
      parentTestId: testDef.id,
      description: row.description || testDef.name || testDef.title, // Map the semantic name!
      testMatrix: testDef.testMatrix,
      
      // Explicitly pass the variant's steps so SuiteCoordinator can fuse them
      steps: variantSteps,
      actions: variantSteps, 
      
      inputs: row.inputs || {},
      // Enforce the strict boundary array via cascading fallbacks
      expect: row.expect || testDef.expect || [] 
    } as UnrolledTestlet;
  }

  /**
   * Retrieves and normalizes the variance data from the specified matrix source.
   */
  private fetchDataRows(sourceType: string, filePath: string): any[] {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Quality Intelligence Violation: Data Matrix source not found at ${filePath}`);
    }

    const rawContent = fs.readFileSync(filePath, 'utf-8');

    if (sourceType === 'JSON') {
      const parsed = JSON.parse(rawContent);
      
      // Auto-Format: If AweMG generated a Dictionary instead of an Array, safely unroll it
      if (!Array.isArray(parsed) && typeof parsed === 'object') {
        return Object.entries(parsed).map(([key, value]: [string, any]) => ({
          variationId: key,
          ...value
        }));
      }
      return parsed;
    }

    if (sourceType === 'CSV') {
      return this.parseCsv(rawContent);
    }

    throw new Error(`Schema Violation: Unsupported matrix source type '${sourceType}'`);
  }

  /**
   * Normalizes CSV matrix data into the strict schema.
   */
  private parseCsv(content: string): any[] {
    const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    if (lines.length < 2) {
      return [];
    }

    const headers = lines[0].split(',');
    const rows: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      const rowData: any = {};

      headers.forEach((header, index) => {
        rowData[header.trim()] = values[index] ? values[index].trim() : '';
      });

      const inputs: Record<string, any> = {};
      const expect: Assertion[] = [];
      let actions: any[] | undefined = undefined;

      Object.keys(rowData).forEach(key => {
        if (key.startsWith('input.')) {
          const inputKey = key.replace('input.', '');
          inputs[inputKey] = rowData[key];
        } else if (key === 'expectations') {
          try {
            const parsedExpect = JSON.parse(rowData[key]);
            if (Array.isArray(parsedExpect)) {
              expect.push(...parsedExpect);
            }
          } catch (e) {
            console.warn(`Could not parse expectations for CSV row ${rowData.variationId || rowData.id}`);
          }
        } else if (key === 'actions' || key === 'steps') {
          try {
            const parsedActions = JSON.parse(rowData[key]);
            if (Array.isArray(parsedActions)) {
              actions = parsedActions;
            }
          } catch (e) {
            console.warn(`Could not parse steps for CSV row ${rowData.variationId || rowData.id}`);
          }
        }
      });

      rows.push({
        id: rowData.id || rowData.variationId || `row_${i}`,
        description: rowData.description,
        inputs,
        expect,
        steps: actions
      });
    }

    return rows;
  }
}