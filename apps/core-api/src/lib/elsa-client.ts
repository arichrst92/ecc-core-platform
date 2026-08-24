/**
 * Elsa (Els Agentic) — Anthropic Claude client.
 *
 * Fetch-based (tanpa SDK dependency). Support tool_use loop:
 *   1. Send messages + tools ke Claude
 *   2. Kalau response.stop_reason === 'tool_use' → execute tool → append result → loop
 *   3. Kalau 'end_turn' → return final text
 *
 * Rate limit + safety guard di caller (router). Client throws kalau
 * ANTHROPIC_API_KEY tidak set atau HTTP error.
 */

// ============================================================
// Types
// ============================================================

export interface ElsaMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export interface ElsaTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ClaudeResponse {
  id: string;
  role: 'assistant';
  content: ContentBlock[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
  usage: { input_tokens: number; output_tokens: number };
}

interface CallArgs {
  system: string;
  messages: ElsaMessage[];
  tools: ElsaTool[];
  model?: string;
  maxTokens?: number;
}

// ============================================================
// Call helper
// ============================================================

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export async function callClaude(args: CallArgs): Promise<ClaudeResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY tidak di-set. Cek .env di server.');
  }
  const model = args.model ?? process.env.ELSA_MODEL ?? 'claude-sonnet-4-20250514';
  const maxTokens = args.maxTokens ?? parseInt(process.env.ELSA_MAX_TOKENS ?? '2048', 10);

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: args.system,
      tools: args.tools,
      messages: args.messages,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${text.slice(0, 500)}`);
  }

  return (await res.json()) as ClaudeResponse;
}

/**
 * Agentic loop — call Claude berulang sampai stop_reason='end_turn'.
 * Setiap tool_use dieksekusi via toolExecutor lalu hasilnya append ke messages.
 *
 * Guard: max 8 iterations untuk prevent infinite tool loop.
 */
export async function runAgenticLoop(args: {
  system: string;
  messages: ElsaMessage[];
  tools: ElsaTool[];
  toolExecutor: (name: string, input: Record<string, unknown>) => Promise<string>;
  maxIterations?: number;
}): Promise<{ finalText: string; iterations: number; usage: { inputTokens: number; outputTokens: number } }> {
  const maxIterations = args.maxIterations ?? 8;
  const messages = [...args.messages];
  let iterations = 0;
  let totalInput = 0;
  let totalOutput = 0;

  while (iterations < maxIterations) {
    iterations++;
    const response = await callClaude({
      system: args.system,
      messages,
      tools: args.tools,
    });
    totalInput += response.usage.input_tokens;
    totalOutput += response.usage.output_tokens;

    // Append assistant response ke history
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn' || response.stop_reason === 'max_tokens') {
      // Extract final text dari content blocks
      const textBlocks = response.content
        .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
        .map((b) => b.text);
      const finalText = textBlocks.join('\n\n').trim();
      return {
        finalText: finalText || '[Elsa tidak menghasilkan text — mungkin cuma tool call tanpa summary.]',
        iterations,
        usage: { inputTokens: totalInput, outputTokens: totalOutput },
      };
    }

    if (response.stop_reason === 'tool_use') {
      const toolUses = response.content.filter(
        (b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use',
      );
      const toolResults: ContentBlock[] = [];
      for (const tu of toolUses) {
        try {
          const result = await args.toolExecutor(tu.name, tu.input);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: result,
          });
        } catch (e) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: `Error: ${e instanceof Error ? e.message : String(e)}`,
            is_error: true,
          });
        }
      }
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // Unknown stop reason — bail
    throw new Error(`Unexpected stop_reason: ${response.stop_reason}`);
  }

  throw new Error(`Elsa mencapai max iterations (${maxIterations}) — kemungkinan tool loop.`);
}
