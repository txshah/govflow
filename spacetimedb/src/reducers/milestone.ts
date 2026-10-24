/**
 * `submitEvidence` (payee preparers only) and `inspectMilestone` (the paying side's reviewer only: the prime's inspector for sub work, the agency PM for prime work) drive the milestone state machine.
 *
 * Inputs:
 * - submitEvidence(milestoneId, evidenceRefs)
 * - inspectMilestone(milestoneId, accept, note)
 *
 * Outputs:
 * - milestone state NOT_STARTED → IN_PROGRESS → SUBMITTED_FOR_INSPECTION → ACCEPTED / REJECTED (REJECTED can resubmit)
 * - auditEvent rows
 */

import { SenderError, t } from 'spacetimedb/server';
import spacetimedb from '../schema';
import { MilestoneState as M, Role } from '../lib/constants';
import { requireActiveDealForContract, requireMember } from '../lib/auth';
import { assertTransition } from '../lib/stateMachines';
import { appendAudit } from '../lib/audit';

export const submitEvidence = spacetimedb.reducer(
  { milestoneId: t.u64(), evidenceRefs: t.string() },
  (ctx, { milestoneId, evidenceRefs }) => {
    const ms = ctx.db.milestone.id.find(milestoneId);
    if (!ms) throw new SenderError('no such milestone');
    const c = ctx.db.contract.id.find(ms.contractId)!;
    requireActiveDealForContract(ctx, c.id);
    requireMember(ctx, { orgId: c.payeeOrgId, roles: [Role.PREPARER], verified: true });
    if (!evidenceRefs.trim()) throw new SenderError('evidence is required');

    let state = ms.state;
    if (state === M.NOT_STARTED) state = M.IN_PROGRESS;
    assertTransition('milestone', state, M.SUBMITTED_FOR_INSPECTION);
    ctx.db.milestone.id.update({
      ...ms,
      state: M.SUBMITTED_FOR_INSPECTION,
      evidenceRefs,
      submittedBy: ctx.sender,
    });
    appendAudit(ctx, 'submitEvidence', 'milestone', milestoneId, evidenceRefs);
  }
);

export const inspectMilestone = spacetimedb.reducer(
  { milestoneId: t.u64(), accept: t.bool(), note: t.string() },
  (ctx, { milestoneId, accept, note }) => {
    const ms = ctx.db.milestone.id.find(milestoneId);
    if (!ms) throw new SenderError('no such milestone');
    const c = ctx.db.contract.id.find(ms.contractId)!;
    requireActiveDealForContract(ctx, c.id);
    requireMember(ctx, { orgId: c.payerOrgId, roles: [Role.REVIEWER], verified: true });
    const next = accept ? M.ACCEPTED : M.REJECTED;
    if (!accept && !note.trim()) throw new SenderError('a rejection needs a reason');
    assertTransition('milestone', ms.state, next);
    ctx.db.milestone.id.update({
      ...ms,
      state: next,
      reviewNote: note,
      reviewedBy: ctx.sender,
      reviewedAt: ctx.timestamp,
    });
    appendAudit(ctx, 'inspectMilestone', 'milestone', milestoneId, `${next} ${note}`);
  }
);
