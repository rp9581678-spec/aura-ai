import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, type GenerateContentResponse } from '@google/genai';
import {
  extractGroundingSources,
  cleanThoughtAndBrokenText,
  isBrokenOrIncompleteReply,
  formatGroundingSourcesAsMarkdown,
} from './src/utils/auraLogic';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

function getGeminiClient(): GoogleGenAI | null {
  const envKey =
    typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY
      ? process.env.GEMINI_API_KEY
      : '';
  if (!envKey || envKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey: envKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface IncomingHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequestBody {
  message: string;
  history?: IncomingHistoryMessage[];
  systemInstruction?: string;
  enableWebSearch?: boolean;
  attachment?: {
    name: string;
    mimeType: string;
    base64Data?: string;
    textContent?: string;
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    const hasKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
    res.json({ ok: true, geminiConfigured: hasKey });
  });

  app.post('/api/chat', async (req: Request, res: Response) => {
    try {
      const body = req.body as ChatRequestBody;
      const messageText = typeof body.message === 'string' ? body.message.trim() : '';

      if (!messageText && !body.attachment) {
        res.status(400).json({ error: 'Message or attachment is required.' });
        return;
      }

      const ai = getGeminiClient();
      if (!ai) {
        // Zero-API-Key Free Public Chat Fallback
        try {
          const combined = `${body.systemInstruction || ''}\n\nUser: ${messageText}\nAURA:`;
          const pollinationsRes = await fetch(`https://text.pollinations.ai/${encodeURIComponent(combined)}?model=openai`);
          const publicText = await pollinationsRes.text();
          const cleanPublic = (publicText || '').trim() || 'बॉस, कृपया एक बार फिर से पूछें।';
          res.json({
            text: cleanPublic,
            sources: [],
            usedWebSearch: false,
          });
          return;
        } catch {
          res.status(503).json({
            error: 'GEMINI_API_KEY is not configured in the server environment. Set it in Settings > Secrets.',
          });
          return;
        }
      }

      const liveDate = new Date().toLocaleDateString('en-IN', { dateStyle: 'full' });
      const nowLive = new Date().toLocaleString('en-IN', {
        dateStyle: 'full',
        timeStyle: 'short',
      });
      const liveClockInstruction = `TODAY'S EXACT DATE: ${liveDate}.\nCURRENT LIVE DATE & TIME: ${nowLive}.\nCRITICAL GROUNDING RULE: Always treat "${liveDate}" as today's exact live date. Provide accurate, real-time facts and search results as of ${liveDate}. Do NOT generate fake internal monologue, thought steps, or "* (Searching Google...)" placeholders.`;
      const finalSystemInstruction = `${liveClockInstruction}\n\n${body.systemInstruction || ''}`;

      const historyContents = (body.history || []).slice(-10).map((item) => ({
        role: item.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: item.content }],
      }));

      const currentParts: Array<
        { text: string } | { inlineData: { mimeType: string; data: string } }
      > = [];

      if (body.attachment) {
        if (body.attachment.base64Data && body.attachment.mimeType) {
          currentParts.push({
            inlineData: {
              mimeType: body.attachment.mimeType,
              data: body.attachment.base64Data,
            },
          });
        } else if (body.attachment.textContent) {
          currentParts.push({
            text: `[Attached File: ${body.attachment.name}]\n\`\`\`\n${body.attachment.textContent.slice(0, 12000)}\n\`\`\``,
          });
        }
      }

      if (messageText) {
        currentParts.push({ text: messageText });
      } else if (body.attachment) {
        currentParts.push({ text: `Please analyze the attached file (${body.attachment.name}).` });
      }

      const contents = [
        ...historyContents,
        {
          role: 'user',
          parts: currentParts,
        },
      ];

      const enableWebSearch = body.enableWebSearch !== false;

      // Self-healing auto-retry models in order of priority (using official, supported models)
      const FALLBACK_MODELS = [
        'gemini-3.5-flash-lite',
        'gemini-3.8-flash',
        'gemini-4-hydrogen',
      ];

      let finalCleanText = '';
      let finalSources: ReturnType<typeof extractGroundingSources> = [];
      let success = false;
      let lastError: unknown = null;
      const attemptLogs: string[] = [];

      for (const modelName of FALLBACK_MODELS) {
        // Try with search first if enabled; if search fails, try direct generation without search
        const searchModes = enableWebSearch ? [true, false] : [false];
        for (const withSearch of searchModes) {
          try {
            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error(`Timeout after 7000ms on ${modelName} (search=${withSearch})`)),
                7000
              )
            );

            const response: GenerateContentResponse = await Promise.race([
              ai.models.generateContent({
                model: modelName,
                contents,
                config: {
                  systemInstruction: finalSystemInstruction,
                  tools: withSearch ? [{ googleSearch: {} }] : undefined,
                },
              }),
              timeoutPromise,
            ]);

            const candidate = response.candidates?.[0];
            const rawParts = candidate?.content?.parts || [];

            // 1. Skip any part where part.thought === true
            const textParts = rawParts
              .filter((p: { thought?: boolean; text?: string }) => !p.thought)
              .map((p: { text?: string }) => (typeof p.text === 'string' ? p.text : ''))
              .filter(Boolean);

            let combinedText = textParts.join('').trim();
            if (!combinedText && response.text) {
              combinedText = response.text.trim();
            }

            // 2. Clean final text with regex to strip thoughts and placeholders
            let cleaned = cleanThoughtAndBrokenText(combinedText);

            // 3. Extract grounding chunks
            const groundingChunks = candidate?.groundingMetadata?.groundingChunks;
            const sources = extractGroundingSources(groundingChunks);

            // 4. Validate with isBrokenOrIncompleteReply
            if (isBrokenOrIncompleteReply(cleaned)) {
              continue;
            }

            // 5. Append real clickable groundingChunks source links if available and not already formatted
            if (sources.length > 0) {
              const hasExistingLinks = sources.some((s) => cleaned.includes(s.uri));
              if (!hasExistingLinks) {
                cleaned += formatGroundingSourcesAsMarkdown(sources);
              }
            }

            finalCleanText = cleaned;
            finalSources = sources;
            success = true;
            break;
          } catch (callErr: unknown) {
            lastError = callErr;
            const errMsg = callErr instanceof Error ? callErr.message : String(callErr);
            attemptLogs.push(`${modelName} (search=${withSearch}): ${errMsg}`);
          }
        }
        if (success) break;
      }

      if (!success) {
        if (finalCleanText && finalCleanText.length > 0) {
          res.json({
            text: finalCleanText,
            sources: finalSources,
            usedWebSearch: enableWebSearch && finalSources.length > 0,
          });
          return;
        }
        // Fallback to free zero-key Pollinations Text endpoint if all Gemini models fail
        try {
          const combined = `${finalSystemInstruction}\n\nUser: ${messageText || 'Analyze attached image/file'}\nAURA:`;
          const pollinationsRes = await fetch(
            `https://text.pollinations.ai/${encodeURIComponent(combined)}?model=openai`
          );
          if (pollinationsRes.ok) {
            const publicText = await pollinationsRes.text();
            const cleanPublic = cleanThoughtAndBrokenText((publicText || '').trim());
            if (cleanPublic) {
              res.json({
                text: cleanPublic,
                sources: [],
                usedWebSearch: false,
              });
              return;
            }
          }
        } catch {
          // ignore and fall through
        }
        console.error('All fallback attempts failed:', attemptLogs);
        throw lastError || new Error('All fallback models exhausted without a valid reply.');
      }

      res.json({
        text: finalCleanText,
        sources: finalSources,
        usedWebSearch: enableWebSearch && finalSources.length > 0,
      });
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : 'Unknown error calling Gemini API';

      let status = 500;
      let friendlyMsg = rawMsg;

      try {
        const parsed = JSON.parse(rawMsg) as { error?: { code?: number; message?: string } };
        if (parsed?.error?.message) {
          friendlyMsg = parsed.error.message;
          if (parsed.error.code) status = parsed.error.code;
        }
      } catch {
        // Not raw JSON
      }

      if (rawMsg.includes('429') || rawMsg.includes('RESOURCE_EXHAUSTED')) {
        status = 429;
        friendlyMsg =
          'Your Free Tier daily Gemini API quota has been reached. Wait for the quota window to reset, or select a billing-enabled API key in Settings > Secrets.';
        console.warn('[/api/chat] Quota limit reached (429)');
      } else if (
        rawMsg.includes('403') ||
        rawMsg.includes('PERMISSION_DENIED') ||
        rawMsg.includes('API_KEY_INVALID')
      ) {
        status = 403;
        friendlyMsg =
          'Gemini API key is invalid or lacks permission. Please verify GEMINI_API_KEY in Settings > Secrets.';
        console.warn('[/api/chat] Auth/permission issue (403)');
      } else if (rawMsg.includes('503') || rawMsg.includes('UNAVAILABLE')) {
        status = 503;
        friendlyMsg =
          'Gemini AI service is experiencing temporary high demand. Please click Regenerate or try again in a few seconds.';
        console.warn('[/api/chat] Upstream service busy (503)');
      } else {
        console.error('[/api/chat] Unexpected error:', friendlyMsg);
      }

      res.status(status).json({
        error: friendlyMsg,
      });
    }
  });

  // Smart Visual Prompt Enhancer & Translator for Image Generation
  app.post('/api/enhance-prompt', async (req: Request, res: Response) => {
    try {
      const { prompt } = req.body as { prompt?: string };
      const rawSubject = (prompt || '').trim();
      if (!rawSubject) {
        return res.json({
          enhancedPrompt: 'futuristic glowing sports car, photorealistic, vibrant colors, cinematic lighting, high detail',
        });
      }

      const ai = getGeminiClient();
      if (ai) {
        try {
          const aiResponse = await ai.models.generateContent({
            model: 'gemini-3.5-flash-lite',
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: `Convert this image request into a clean, safe, family-friendly English visual prompt (max 18 words, no quotes, only visual description): "${rawSubject}"`,
                  },
                ],
              },
            ],
          });
          const text = aiResponse.text?.trim()?.replace(/["']/g, '');
          if (text && text.length > 3) {
            return res.json({ enhancedPrompt: text });
          }
        } catch {
          // Fallback to local quality tags
        }
      }

      const defaultEnhanced = `${rawSubject}, photorealistic, vibrant colors, cinematic lighting, high detail`;
      res.json({ enhancedPrompt: defaultEnhanced });
    } catch {
      res.json({
        enhancedPrompt: 'futuristic glowing sports car, photorealistic, vibrant colors, cinematic lighting, high detail',
      });
    }
  });

  const publicPath = path.resolve(__dirname, 'public');
  app.use(express.static(publicPath));

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AURA server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start AURA server:', err);
  process.exit(1);
});
