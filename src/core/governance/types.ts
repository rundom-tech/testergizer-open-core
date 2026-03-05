export type ConstraintOperator = 'EQUALS' | 'NOT_EQUALS' | 'CONTAINS';

export interface RelationalConstraint {
  target: string;      // JSONPath, e.g., '$.[*].userId'
  operator: ConstraintOperator;
  value: string;       // Template string, e.g., '{{userId}}'
  description: string; // The reason for the rule
}

export interface GovernanceRegistry {
  registryId: string;
  domain: string;
  relationalConstraints?: RelationalConstraint[];
}