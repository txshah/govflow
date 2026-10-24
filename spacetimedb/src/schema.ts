/**
 * Binds every table into the one SpacetimeDB schema object that reducers are built from.
 *
 * Inputs:
 * - Table definitions from ./tables/*
 *
 * Outputs:
 * - Default export `spacetimedb` (the schema); reducers call `spacetimedb.reducer(...)` on it
 * - Exists separately from index.ts so reducer files can import it without a circular import
 */

import { schema } from 'spacetimedb/server';
import { admin, serviceRequest, organization, member, invite } from './tables/organization';
import { contract, deal, dealSignature, mandate } from './tables/deal';
import { milestone } from './tables/milestone';
import { invoice, approval, beneficiaryChange } from './tables/invoice';
import { verification, x402Receipt } from './tables/verification';
import { payment, ledgerEntry } from './tables/payment';
import { agentAction, agentFinding, roomComment, auditEvent } from './tables/activity';

const spacetimedb = schema({
  admin,
  serviceRequest,
  organization,
  member,
  invite,
  contract,
  deal,
  dealSignature,
  mandate,
  milestone,
  invoice,
  approval,
  beneficiaryChange,
  verification,
  x402Receipt,
  payment,
  ledgerEntry,
  agentAction,
  agentFinding,
  roomComment,
  auditEvent,
});

export default spacetimedb;
