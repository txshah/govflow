/**
 * `postComment` lets a room member comment on any record and redirect their org's agent.
 *
 * Inputs:
 * - Caller identity (a member), targetType, targetId, text
 *
 * Outputs:
 * - roomComment rows in the caller's org room, picked up by the agent runner
 */

import { SenderError, t } from 'spacetimedb/server';
import spacetimedb from '../schema';
import { requireMember } from '../lib/auth';

export const postComment = spacetimedb.reducer(
  { targetType: t.string(), targetId: t.u64(), text: t.string() },
  (ctx, { targetType, targetId, text }) => {
    const m = requireMember(ctx);
    if (!text.trim()) throw new SenderError('empty comment');
    ctx.db.roomComment.insert({ id: 0n, orgId: m.orgId, author: ctx.sender, targetType, targetId, text, at: ctx.timestamp });
  }
);
