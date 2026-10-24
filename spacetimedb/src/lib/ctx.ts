/**
 * The typed reducer context used by every helper.
 *
 * Inputs:
 * - The schema type
 *
 * Outputs:
 * - `Ctx` type so helpers keep full row types
 */

import type { InferSchema, ReducerCtx } from 'spacetimedb/server';
import type spacetimedb from '../schema';

export type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

export type InvoiceRow = NonNullable<ReturnType<Ctx['db']['invoice']['id']['find']>>;
