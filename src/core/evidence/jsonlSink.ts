import { mkdir, appendFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { EvidenceEvent, EvidenceSink } from './types';

export class JsonlEvidenceSink implements EvidenceSink {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async append(event: EvidenceEvent): Promise<void> {
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true });

    const line = JSON.stringify(event);
    await appendFile(this.filePath, line + '\n', 'utf-8');
  }
}
