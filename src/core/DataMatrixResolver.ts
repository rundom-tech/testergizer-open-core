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

    const dataRows = this.fetchDataRows(testDef.variance.sourceType, testDef.variance.filePath);
    
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
      testMatrix: testDef.testMatrix,
      actions: baseActions,
      inputs: {},
      expect: testDef.expect || []
    };
  }

  /**
   * Fuses the base test definition with a specific matrix row to create an immutable Testlet.
   * Resolves flow branching entirely at compile time.
   */
  private hydrateTestlet(testDef: JsonTestDefinition, row: VarianceDataRow): UnrolledTestlet {
    const baseActions = testDef.actions && testDef.actions.length > 0 
      ? testDef.actions 
      : testDef.steps || [];

    const resolvedActions = row.actions && row.actions.length > 0 
      ? row.actions 
      : baseActions;

    return {
      instanceId: `${testDef.id}_${row.variationId}`,
      parentTestId: testDef.id,
      testMatrix: testDef.testMatrix,
      actions: resolvedActions,
      inputs: row.inputs,
      // Quality Intelligence: enforce the strict boundary array via cascading fallbacks
      expect: row.expect || testDef.expect || [] 
    };
  }

  /**
   * Retrieves and normalizes the variance data from the specified matrix source.
   */
  private fetchDataRows(sourceType: 'JSON' | 'CSV', filePath: string): VarianceDataRow[] {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Quality Intelligence Violation: Data Matrix source not found at ${filePath}`);
    }

    const rawContent = fs.readFileSync(filePath, 'utf-8');

    if (sourceType === 'JSON') {
      return JSON.parse(rawContent) as VarianceDataRow[];
    }

    if (sourceType === 'CSV') {
      return this.parseCsv(rawContent);
    }

    throw new Error(`Schema Violation: Unsupported matrix source type '${sourceType}'`);
  }

  /**
   * Normalizes CSV matrix data into the strict VarianceDataRow schema.
   */
  private parseCsv(content: string): VarianceDataRow[] {
    const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    if (lines.length < 2) {
      return [];
    }

    const headers = lines[0].split(',');
    const rows: VarianceDataRow[] = [];

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
            console.warn(`Could not parse expectations for CSV row ${rowData.variationId}`);
          }
        } else if (key === 'actions') {
          try {
            const parsedActions = JSON.parse(rowData[key]);
            if (Array.isArray(parsedActions)) {
              actions = parsedActions;
            }
          } catch (e) {
            console.warn(`Could not parse actions for CSV row ${rowData.variationId}`);
          }
        }
      });

      rows.push({
        variationId: rowData.variationId || `row_${i}`,
        description: rowData.description,
        inputs,
        expect,
        actions
      });
    }

    return rows;
  }
}