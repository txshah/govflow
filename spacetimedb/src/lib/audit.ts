/**
 * `appendAudit()` writes an immutable auditEvent for every reducer call.
 *
 * Inputs:
 * - ctx (actor = ctx.sender), action, subjectType, subjectId, detail
 *
 * Outputs:
 * - One auditEvent row
 */

import type { Ctx } from './ctx';

function actorLabel(ctx: Ctx): string {
  const a = ctx.db.admin.identity.find(ctx.sender);
  if (a) return a.label;
  const m = ctx.db.member.identity.find(ctx.sender);
  return m ? m.displayName : 'unknown';
}

export function appendAudit(
  ctx: Ctx,
  action: string,
  subjectType: string,
  subjectId: bigint,
  detail = ''
) {
  ctx.db.auditEvent.insert({
    id: 0n,
    actor: ctx.sender,
    actorLabel: actorLabel(ctx),
    action,
    subjectType,
    subjectId,
    detail,
    at: ctx.timestamp,
  });
}
