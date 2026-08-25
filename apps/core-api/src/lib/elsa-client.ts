/**
 * Elsa (Els Agentic) — Anthropic Claude client.
 *
 * Provider: Anthropic (was Groq). Model default `claude-3-haiku-20240307`
 * — model PALING MURAH dari Anthropic yg support tool calling.
 * Cost: $0.25/$1.25 per M input/output tokens (3x lebih murah dari 3.5 Haiku).
 *
 * Fetch-based (no SDK dependency). Tool loop:
 *   1. Send messages + tools ke Anthropic messages endpoint
 *   2. Kalau response.stop_reason === 'tool_use' → execute → append result → loop
 *   3. Kalau 'end_turn' → return final text
 *
 * Guard: max 8 iterations untuk prevent infinite loop.
 */

// ============================================================
// Types — Anthropic schema
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

interface ClaudeResponse {
  id: string;
  role: 'assistant';
  content: ContentBlock[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
  usage: { input_tokens: number; output_tokens: number };
}

interface CallArgs {
  system: string;
  messages: ElsaMessage[];
  tools?: ElsaTool[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

// ============================================================
// Anthropic call helper
// ============================================================

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export async function callClaude(args: CallArgs): Promise<ClaudeResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY tidak di-set. Cek .env di server.');
  }
  const model = args.model ?? process.env.ELSA_MODEL ?? 'claude-3-haiku-20240307';
  const maxTokens = args.maxTokens ?? parseInt(process.env.ELSA_MAX_TOKENS ?? '2048', 10);
  const temperature = args.temperature ?? 0.5;

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    temperature,
    system: args.system,
    messages: args.messages,
  };
  if (args.tools && args.tools.length > 0) {
    body.tools = args.tools;
  }

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
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
 * langLockMessage: kalau di-supply, append ke system prompt tiap iterasi
 * untuk reinforce language lock (pattern "last instructions win").
 */
export async function runAgenticLoop(args: {
  system: string;
  messages: ElsaMessage[];
  tools: ElsaTool[];
  toolExecutor: (name: string, input: Record<string, unknown>) => Promise<string>;
  maxIterations?: number;
  langLockMessage?: string;
}): Promise<{
  finalText: string;
  iterations: number;
  usage: { inputTokens: number; outputTokens: number };
}> {
  const maxIterations = args.maxIterations ?? 8;
  const messages: ElsaMessage[] = [...args.messages];
  let iterations = 0;
  let totalInput = 0;
  let totalOutput = 0;

  while (iterations < maxIterations) {
    iterations++;

    // Language lock reinforcement — combine system prompt tiap call
    const systemCombined = args.langLockMessage
      ? `${args.system}\n\n---\n\n${args.langLockMessage}`
      : args.system;

    const response = await callClaude({
      system: systemCombined,
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
        finalText: finalText || '[Elsa tidak menghasilkan text.]',
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

    throw new Error(`Unexpected stop_reason: ${response.stop_reason}`);
  }

  throw new Error(`Elsa mencapai max iterations (${maxIterations}) — kemungkinan tool loop.`);
}
