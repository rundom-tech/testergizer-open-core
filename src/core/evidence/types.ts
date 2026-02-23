import { ClrSelector } from "../locators/types";

export interface EvidenceEventBase {
  type: string;
  timestamp: string; // ISO
}

export interface LocatorResolutionEvidenceEvent extends EvidenceEventBase {
  type: 'locatorResolution';
  target: string;     // e.g. "login.submit.button"
  context: string;    // e.g. "login"
  elementKey: string; // e.g. "submit.button"
  resolved: boolean;
  attempts: {
    using: ClrSelector["using"];
    value: string;
    result: "success" | "not_found";
  }[];
  resolvedBy?: {
    using: ClrSelector["using"];
    value: string;
  };
}

export type EvidenceEvent = LocatorResolutionEvidenceEvent | EvidenceEventBase;

export interface EvidenceSink {
  append(event: EvidenceEvent): Promise<void>;
}
