import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import type { Page } from "playwright";
import type { JsonStep } from "../types"; 
import type { StepExecutor } from "./StepExecutor";
import { ExecutionContext } from "../context/ExecutionContext";
import { VarianceResolver } from "../context/VarianceResolver";

export class FSExecutor implements StepExecutor {
  
  async execute(step: JsonStep, page: Page | null, sharedContext?: ExecutionContext): Promise<void> {
    const context = sharedContext || new ExecutionContext();
    const resolver = new VarianceResolver(context);

    const action = resolver.resolveString(String((step as any).action));
    const rawTarget = step.target ? String(step.target) : null;
    const target = rawTarget ? resolver.resolveString(rawTarget) : null;

    if (!target) {
      throw new Error(`[FSExecutor] Action '${action}' requires a 'target' (file/folder path).`);
    }

    const expandedTarget = target.startsWith('~/') 
      ? path.join(os.homedir(), target.slice(2)) 
      : target;

    const resolvedPath = path.resolve(expandedTarget);

    switch (action) {
      case "fs.cleanDirectory": {
        if (fs.existsSync(resolvedPath)) {
          if (!fs.statSync(resolvedPath).isDirectory()) {
            throw new Error(`[FSExecutor] Target exists but is not a directory: ${resolvedPath}`);
          }
          const items = fs.readdirSync(resolvedPath);
          for (const item of items) {
            const fullPath = path.join(resolvedPath, item);
            fs.rmSync(fullPath, { recursive: true, force: true });
          }
        } else {
          fs.mkdirSync(resolvedPath, { recursive: true });
        }
        
        context.set('__fsTemporalBoundary', Date.now());
        
        (step as any).data = { value: "Cleaned" };
        return;
      }

      case "fs.waitForLatestFile": {
        if (step.value === undefined || step.value === null) {
          throw new Error(`[FSExecutor] 'fs.waitForLatestFile' requires 'value' (extension or exact filename).`);
        }

        const expectedTarget = resolver.resolveString(String(step.value));
        const isExtensionMatch = expectedTarget.startsWith('.');
        
        const timeoutMs = (step as any).timeoutMs ? Number((step as any).timeoutMs) : 10000;
        const pollInterval = 500;
        let elapsedTime = 0;
        let foundFile: string | null = null;

        const boundaryTime = (context.get('__fsTemporalBoundary') as number) || 0;

        while (elapsedTime < timeoutMs) {
          if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
            const files = fs.readdirSync(resolvedPath)
              .filter(file => isExtensionMatch ? file.endsWith(expectedTarget) : file === expectedTarget)
              .map(file => {
                const stat = fs.statSync(path.join(resolvedPath, file));
                return {
                  name: file,
                  time: Math.max(stat.mtimeMs, stat.birthtimeMs || 0)
                };
              })
              .filter(f => f.time >= boundaryTime)
              .sort((a, b) => b.time - a.time);

            if (files.length > 0) {
              foundFile = path.join(resolvedPath, files[0].name);
              break;
            }
          }
          await new Promise(r => setTimeout(r, pollInterval));
          elapsedTime += pollInterval;
        }

        if (!foundFile) {
          throw new Error(`[FSExecutor] Timed out waiting for file matching '${expectedTarget}' in directory: ${resolvedPath}`);
        }

        const extractAs = (step as any).extractAs || "latestDownloadedFile";
        context.set(extractAs, foundFile);

        (step as any).data = { value: foundFile };
        return;
      }

      case "fs.assertFileExists": {
        if (!fs.existsSync(resolvedPath)) {
          throw new Error(`[FSExecutor] File does not exist at path: ${resolvedPath}`);
        }
        if (!fs.statSync(resolvedPath).isFile()) {
          throw new Error(`[FSExecutor] Target exists but is not a file: ${resolvedPath}`);
        }
        
        (step as any).data = { value: "Exists" };
        return;
      }

      case "fs.assertFolderExists": {
        if (!fs.existsSync(resolvedPath)) {
          throw new Error(`[FSExecutor] Folder does not exist at path: ${resolvedPath}`);
        }
        if (!fs.statSync(resolvedPath).isDirectory()) {
          throw new Error(`[FSExecutor] Target exists but is not a directory: ${resolvedPath}`);
        }
        
        (step as any).data = { value: "Exists" };
        return;
      }

      case "fs.verifyChecksum": {
        if (step.value === undefined || step.value === null) {
          throw new Error(`[FSExecutor] 'fs.verifyChecksum' requires 'value' (the expected hash).`);
        }
        
        const expectedHash = resolver.resolveString(String(step.value));
        const rawAlgorithm = (step as any).algorithm ? String((step as any).algorithm) : 'sha256';
        const algorithm = resolver.resolveString(rawAlgorithm);
        
        if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
          throw new Error(`[FSExecutor] Cannot verify checksum. File not found: ${resolvedPath}`);
        }

        const fileBuffer = fs.readFileSync(resolvedPath);
        const actualHash = crypto.createHash(algorithm).update(fileBuffer).digest('hex');
        
        (step as any).data = { value: actualHash };
        
        if (actualHash !== expectedHash) {
          throw new Error(`[FSExecutor] Checksum mismatch for ${target}. Expected ${expectedHash}, got ${actualHash}`);
        }
        return;
      }

      case "fs.verifyFolderSize": {
        if (step.value === undefined || step.value === null) {
          throw new Error(`[FSExecutor] 'fs.verifyFolderSize' requires 'value' (max size in bytes).`);
        }

        if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isDirectory()) {
          throw new Error(`[FSExecutor] Cannot verify size. Folder not found: ${resolvedPath}`);
        }

        const resolvedValue = typeof step.value === 'string' ? resolver.resolveString(step.value) : step.value;
        const maxSizeBytes = Number(resolvedValue);
        
        if (isNaN(maxSizeBytes)) {
            throw new Error(`[FSExecutor] 'fs.verifyFolderSize' requires a valid number for 'value'. Got: ${resolvedValue}`);
        }

        const actualSize = this.getFolderSize(resolvedPath);

        (step as any).data = { value: actualSize };

        if (actualSize > maxSizeBytes) {
          throw new Error(`[FSExecutor] Folder ${target} is too large. Max: ${maxSizeBytes} bytes, Actual: ${actualSize} bytes.`);
        }
        return;
      }

      case "fs.checkAccessibility": {
        if (step.value === undefined || step.value === null) {
          throw new Error(`[FSExecutor] 'fs.checkAccessibility' requires 'value' (boolean).`);
        }

        const resolvedValue = typeof step.value === 'string' ? resolver.resolveString(step.value) : step.value;
        const expectedAccessibility = typeof resolvedValue === 'string' ? resolvedValue.toLowerCase() === 'true' : Boolean(resolvedValue);

        let canRead = false;
        let canWrite = false;

        try {
          fs.accessSync(resolvedPath, fs.constants.R_OK);
          canRead = true;
        } catch {}

        try {
          fs.accessSync(resolvedPath, fs.constants.W_OK);
          canWrite = true;
        } catch {}

        const isAccessible = canRead && canWrite;

        // Quality Intelligence: Provide a strict mechanical audit of the operating system flags verified
        (step as any).data = { 
          value: isAccessible,
          audit: [
            { check: "Read Permission (R_OK)", detail: canRead ? "Granted" : "Denied", passed: canRead, path: target },
            { check: "Write Permission (W_OK)", detail: canWrite ? "Granted" : "Denied", passed: canWrite, path: target }
          ]
        };

        if (isAccessible !== expectedAccessibility) {
          throw new Error(`[FSExecutor] Accessibility mismatch for ${target}. Expected ${expectedAccessibility}, got ${isAccessible}`);
        }
        return;
      }

      default:
        throw new Error(`[FSExecutor] Unknown step action: ${action}`);
    }
  }

  private getFolderSize(folderPath: string): number {
    let totalSize = 0;
    const items = fs.readdirSync(folderPath);
    
    for (const item of items) {
      const itemPath = path.join(folderPath, item);
      const stats = fs.statSync(itemPath);

      if (stats.isDirectory()) {
        totalSize += this.getFolderSize(itemPath);
      } else {
        totalSize += stats.size;
      }
    }
    return totalSize;
  }
}