/**
 * Module entry point: re-exports the schema as default and every reducer as a named export, which is how SpacetimeDB discovers them.
 *
 * Inputs:
 * - Schema from ./schema
 * - Reducers from ./reducers/*
 * - Per-organization views from ./views
 *
 * Outputs:
 * - The published `govflow-855y2` module on Maincloud
 */

export { default } from './schema';
export * from './reducers/admin';
export * from './reducers/deal';
export * from './reducers/milestone';
export * from './reducers/invoice';
export * from './reducers/approval';
export * from './reducers/service';
export * from './reducers/room';
export * from './views';
