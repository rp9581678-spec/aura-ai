import React, { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Globe,
  Play,
  RefreshCw,
  Square,
  Volume2,
} from 'lucide-react';
import { parseMessageSegments, sanitizeUserHTML } from '../utils/auraLogic';
import type { ChatMessage } from '../types/aura';

interface MessageBubbleProps {
  message: ChatMessage;
  isSpeakingThis: boolean;
  onSpeakToggle: (message: ChatMessage) => void;
  onRegenerate?: (messageId: string) => void;
  onRunCode: (language: string, code: string) => void;
}

function renderInlineFormatting(line: string, keyPrefix: string): React.ReactNode[] {
  // Split inline code (`...`), bold (**...**), markdown links [text](url), and raw URLs (https://...)
  const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)]+\)|https?:\/\/[^\s]+)/g;
  const parts = line.split(tokenRegex);

  return parts.map((part, idx) => {
    const key = `${keyPrefix}-${idx}`;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={key}
          className="font-mono rounded bg-white/10 px-1.5 py-0.5 text-[12.5px] text-[#00F0FF]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={key} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    const linkMatch = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/.exec(part);
    if (linkMatch) {
      return (
        <a
          key={key}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-[#00F0FF] underline decoration-[#00F0FF]/40 underline-offset-2 hover:text-[#67F7FF]"
        >
          <span>{linkMatch[1]}</span>
          <ExternalLink className="h-3 w-3" />
        </a>
      );
    }
    if (/^https?:\/\//.test(part)) {
      return (
        <a
          key={key}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-[#00F0FF] underline decoration-[#00F0FF]/40 underline-offset-2 hover:text-[#67F7FF]"
        >
          <span>{part}</span>
          <ExternalLink className="h-3 w-3" />
        </a>
      );
    }
    return <React.Fragment key={key}>{part}</React.Fragment>;
  });
}

function FormattedProse({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = (keyBase: string) => {
    if (listItems.length === 0) return;
    elements.push(
      <ul key={`${keyBase}-ul`} className="my-2 list-disc space-y-1 pl-5 text-[#E2E8F0]">
        {listItems.map((item, idx) => (
          <li key={`${keyBase}-li-${idx}`}>{renderInlineFormatting(item, `${keyBase}-li-${idx}`)}</li>
        ))}
      </ul>
    );
    listItems = [];
  };

  lines.forEach((rawLine, idx) => {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      flushList(`line-${idx}`);
      return;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      listItems.push(trimmed.replace(/^[-*]\s+/, ''));
      return;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      listItems.push(trimmed.replace(/^\d+\.\s+/, ''));
      return;
    }

    flushList(`line-${idx}`);

    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4 key={`h4-${idx}`} className="font-display mt-3 mb-1 text-sm font-semibold text-white">
          {renderInlineFormatting(trimmed.slice(4), `h4-${idx}`)}
        </h4>
      );
      return;
    }

    if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
      const textContent = trimmed.replace(/^#{1,3}\s+/, '');
      elements.push(
        <h3 key={`h3-${idx}`} className="font-display mt-3 mb-1.5 text-base font-semibold text-white">
          {renderInlineFormatting(textContent, `h3-${idx}`)}
        </h3>
      );
      return;
    }

    elements.push(
      <p key={`p-${idx}`} className="my-1.5 leading-relaxed text-[#E2E8F0]">
        {renderInlineFormatting(trimmed, `p-${idx}`)}
      </p>
    );
  });

  flushList('end');
  return <div className="space-y-1 text-sm">{elements}</div>;
}

function InteractiveImageCard({ url, alt }: { url: string; alt: string }) {
  const [currentUrl, setCurrentUrl] = useState(url);
  const [loaded, setLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [retried, setRetried] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleImageError = () => {
    if (!retried) {
      setRetried(true);
      // Auto-retry once with a simplified safe prompt and a new seed
      const safeSubject =
        (alt || 'modern concept art')
          .replace(/[^a-zA-Z0-9\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 50) || 'modern concept art';
      const retrySeed = Math.floor(Math.random() * 999999);
      const retryUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
        safeSubject + ', photorealistic, high quality, detailed lighting'
      )}?model=flux&width=1024&height=1024&seed=${retrySeed}&nologo=true&safe=true`;
      setCurrentUrl(retryUrl);
    } else {
      setHasError(true);
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const response = await fetch(currentUrl, { mode: 'cors' });
      if (!response.ok) throw new Error('Fetch failed');
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `AURA_${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      // Fallback for mobile browser cross-origin or sandbox limits
      window.open(currentUrl, '_blank');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="mt-2 max-w-[380px] overflow-hidden rounded-2xl border border-[#00F0FF]/35 bg-[#0B101B] shadow-xl">
      <div className="relative min-h-[220px] w-full overflow-hidden bg-[#0D1322]">
        {!loaded && !hasError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-[#090E1C] p-6 text-center">
            <div className="relative flex h-8 w-8 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00F0FF] opacity-35" />
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#00F0FF] border-t-transparent" />
            </div>
            <p className="font-mono text-xs font-medium text-[#00F0FF] animate-pulse">
              🎨 Designing your image...
            </p>
            <span className="text-[10.5px] text-[#94A3B8]">
              {retried
                ? 'Retrying with safe Flux parameters...'
                : 'Pollinations Flux Engine • 1024x1024'}
            </span>
          </div>
        )}

        <img
          src={currentUrl}
          alt={alt}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={handleImageError}
          className={`block w-full object-cover transition-opacity duration-300 ${
            loaded ? 'opacity-100 min-h-[220px]' : 'opacity-0 h-0'
          }`}
        />

        {hasError && (
          <div className="flex min-h-[180px] flex-col items-center justify-center p-4 text-center text-xs text-[#94A3B8]">
            <p className="font-medium text-amber-400">Preview pending or blocked.</p>
            <a
              href={currentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-[#00F0FF] underline underline-offset-2"
            >
              <span>Open direct image link</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-white/10 bg-[#070A12] px-3.5 py-2.5 text-xs text-[#94A3B8]">
        <div className="flex items-center gap-1.5 truncate pr-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
          <span className="truncate font-medium text-white">{alt || 'AI Generated Image'}</span>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          disabled={isDownloading}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#00F0FF]/30 bg-[#00F0FF]/15 px-3 py-1 font-semibold text-[#00F0FF] transition-all hover:bg-[#00F0FF]/25 active:scale-95 shadow-sm disabled:opacity-50"
        >
          {isDownloading ? (
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#00F0FF] border-t-transparent" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          <span>{isDownloading ? 'Saving...' : '⬇️ Download Image'}</span>
        </button>
      </div>
    </div>
  );
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isSpeakingThis,
  onSpeakToggle,
  onRegenerate,
  onRunCode,
}) => {
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [copiedCodeIdx, setCopiedCodeIdx] = useState<number | null>(null);

  const isUser = message.role === 'user';
  const segments = parseMessageSegments(message.content);

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMsg(true);
      window.setTimeout(() => setCopiedMsg(false), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  const handleCopyCode = async (code: string, index: number) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCodeIdx(index);
      window.setTimeout(() => setCopiedCodeIdx(null), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  if (isUser) {
    return (
      <div className="flex justify-end" data-testid="message-user">
        <div className="max-w-[85%] rounded-2xl border border-[#00F0FF]/30 bg-gradient-to-br from-[#00F0FF]/15 to-[#8B5CF6]/20 px-4 py-3 text-sm text-[#F8FAFC] md:max-w-[75%]">
          {message.attachment && (
            <div className="mb-2 rounded-xl border border-white/10 bg-[#07090E]/70 p-2">
              {message.attachment.previewUrl ? (
                <img
                  src={message.attachment.previewUrl}
                  alt={message.attachment.name}
                  className="max-h-44 rounded-lg object-contain"
                />
              ) : (
                <span className="font-mono text-xs text-[#00F0FF]">
                  Attached: {message.attachment.name}
                </span>
              )}
            </div>
          )}
          <p className="whitespace-pre-wrap leading-relaxed">{sanitizeUserHTML(message.content)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start" data-testid="message-assistant">
      <div
        className={`w-full max-w-[92%] rounded-2xl border px-4 py-3.5 md:max-w-[82%] ${
          message.error
            ? 'border-red-500/35 bg-red-950/25'
            : 'border-white/10 bg-[#0F1420]/85 backdrop-blur-md'
        }`}
      >
        <div className="mb-2 flex items-center justify-between gap-3 text-xs text-[#94A3B8]">
          <div className="flex items-center gap-2">
            <span className="font-display font-semibold tracking-wider text-[#00F0FF]">
              AURA
            </span>
            {message.usedWebSearch && (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                <Globe className="h-3 w-3" />
                Live Web Grounded
              </span>
            )}
          </div>
          <span className="font-mono text-[11px] tabular-nums text-[#64748B]">
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>

        <div className="space-y-2.5">
          {segments.map((seg, idx) => {
            if (seg.type === 'text') {
              return <FormattedProse key={idx} text={seg.content} />;
            }

            if (seg.type === 'image') {
              return <InteractiveImageCard key={idx} url={seg.url} alt={seg.alt} />;
            }

            return (
              <div
                key={idx}
                className="overflow-hidden rounded-xl border border-white/10 bg-[#05070C]"
              >
                <div className="flex items-center justify-between border-b border-white/10 bg-[#0D121D] px-3 py-1.5">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-[#94A3B8]">
                    {seg.language}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyCode(seg.code, idx)}
                      className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-[#CBD5E1] transition-colors hover:border-[#00F0FF]/40 hover:text-[#00F0FF]"
                    >
                      {copiedCodeIdx === idx ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Copy Code</span>
                        </>
                      )}
                    </button>

                    {seg.isRunnableWeb && (
                      <button
                        type="button"
                        onClick={() => onRunCode(seg.language, seg.code)}
                        className="inline-flex items-center gap-1 rounded-md border border-[#00F0FF]/40 bg-[#00F0FF]/15 px-2.5 py-1 text-[11px] font-semibold text-[#00F0FF] transition-colors hover:bg-[#00F0FF]/25"
                      >
                        <Play className="h-3 w-3" />
                        <span>Live Preview (Run)</span>
                      </button>
                    )}
                  </div>
                </div>
                <pre className="font-mono overflow-x-auto p-3.5 text-[12.5px] leading-relaxed text-[#E2E8F0]">
                  <code>{seg.code}</code>
                </pre>
              </div>
            );
          })}
        </div>

        {message.quizData && <InteractiveQuizWidget quizData={message.quizData} />}

        {message.sources && message.sources.length > 0 && (
          <div className="mt-3 border-t border-white/10 pt-2.5">
            <p className="mb-1.5 text-[11px] font-medium text-[#94A3B8]">
              Verified Web Sources
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {message.sources.map((src, i) => (
                <a
                  key={`${src.uri}-${i}`}
                  href={src.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-[260px] items-center gap-1 truncate text-xs text-[#00F0FF] hover:underline"
                >
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  <span className="truncate">{src.title}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-white/10 pt-2">
          <button
            type="button"
            onClick={() => onSpeakToggle(message)}
            className={`inline-flex items-center gap-1.5 text-xs font-medium transition-colors ${
              isSpeakingThis ? 'text-[#00F0FF]' : 'text-[#94A3B8] hover:text-[#F1F5F9]'
            }`}
          >
            {isSpeakingThis ? (
              <>
                <Square className="h-3.5 w-3.5" />
                <span>Stop</span>
              </>
            ) : (
              <>
                <Volume2 className="h-3.5 w-3.5" />
                <span>Listen</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleCopyMessage}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#94A3B8] transition-colors hover:text-[#F1F5F9]"
          >
            {copiedMsg ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>

          {onRegenerate && (
            <button
              type="button"
              onClick={() => onRegenerate(message.id)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#94A3B8] transition-colors hover:text-[#F1F5F9]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Regenerate</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

function InteractiveQuizWidget({ quizData }: { quizData: import('../types/aura').QuizItem[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [showScoreCard, setShowScoreCard] = useState(false);

  const currentQ = quizData[currentIndex];
  const selectedOption = selectedAnswers[currentIndex];
  const isAnswered = selectedOption !== undefined;

  const handleSelectOption = (optIdx: number) => {
    if (isAnswered) return;
    setSelectedAnswers({ ...selectedAnswers, [currentIndex]: optIdx });

    const isCorrect = optIdx === currentQ.answer;
    const boostText = isCorrect ? `Quiz Correct: ${currentQ.q} • Mastery Boost` : `Quiz Answered: ${currentQ.q}`;
    (window as unknown as { updateStudyGraphFromChat?: (t: string) => void }).updateStudyGraphFromChat?.(boostText);
  };

  const correctCount = Object.entries(selectedAnswers).filter(
    ([qIdx, optIdx]) => quizData[Number(qIdx)]?.answer === optIdx
  ).length;

  const totalAnswered = Object.keys(selectedAnswers).length;

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-emerald-500/40 bg-gradient-to-b from-[#0F172A] to-[#070A12] p-4 text-left text-white shadow-xl">
      <div className="flex items-center justify-between border-b border-emerald-500/25 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 font-bold text-xs">🎯</span>
          <div>
            <p className="font-semibold text-sm text-emerald-300">1-Tap Interactive Quiz</p>
            <p className="text-[11px] text-[#94A3B8]">
              {showScoreCard ? 'Quiz Completed' : `Question ${currentIndex + 1} of ${quizData.length}`}
            </p>
          </div>
        </div>
        {!showScoreCard && (
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[11px] font-medium text-emerald-400">
            {Math.round((totalAnswered / quizData.length) * 100)}% Done
          </span>
        )}
      </div>

      {!showScoreCard && currentQ ? (
        <div>
          <p className="text-sm font-medium leading-snug text-white mb-3.5">
            {currentQ.q}
          </p>
          <div className="space-y-2 mb-3.5">
            {currentQ.options.map((opt, optIdx) => {
              const isSelected = selectedOption === optIdx;
              const isCorrectOpt = optIdx === currentQ.answer;
              let btnStyle = 'border-white/10 bg-white/[0.04] text-[#E2E8F0] hover:bg-emerald-500/10 hover:border-emerald-500/40';
              if (isAnswered) {
                if (isCorrectOpt) {
                  btnStyle = 'border-emerald-500 bg-emerald-500/25 text-emerald-200 font-semibold shadow-[0_0_12px_rgba(16,185,129,0.3)]';
                } else if (isSelected && !isCorrectOpt) {
                  btnStyle = 'border-red-500 bg-red-500/25 text-red-200';
                } else {
                  btnStyle = 'border-white/5 bg-white/[0.02] text-[#94A3B8] opacity-60';
                }
              }

              return (
                <button
                  key={opt}
                  type="button"
                  disabled={isAnswered}
                  onClick={() => handleSelectOption(optIdx)}
                  className={`w-full text-left rounded-xl border px-3.5 py-2.5 text-xs transition-all flex items-center justify-between ${btnStyle}`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/10 font-mono text-[10px] text-emerald-400">
                      {String.fromCharCode(65 + optIdx)}
                    </span>
                    <span className="truncate">{opt}</span>
                  </div>
                  {isAnswered && isCorrectOpt && <span className="text-emerald-400 text-xs font-bold">✓</span>}
                  {isAnswered && isSelected && !isCorrectOpt && <span className="text-red-400 text-xs font-bold">✕</span>}
                </button>
              );
            })}
          </div>

          {isAnswered && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200 mb-3">
              <p className="font-semibold mb-0.5 text-emerald-300">💡 Explanation / Tip:</p>
              <p className="text-[11.5px] leading-relaxed text-[#E2E8F0]">{currentQ.tip}</p>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-[#94A3B8]">
              Score so far: <strong className="text-emerald-400">{correctCount}</strong> / {totalAnswered}
            </span>
            {currentIndex < quizData.length - 1 ? (
              <button
                type="button"
                disabled={!isAnswered}
                onClick={() => setCurrentIndex(currentIndex + 1)}
                className={`rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
                  isAnswered
                    ? 'bg-emerald-500 text-black hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 cursor-pointer'
                    : 'bg-white/10 text-white/40 cursor-not-allowed'
                }`}
              >
                Next Question →
              </button>
            ) : (
              <button
                type="button"
                disabled={!isAnswered}
                onClick={() => setShowScoreCard(true)}
                className={`rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
                  isAnswered
                    ? 'bg-gradient-to-r from-emerald-500 to-[#00F0FF] text-black hover:opacity-90 shadow-lg shadow-emerald-500/30 cursor-pointer'
                    : 'bg-white/10 text-white/40 cursor-not-allowed'
                }`}
              >
                🎯 View Final Scorecard
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="py-6 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 text-2xl font-bold mb-3 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
            🏆
          </div>
          <h4 className="font-display text-lg font-bold text-white mb-1">
            🎯 Final Score: {correctCount} / {quizData.length} • {Math.round((correctCount / quizData.length) * 100)}% Mastery
          </h4>
          <p className="text-xs text-emerald-300 font-semibold mb-4">
            3D Study Graph Mastery &amp; Target Percentage Boosted Live!
          </p>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                setSelectedAnswers({});
                setCurrentIndex(0);
                setShowScoreCard(false);
              }}
              className="rounded-xl border border-emerald-500/40 bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-300 transition-all hover:bg-emerald-500/30 hover:text-white"
            >
              🔄 Retake Quiz
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
