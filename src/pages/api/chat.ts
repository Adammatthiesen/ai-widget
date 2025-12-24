import type { APIRoute } from 'astro';
import OpenAI from 'openai';

interface ChatRequestBody {
    messages: Array<{ role: string; content: string }>;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
}

/**
 * POST /api/chat
 * 
 * Proxies chat requests to OpenAI's API with streaming support.
 * Accepts an array of messages and optional configuration parameters.
 * 
 * Environment variables:
 * - OPENAI_API_KEY: OpenAI API key (required)
 * - OPENAI_BASE_URL: Custom API base URL (optional)
 * - OPENAI_ORGANIZATION: OpenAI organization ID (optional)
 * - OPENAI_MODEL: Default model to use (optional, defaults to gpt-4o-mini)
 * 
 * Request body options:
 * - messages: Array of chat messages (required)
 * - model: OpenAI model to use (optional, overrides env default)
 * - temperature: Sampling temperature 0-2 (default: 0.7)
 * - maxTokens: Maximum tokens to generate (default: 2000)
 * - topP: Nucleus sampling parameter (default: 1)
 * - frequencyPenalty: Penalize frequent tokens (default: 0)
 * - presencePenalty: Penalize present tokens (default: 0)
 */
export const POST: APIRoute = async ({ request }) => {
    try {
        // Validate API key exists
        const apiKey = import.meta.env.OPENAI_API_KEY;
        if (!apiKey) {
            return new Response(
                JSON.stringify({ error: 'OpenAI API key not configured' }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            );
        }

        // Parse request body with typed interface
        const body = await request.json() as ChatRequestBody;
        const {
            messages,
            model,
            temperature = 0.7,
            maxTokens = 2000,
            topP = 1,
            frequencyPenalty = 0,
            presencePenalty = 0,
        } = body;

        // Get optional configuration from environment
        const baseURL = import.meta.env.OPENAI_BASE_URL;
        const organization = import.meta.env.OPENAI_ORGANIZATION;
        const defaultModel = import.meta.env.OPENAI_MODEL || 'gpt-4o-mini';

        // Use provided model or fall back to env default
        const selectedModel = model || defaultModel;

        // Validate messages array
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return new Response(
                JSON.stringify({ error: 'Invalid messages array' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        // Validate numeric parameters
        if (temperature < 0 || temperature > 2) {
            return new Response(
                JSON.stringify({ error: 'Temperature must be between 0 and 2' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        if (maxTokens < 1 || maxTokens > 128000) {
            return new Response(
                JSON.stringify({ error: 'maxTokens must be between 1 and 128000' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        // Initialize OpenAI client with optional configuration
        const openai = new OpenAI({
            apiKey,
            ...(baseURL && { baseURL }),
            ...(organization && { organization }),
        });

        // Create streaming chat completion with all parameters
        const stream = await openai.chat.completions.create({
            model: selectedModel,
            messages: messages as any,
            stream: true,
            temperature,
            max_tokens: maxTokens,
            top_p: topP,
            frequency_penalty: frequencyPenalty,
            presence_penalty: presencePenalty,
        });

        // Create a ReadableStream for Server-Sent Events
        const encoder = new TextEncoder();
        const readableStream = new ReadableStream({
            async start(controller) {
                try {
                    // Stream OpenAI responses as SSE
                    for await (const chunk of stream) {
                        const content = chunk.choices[0]?.delta?.content;
                        if (content) {
                            // Format as Server-Sent Event
                            const data = `data: ${JSON.stringify({ content })}\n\n`;
                            controller.enqueue(encoder.encode(data));
                        }
                    }

                    // Send completion signal
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                    controller.close();
                } catch (error) {
                    console.error('Streaming error:', error);
                    controller.error(error);
                }
            },
        });

        // Return streaming response with appropriate headers
        return new Response(readableStream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });

    } catch (error) {
        console.error('Chat API error:', error);

        // Return error response
        return new Response(
            JSON.stringify({
                error: error instanceof Error ? error.message : 'An error occurred'
            }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
};
