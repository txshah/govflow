/**
 * Tool input schemas and TS types for each agent's structured output.
 *
 * Inputs:
 * - —
 *
 * Outputs:
 * - JSON schemas: evidence summary, match result (MATCHED/MISMATCH/UNSURE + reasons), risk case file
 */

export type MatchOutput = { result: 'MATCHED' | 'MISMATCH' | 'UNSURE'; reasons: string[] };

export const MATCH_SCHEMA = {
  type: 'object',
  properties: {
    result: { type: 'string', enum: ['MATCHED', 'MISMATCH', 'UNSURE'] },
    reasons: { type: 'array', items: { type: 'string' } },
  },
  required: ['result', 'reasons'],
  additionalProperties: false,
} as const;

export function isMatchOutput(x: unknown): x is MatchOutput {
  const o = x as MatchOutput;
  return !!o && ['MATCHED', 'MISMATCH', 'UNSURE'].includes(o.result) && Array.isArray(o.reasons) && o.reasons.length > 0;
}

export type RiskOutput = { risk: 'LOW' | 'MEDIUM' | 'HIGH'; flags: string[]; caseFile: string };

export const RISK_SCHEMA = {
  type: 'object',
  properties: {
    risk: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
    flags: { type: 'array', items: { type: 'string' } },
    caseFile: { type: 'string' },
  },
  required: ['risk', 'flags', 'caseFile'],
  additionalProperties: false,
} as const;

export function isRiskOutput(x: unknown): x is RiskOutput {
  const o = x as RiskOutput;
  return !!o && ['LOW', 'MEDIUM', 'HIGH'].includes(o.risk) && Array.isArray(o.flags) && typeof o.caseFile === 'string' && o.caseFile.length > 0;
}

// The evidence summarizer is cut for the demo; its schema lands with it.
