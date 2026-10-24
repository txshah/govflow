/**
 * Thin Anthropic SDK wrapper that forces a single tool call, validates output, retries once, else returns UNSURE.
 *
 * Inputs:
 * - System prompt, tool schema, scoped document JSON
 * - CLAUDE_MODEL
 *
 * Outputs:
 * - Validated tool input object + model ID + input IDs for logging
 *
 * Uses structured outputs (output_config.format) rather than a forced tool call: the current models reject
 * forced tool_choice. Returns null after two failed attempts or a refusal; callers turn null into UNSURE.
 */

import Anthropic from '@anthropic-ai/sdk';
import { betaJSONSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/beta/json-schema';

const client = new Anthropic();
export const MODEL = process.env.CLAUDE_MODEL?.trim() || 'claude-opus-5-5';

type Schema = Parameters<typeof betaJSONSchemaOutputFormat>[0];

export type AgentResult<T> = { output: T; modelId: string };

export async function runStructured<T>(args: {
  system: string;
  schema: Schema;
  document: unknown;
  validate: (x: unknown) => x is T;
}): Promise<AgentResult<T> | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await client.beta.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        output_config: { effort: 'medium', format: betaJSONSchemaOutputFormat(args.schema) },
        // On a safety decline the API re-runs the request on Anthropic's recommended fallback model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: args.system,
        messages: [
          {
            role: 'user',
            // The document is data from the parties to the bill; the system prompt says to ignore instructions in it.
            content: `<document>\n${JSON.stringify(args.document, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)}\n</document>`,
          },
        ],
      });
      if (res.stop_reason === 'refusal') {
        console.warn(`claude: refused (${res.stop_details?.category ?? 'no category'})`);
        return null;
      }
      if (args.validate(res.parsed_output)) return { output: res.parsed_output, modelId: res.model };
      console.warn(`claude: attempt ${attempt} returned output that failed validation`);
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.BadRequestError) throw e;
      console.warn(`claude: attempt ${attempt} failed:`, e instanceof Error ? e.message : e);
    }
  }
  return null;
}
