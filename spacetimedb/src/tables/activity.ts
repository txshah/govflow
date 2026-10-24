/**
 * Defines what streams into each room: agent step logs, agent findings (evidence summaries, risk case files), comments from people, and the append-only audit log.
 *
 * Inputs:
 * - logAgentAction / recordFinding (Node API on behalf of a mandated agent)
 * - postComment (room members)
 * - Every reducer (auditEvent)
 *
 * Outputs:
 * - agentAction, agentFinding, roomComment, auditEvent rows pushed live to subscribed rooms
 */

import { t, table } from 'spacetimedb/server';

export const agentAction = table(
  { name: 'agent_action' },
  {
    id: t.u64().primaryKey().autoInc(),
    agentId: t.string(),
    orgId: t.u64().index('btree'),
    dealId: t.u64(),
    step: t.string(),
    status: t.string(),
    detail: t.string(),
    at: t.timestamp(),
  }
);

export const agentFinding = table(
  { name: 'agent_finding' },
  {
    id: t.u64().primaryKey().autoInc(),
    // EVIDENCE_SUMMARY | MATCH | RISK_CASE
    kind: t.string(),
    subjectType: t.string(),
    subjectId: t.u64().index('btree'),
    agentId: t.string(),
    orgId: t.u64(),
    result: t.string(),
    body: t.string(),
    flags: t.string(),
    modelId: t.string(),
    inputIds: t.string(),
    at: t.timestamp(),
  }
);

export const roomComment = table(
  { name: 'room_comment' },
  {
    id: t.u64().primaryKey().autoInc(),
    orgId: t.u64().index('btree'),
    author: t.identity(),
    targetType: t.string(),
    targetId: t.u64(),
    text: t.string(),
    at: t.timestamp(),
  }
);

export const auditEvent = table(
  { name: 'audit_event' },
  {
    id: t.u64().primaryKey().autoInc(),
    actor: t.identity(),
    actorLabel: t.string(),
    action: t.string(),
    subjectType: t.string(),
    subjectId: t.u64(),
    detail: t.string(),
    at: t.timestamp(),
  }
);
