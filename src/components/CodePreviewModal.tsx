import React, { useState } from 'react';
import { RotateCw, X } from 'lucide-react';
import { buildRunnableHtmlDocument } from '../utils/auraLogic';

interface CodePreviewModalProps {
  language: string;
  code: string;
  onClose: () => void;
}

export const CodePreviewModal: React.FC<CodePreviewModalProps> = ({
  language,
  code,
  onClose,
}) => {
  const [reloadSeed, setReloadSeed] = useState(0);
  const srcDoc = buildRunnableHtmlDocument(language, code);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Live Code Preview"
      data-testid="code-preview-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
    >
      <div className="flex h-[82vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0D121E] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-3">
            <h3 className="font-display text-sm font-semibold text-[#F1F5F9]">
              Live Code Preview
            </h3>
            <span className="font-mono text-xs uppercase text-[#00F0FF]">
              {language}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setReloadSeed((s) => s + 1)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-[#CBD5E1] transition-colors hover:text-white"
            >
              <RotateCw className="h-3.5 w-3.5" />
              <span>Re-run</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close live preview"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-[#94A3B8] transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 bg-[#07090E]">
          <iframe
            key={reloadSeed}
            title="Live Code Sandbox"
            sandbox="allow-scripts"
            srcDoc={srcDoc}
            className="h-full w-full border-0 bg-white"
          />
        </div>
      </div>
    </div>
  );
};
