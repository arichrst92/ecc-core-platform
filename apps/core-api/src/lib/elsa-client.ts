/**
 * Elsa (Els Agentic) — Groq client (OpenAI-compatible API).
 *
 * Provider swap dari Anthropic → Groq (Llama 3.3 70B versatile).
 * Alasan: 35x lebih murah, 5-10x lebih cepat, still support tool calling.
 * Model default `llama-3.3-70b-versatile` (tool calling reliable, multi-turn OK).
 *
 * Fetch-based (no SDK dependency). Tool loop:
 *   1. Send messages + tools ke Groq → response.choices[0].message
 *   2. Kalau message.tool_calls exist → execute → append tool result ke history
 *   3. Kalau finish_reason='stop' → return final content
 *
 * Guard: max 8 iterations untuk prevent infinite loop.
 */

// ============================================================
// Types (OpenAI-compatible schema — dipakai Groq)
// ============================================================

export interface ElsaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ElsaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

interface GroqResponse {
  id: string;
  choices: Array<{
    index: number;
    message: ElsaMessage;
    finish_reason: 'stop' | 'tool_calls' | 'length' | 'content_filter';
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
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
// Groq call helper
// ============================================================

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export async function callGroq(args: CallArgs): Promise<GroqResponse> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY tidak di-set. Cek .env di server.');
  }
  const model = args.model ?? process.env.ELSA_MODEL ?? 'llama-3.3-70b-versatile';
  const maxTokens = args.maxTokens ?? parseInt(process.env.ELSA_MAX_TOKENS ?? '2048', 10);
  const temperature = args.temperature ?? 0.5;

  const messages: ElsaMessage[] = [
    { role: 'system', content: args.system },
    ...args.messages,
  ];

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature,
    stream: false,
  };
  if (args.tools && args.tools.length > 0) {
    body.tools = args.tools;
    body.tool_choice = 'auto';
  }

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq API error ${res.status}: ${text.slice(0, 500)}`);
  }

  return (await res.json()) as GroqResponse;
}

/**
 * Agentic loop — call Groq berulang sampai finish_reason='stop'.
 * Setiap tool_calls dieksekusi via toolExecutor lalu hasilnya append ke messages
 * sebagai role='tool' dgn tool_call_id match.
 *
 * langLockMessage (optional): kalau di-supply, inject sebagai system message
 * BARU setelah tool results tiap iterasi — pattern "last instructions win"
 * dari ide.asia untuk reinforce language lock (LLM kadang drift).
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

    // Language lock reinforcement — inject sebelum every LLM call kalau supplied.
    // Prepend ke system prompt supaya combined system instruction jadi 2 layer:
    //   [base system] + [language lock reminder]
    const systemCombined = args.langLockMessage
      ? `${args.system}\n\n---\n\n${args.langLockMessage}`
      : args.system;

    const response = await callGroq({
      system: systemCombined,
      messages,
      tools: args.tools,
    });
    totalInput += response.usage.prompt_tokens;
    totalOutput += response.usage.completion_tokens;

    const choice = response.choices[0];
    if (!choice) throw new Error('Groq return empty choices');
    const message = choice.message;

    // Append assistant response ke history
    messages.push(message);

    if (choice.finish_reason === 'stop' || choice.finish_reason === 'length') {
      const finalText = (message.content ?? '').trim();
      return {
        finalText: finalText || '[Elsa tidak menghasilkan text.]',
        iterations,
        usage: { inputTokens: totalInput, outputTokens: totalOutput },
      };
    }

    if (choice.finish_reason === 'tool_calls' && message.tool_calls) {
      for (const tc of message.tool_calls) {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(tc.function.arguments || '{}');
        } catch (e) {
          messages.push({
            role: 'tool',
            content: `Error parsing tool arguments: ${e instanceof Error ? e.message : String(e)}`,
            tool_call_id: tc.id,
          });
          continue;
        }
        try {
          const result = await args.toolExecutor(tc.function.name, parsedArgs);
          messages.push({
            role: 'tool',
            content: result,
            tool_call_id: tc.id,
          });
        } catch (e) {
          messages.push({
            role: 'tool',
            content: `Error: ${e instanceof Error ? e.message : String(e)}`,
            tool_call_id: tc.id,
          });
        }
      }
      continue;
    }

    if (choice.finish_reason === 'content_filter') {
      throw new Error('Groq content filter triggered.');
    }

    throw new Error(`Unexpected finish_reason: ${choice.finish_reason}`);
  }

  throw new Error(`Elsa mencapai max iterations (${maxIterations}) — kemungkinan tool loop.`);
}
