import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  Code2,
  Globe,
  Menu,
  Mic,
  MicOff,
  Paperclip,
  Plus,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import { AdminPanel } from './components/AdminPanel';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { AuthScreen } from './components/AuthScreen';
import { CodePreviewModal } from './components/CodePreviewModal';
import { HologramStage } from './components/HologramStage';
import { MessageBubble } from './components/MessageBubble';
import { SettingsModal } from './components/SettingsModal';
import { Sidebar } from './components/Sidebar';
import { SplashScreen } from './components/SplashScreen';
import type {
  AdminConfig,
  AiState,
  AppScreen,
  AttachmentData,
  AuthUser,
  ChatMessage,
  ChatSession,
  DailyGoal,
  ManagedUser,
  SmartMode,
  TelemetryData,
  UserSettings,
  VoiceProfile,
} from './types/aura';
import {
  buildCleanVisualPrompt,
  buildPollinationsImageUrl,
  buildSystemInstruction,
  cleanImageSubject,
  deriveSessionTitle,
  detectCodingIntent,
  detectEffectiveLanguage,
  extractCleanImagePrompt,
  formatConversationMarkdown,
  getPollinationsFluxUrl,
  getQuickPrompts,
  isImageGenerationRequest,
  resolveHologramMode,
  cleanThoughtAndBrokenText,
  generateStudyQuiz,
  pushCloudAnalytics,
  syncUserDataToCloud,
  fetchUserDataFromCloud,
  sanitizeUserHTML,
  fetchAuraReply,
  getSafeEnvApiKey,
} from './utils/auraLogic';
import {
  loadActiveSessionId,
  loadAdminConfig,
  loadAuthUser,
  loadManagedUsers,
  loadSessions,
  loadSettings,
  loadTelemetry,
  recordTelemetryEvent,
  saveActiveSessionId,
  saveAdminConfig,
  saveAuthUser,
  saveManagedUsers,
  saveSessions,
  saveSettings,
  saveTelemetry,
  loadDailyGoal,
  saveDailyGoal,
} from './utils/storage';

interface SpeechRecognitionResultEventLike {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>;
}

interface SpeechRecognitionInstanceLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((ev: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

const STARTER_PROMPTS: Array<{
  title: string;
  prompt: string;
  mode: SmartMode;
  icon: 'globe' | 'code' | 'book';
}> = [
  {
    title: 'Live Web Briefing',
    prompt: 'What are the latest breakthroughs in space exploration and AI this week?',
    mode: 'general',
    icon: 'globe',
  },
  {
    title: 'Interactive Code Sandbox',
    prompt: 'Create a sleek interactive HTML/CSS/JS digital stopwatch card with start, pause, and reset buttons.',
    mode: 'coding',
    icon: 'code',
  },
  {
    title: 'Study & Exam Breakdown',
    prompt: 'Explain Newton’s laws of motion with simple everyday analogies and 3 quick quiz questions.',
    mode: 'study',
    icon: 'book',
  },
];

export default function App() {
  const autostart = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('autostart') === '1';
  }, []);

  const [authUser, setAuthUser] = useState<AuthUser | null>(() => {
    if (autostart) {
      return {
        identifier: 'guest@aura.ai',
        role: 'guest',
        loggedInAt: Date.now(),
      };
    }
    return loadAuthUser();
  });

  useEffect(() => {
    if (authUser) {
      pushCloudAnalytics(authUser, sessionQueriesCount);
    }
  }, [authUser]);

  const [screen, setScreen] = useState<AppScreen | 'analytics'>(() => {
    if (autostart) return 'app';
    return 'splash';
  });

   const isGuestUser =
    !authUser ||
    authUser.role === 'guest' ||
    authUser.identifier.toLowerCase() === 'guest@aura.ai';

  useEffect(() => {
    if (isGuestUser) {
      setSessions([]);
      setActiveSessionId(null);
      setSettings(loadSettings());
      return;
    }
    setSessions(loadSessions());
    setActiveSessionId(loadActiveSessionId());
    setSettings(loadSettings());

    const initCloudSync = async () => {
      const cloudData = await fetchUserDataFromCloud(authUser);
      if (cloudData) {
        if (cloudData.chats && Array.isArray(cloudData.chats) && cloudData.chats.length > 0) {
          setSessions(cloudData.chats);
        }
        if (typeof cloudData.memory === 'string' && cloudData.memory.trim()) {
          setSettings((prev) => ({ ...prev, personalMemory: cloudData.memory || '' }));
        }
      }
    };
    initCloudSync();
  }, [authUser, isGuestUser]);

  const [settings, setSettings] = useState<UserSettings>(() => loadSettings());
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadSessions());

  const [langMode, setLangMode] = useState<string>(() => {
    if (typeof window === 'undefined') return 'auto';
    return localStorage.getItem('aura_lang_mode') || 'auto';
  });

  const [saveBadgeText, setSaveBadgeText] = useState('☁️ Saved ✓');
  const [saveBadgeColor, setSaveBadgeColor] = useState('#10b981');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isGuestUser) {
      setSaveBadgeText('👤 Guest (Temp)');
      setSaveBadgeColor('#94a3b8');
      return;
    }
    try {
      syncUserDataToCloud(sessions, settings.personalMemory, authUser);

      setSaveBadgeText('⏳ Saving...');
      setSaveBadgeColor('#00f0ff');
      const timer = setTimeout(() => {
        setSaveBadgeText('☁️ Saved ✓');
        setSaveBadgeColor('#10b981');
      }, 450);
      return () => clearTimeout(timer);
    } catch {
      // ignore
    }
  }, [sessions, settings.personalMemory, authUser, isGuestUser]);
  

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('aura_lang_mode', langMode);
  }, [langMode]);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(() =>
    loadActiveSessionId()
  );
  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) || null,
    [sessions, activeSessionId]
  );
  const [smartMode, setSmartMode] = useState<SmartMode>('live');
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [liveCallActive, setLiveCallActive] = useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
  const [adminConfig, setAdminConfig] = useState<AdminConfig>(() => loadAdminConfig());
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>(() => loadManagedUsers());
  const [telemetry, setTelemetry] = useState<TelemetryData>(() => loadTelemetry());
  const [dailyGoal, setDailyGoal] = useState<DailyGoal>(() => loadDailyGoal());

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [personaMenuOpen, setPersonaMenuOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<{
    id: 'image' | 'search' | 'upload' | 'coding' | 'study';
    label: string;
    placeholder: string;
  } | null>(null);

  const [previewTarget, setPreviewTarget] = useState<{
    language: string;
    code: string;
  } | null>(null);

  const [inputText, setInputText] = useState('');
  const [attachment, setAttachment] = useState<AttachmentData | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingNote, setThinkingNote] = useState('');
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [inputNotice, setInputNotice] = useState('');
  const [sessionQueriesCount, setSessionQueriesCount] = useState(0);
  const [reactionTrigger, setReactionTrigger] = useState<{ text: string; id: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstanceLike | null>(null);
  const lastSentMsgRef = useRef<{ text: string; time: number }>({ text: '', time: 0 });
  const msgTimestampsRef = useRef<number[]>([]);
  const imgTimestampsRef = useRef<number[]>([]);

  // Close sidebar on mobile resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Live Code Runner enhancement effect
  useEffect(() => {
    (window as unknown as {
      openLiveCodeRunner?: (code: string) => void;
      currentSandboxCode?: string;
    }).openLiveCodeRunner = (rawCode: string) => {
      (window as unknown as { currentSandboxCode?: string }).currentSandboxCode = rawCode;
      const iframe = document.getElementById('aura-runner-iframe') as HTMLIFrameElement;
      const modal = document.getElementById('aura-code-runner-modal');
      if (!iframe || !modal) return;

      const hasHtmlMarkup = /<(html|body|div|canvas|svg|style|h1|h2|p|button|input|script)\b/i.test(rawCode);
      const executableDocument = hasHtmlMarkup ? rawCode : `
        <!DOCTYPE html>
        <html>
        <head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin:0; padding:16px; background:#090d16; color:#e2e8f0; font-family:monospace; font-size:13.5px;">
          <div style="color:#00f0ff; font-weight:bold; margin-bottom:10px; border-bottom:1px solid #1e293b; padding-bottom:6px;">
            ▶ JavaScript Console Output:
          </div>
          <pre id="aura-js-console" style="white-space:pre-wrap; line-height:1.5; color:#10b981;"></pre>
          <script>
            const outEl = document.getElementById('aura-js-console');
            const printLine = (prefix, args, color) => {
              const line = document.createElement('div');
              if (color) line.style.color = color;
              line.textContent = prefix + args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
              outEl.appendChild(line);
            };
            console.log = (...args) => printLine('', args);
            console.warn = (...args) => printLine('⚠️ ', args, '#fbbf24');
            console.error = (...args) => printLine('❌ ', args, '#f87171');
            try {
              ${rawCode}
            } catch (err) {
              printLine('❌ Runtime Error: ', [err.message], '#f87171');
            }
          <\/script>
        </body>
        </html>
      `;

      iframe.srcdoc = executableDocument;
      modal.style.display = 'flex';
    };

    const enhanceAllChatCodeBlocks = () => {
      document.querySelectorAll('pre').forEach((preEl) => {
        if (preEl.getAttribute('data-aura-runner-attached') === '1') return;
        const codeEl = preEl.querySelector('code');
        if (!codeEl) return;

        preEl.setAttribute('data-aura-runner-attached', '1');
        preEl.classList.add('aura-enhanced-pre');

        const langClass = Array.from(codeEl.classList).find((c) => c.startsWith('language-'));
        const langLabel = langClass ? langClass.replace('language-', '') : 'CODE';

        const toolbar = document.createElement('div');
        toolbar.className = 'aura-code-toolbar';

        const leftLabel = document.createElement('span');
        leftLabel.className = 'aura-code-lang';
        leftLabel.textContent = `💻 ${langLabel}`;

        const btnGroup = document.createElement('div');
        btnGroup.className = 'aura-code-actions';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'aura-btn-copy';
        copyBtn.textContent = '📋 Copy';
        copyBtn.onclick = () => {
          navigator.clipboard.writeText(codeEl.innerText);
          copyBtn.textContent = '✅ Copied';
          setTimeout(() => (copyBtn.textContent = '📋 Copy'), 1800);
        };

        const runBtn = document.createElement('button');
        runBtn.className = 'aura-btn-run';
        runBtn.textContent = '▶️ Run Live';
        runBtn.onclick = () => {
          (window as unknown as { openLiveCodeRunner?: (c: string) => void }).openLiveCodeRunner?.(
            codeEl.innerText
          );
        };

        btnGroup.appendChild(copyBtn);
        btnGroup.appendChild(runBtn);
        toolbar.appendChild(leftLabel);
        toolbar.appendChild(btnGroup);

        preEl.parentNode?.insertBefore(toolbar, preEl);
      });
    };

    const observer = new MutationObserver(() => enhanceAllChatCodeBlocks());
    observer.observe(document.body, { childList: true, subtree: true });
    enhanceAllChatCodeBlocks();
    const interval = setInterval(enhanceAllChatCodeBlocks, 800);

    return () => {
      observer.disconnect();
      clearInterval(interval);
    };
  }, [activeSession?.messages.length]);

  // Splash timer (1.5s) unless autostart=1
  useEffect(() => {
    if (autostart) return;
    if (screen !== 'splash') return;
    const timer = window.setTimeout(() => {
      if (authUser) {
        setScreen('app');
      } else {
        setScreen('auth');
      }
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [autostart, authUser, screen]);

  // Persist state slices
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);

  useEffect(() => {
    saveActiveSessionId(activeSessionId);
  }, [activeSessionId]);

  useEffect(() => {
    saveAdminConfig(adminConfig);
  }, [adminConfig]);

  useEffect(() => {
    saveManagedUsers(managedUsers);
  }, [managedUsers]);

  useEffect(() => {
    saveTelemetry(telemetry);
  }, [telemetry]);


  const lastUserMessageText = useMemo(() => {
    if (!activeSession) return inputText;
    const lastUser = [...activeSession.messages]
      .reverse()
      .find((m) => m.role === 'user');
    return inputText.trim() ? inputText : lastUser?.content || '';
  }, [activeSession, inputText]);

  const hologramMode = useMemo(
    () =>
      resolveHologramMode(
        settings.animationStyle,
        smartMode,
        lastUserMessageText
      ),
    [settings.animationStyle, smartMode, lastUserMessageText]
  );

  const aiState: AiState = useMemo(() => {
    if (isThinking) return 'thinking';
    if (speakingMessageId) return 'speaking';
    return 'idle';
  }, [isThinking, speakingMessageId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages.length, isThinking]);

  const stopSpeech = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingMessageId(null);
  }, []);

  const speakText = useCallback(
    (
      text: string,
      messageId: string,
      profileOverride?: VoiceProfile,
      speedOverride?: number
    ) => {
      if (voiceMuted) return;
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        setInputNotice('Text-to-Speech is not supported in this browser.');
        return;
      }

      window.speechSynthesis.cancel();
      const plainText = text
        .replace(/```[\s\S]*?```/g, ' Code snippet displayed on screen. ')
        .replace(/[#*_`>]/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();

      if (!plainText) return;

      const utterance = new SpeechSynthesisUtterance(plainText);
      const profile = profileOverride || settings.voiceProfile;
      const speed = speedOverride ?? settings.speechSpeed;

      utterance.rate = speed;
      if (profile === 'Orion') utterance.pitch = 0.85;
      else if (profile === 'Echo') utterance.pitch = 1.15;
      else if (profile === 'Lyra') utterance.pitch = 1.25;
      else utterance.pitch = 1.0;

      const hasDevanagari = /[\u0900-\u097F]/.test(plainText);
      const effectiveLang = detectEffectiveLanguage(plainText, langMode);
      const targetLang = (hasDevanagari || effectiveLang === 'Hindi') ? 'hi-IN' : 'en-IN';
      utterance.lang = targetLang;

      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        const matchedVoice =
          voices.find((v) => v.lang.toLowerCase().includes(targetLang.toLowerCase())) ||
          voices.find((v) => v.lang.toLowerCase().startsWith(targetLang.slice(0, 2)));
        if (matchedVoice) utterance.voice = matchedVoice;
      }

      utterance.onend = () => setSpeakingMessageId(null);
      utterance.onerror = () => setSpeakingMessageId(null);

      setSpeakingMessageId(messageId);
      window.speechSynthesis.speak(utterance);
    },
    [langMode, settings.speechSpeed, settings.voiceProfile]
  );

  const handleSpeakToggle = useCallback(
    (msg: ChatMessage) => {
      if (speakingMessageId === msg.id) {
        stopSpeech();
      } else {
        speakText(msg.content, msg.id);
      }
    },
    [speakingMessageId, speakText, stopSpeech]
  );

    const handleAuthenticated = (user: AuthUser, openAdminImmediately: boolean) => {
    saveAuthUser(user);
    setAuthUser(user);

    if (user.role === 'guest' || user.identifier.toLowerCase() === 'guest@aura.ai') {
      setSessions([]);
      setActiveSessionId(null);
    } else {
      setSessions(loadSessions());
      setActiveSessionId(loadActiveSessionId());
    }

    const updated = recordTelemetryEvent((prev) => {
      const isNewUser = !managedUsers.some((u) => u.identifier === user.identifier);
      return {
        ...prev,
        totalRegisteredUsers: isNewUser ? prev.totalRegisteredUsers + 1 : Math.max(prev.totalRegisteredUsers, 1),
        activeSessionsCount: 1,
        activityLogs: [
          {
            id: `log-${Date.now()}`,
            timestamp: Date.now(),
            text: `User signed in: ${user.identifier} (${user.role})`,
          },
          ...prev.activityLogs,
        ],
      };
    });
    setTelemetry(updated);

    setScreen(openAdminImmediately ? 'admin' : 'app');
  };

  const handleLogout = () => {
    stopSpeech();
    saveAuthUser(null);
    setAuthUser(null);
    setSessions([]);
    setActiveSessionId(null);
    setSettingsOpen(false);

    const updated = recordTelemetryEvent((prev) => ({
      ...prev,
      activeSessionsCount: 0,
      activityLogs: [
        {
          id: `log-${Date.now()}`,
          timestamp: Date.now(),
          text: `User logged out`,
        },
        ...prev.activityLogs,
      ],
    }));
    setTelemetry(updated);

    setScreen('auth');
  };
  

  

  const handleNewChat = () => {
    stopSpeech();
    setActiveSessionId(null);
    setInputNotice('');
  };

  const handleDeleteSession = (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) {
      setActiveSessionId(null);
    }
  };

  const handleClearAllHistory = () => {
    stopSpeech();
    setSessions([]);
    setActiveSessionId(null);
  };

  const handleExportChat = () => {
    if (!activeSession || activeSession.messages.length === 0) {
      setInputNotice('Start a conversation first before exporting.');
      window.setTimeout(() => setInputNotice(''), 2500);
      return;
    }

    const md = formatConversationMarkdown(activeSession);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aura-chat-${activeSession.id}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setInputNotice('');

    if (file.size > 8 * 1024 * 1024) {
      setInputNotice('File size must be under 8 MB.');
      return;
    }

    const reader = new FileReader();
    if (file.type.startsWith('image/') || file.type === 'application/pdf') {
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        const base64Data = result.includes(',') ? result.split(',')[1] : '';
        setAttachment({
          name: file.name,
          mimeType: file.type,
          size: file.size,
          base64Data,
          previewUrl: file.type.startsWith('image/') ? result : undefined,
        });
      };
      reader.readAsDataURL(file);
    } else {
      reader.onload = () => {
        const textContent = typeof reader.result === 'string' ? reader.result : '';
        setAttachment({
          name: file.name,
          mimeType: file.type || 'text/plain',
          size: file.size,
          textContent,
        });
      };
      reader.readAsText(file);
    }
  };

  const toggleVoiceInput = () => {
    setInputNotice('');
    if (isRecording && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      setIsRecording(false);
      return;
    }

    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstanceLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstanceLike;
    };
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRec) {
      setInputNotice('⚠️ बॉस, इस ब्राउज़र में वॉइस टाइपिंग सपोर्ट नहीं है—कृपया Google Chrome इस्तेमाल करें।');
      return;
    }

    try {
      const recognition = new SpeechRec();
      // Set 'hi-IN' for pure Hindi Devanagari script typing when Hindi is chosen, otherwise 'en-IN'
      recognition.lang = settings.language === 'Hindi' ? 'hi-IN' : 'en-IN';
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;

      const baseText = inputText.trim();

      recognition.onstart = () => {
        setIsRecording(true);
      };

      recognition.onresult = (event: SpeechRecognitionResultEventLike) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const piece = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += piece;
          } else {
            interimTranscript += piece;
          }
        }

        const spoken = (finalTranscript || interimTranscript).trim();
        if (spoken) {
          setInputText(baseText ? `${baseText} ${spoken}` : spoken);
        }
      };

      recognition.onerror = (event: { error?: string }) => {
        setIsRecording(false);
        const errType = event?.error;
        if (errType === 'not-allowed' || errType === 'service-not-allowed') {
          setInputNotice('🎙️ माइक की अनुमति बंद है बॉस! ब्राउज़र के ऊपर 🔒 ताले पर क्लिक करके Microphone Allow करें।');
        } else if (errType === 'no-speech') {
          setInputNotice('🤫 कोई आवाज़ सुनाई नहीं दी—माइक दबाकर थोड़ा करीब से बोलें।');
        } else {
          setInputNotice('🎙️ माइक रीसेट हो गया है, कृपया दोबारा टैप करके बोलें।');
        }
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsRecording(false);
      setInputNotice('🎙️ माइक शुरू करने के लिए पेज को एक बार रिफ्रेश करें बॉस।');
    }
  };

  const speakLiveCallReplyAndResume = (rawText: string) => {
    if (!liveCallActive) return;

    const cleanSpeech = rawText
      .replace(/```[\s\S]*?```/g, 'कोड स्क्रीन पर लिख दिया है।')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[*#_`~>]/g, '')
      .trim()
      .slice(0, 450);
  const stopSpeech = useCallback(() => {
    const ttsWin = window as unknown as {
      __auraTtsAudio?: HTMLAudioElement | null;
      __auraTtsCancelled?: boolean;
    };
    ttsWin.__auraTtsCancelled = true;
    if (ttsWin.__auraTtsAudio) {
      try {
        ttsWin.__auraTtsAudio.pause();
        ttsWin.__auraTtsAudio.src = '';
      } catch {}
      ttsWin.__auraTtsAudio = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    setSpeakingMessageId(null);
  }, []);

  const speakText = useCallback(
    (
      text: string,
      messageId: string,
      profileOverride?: VoiceProfile,
      speedOverride?: number
    ) => {
      if (voiceMuted) return;

      const cleanText = text
        .replace(/```[\s\S]*?```/g, ' Code snippet. ')
        .replace(/[#*_`>~]/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();

      if (!cleanText) return;

      stopSpeech();

      const ttsWin = window as unknown as {
        __auraTtsAudio?: HTMLAudioElement | null;
        __auraTtsCancelled?: boolean;
      };
      ttsWin.__auraTtsCancelled = false;

      const speed = Math.min(Math.max(speedOverride ?? settings.speechSpeed ?? 1, 0.7), 1.5);
      const isHindi = /[\u0900-\u097F]/.test(cleanText) || settings.language === 'Hindi';
      const langTag = isHindi ? 'hi-IN' : 'en-IN';
      const ttsLang = isHindi ? 'hi' : 'en-IN';

      // Split text into natural chunks (max 160 chars) so neither Chrome nor APK cuts off
      const rawParts = cleanText.match(/[^.?!।\n]+[.?!।\n]*/g) || [cleanText];
      const chunks: string[] = [];
      for (const part of rawParts) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        if (trimmed.length <= 160) {
          chunks.push(trimmed);
        } else {
          const words = trimmed.split(' ');
          let current = '';
          for (const w of words) {
            if ((current + ' ' + w).trim().length > 160) {
              if (current) chunks.push(current.trim());
              current = w;
            } else {
              current = (current + ' ' + w).trim();
            }
          }
          if (current) chunks.push(current.trim());
        }
      }

      const finishAll = () => {
        if (!ttsWin.__auraTtsCancelled) {
          setSpeakingMessageId(null);
          if (liveCallActive) {
            setTimeout(() => startLiveCallListening(), 600);
          }
        }
      };

      // Engine 2: Native HTML5 Audio TTS (100% Working on Android APK WebView)
      const playAudioFallback = (index: number) => {
        if (ttsWin.__auraTtsCancelled || index >= chunks.length) {
          finishAll();
          return;
        }
        const chunk = chunks[index];
        const url = `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=gtx&tl=${encodeURIComponent(
          ttsLang
        )}&q=${encodeURIComponent(chunk)}`;

        const audio = new Audio(url);
        audio.playbackRate = speed;
        ttsWin.__auraTtsAudio = audio;

        audio.onended = () => {
          playAudioFallback(index + 1);
        };
        audio.onerror = () => {
          setSpeakingMessageId(null);
          setInputNotice('Audio playback blocked or offline. Please check internet.');
        };

        audio.play().catch(() => {
          setSpeakingMessageId(null);
          setInputNotice('Tap Listen again to allow audio playback.');
        });
      };

      // Engine 1: Web Speech API (Chrome / Desktop) with automatic fallback to Engine 2
      const startSpeechEngine = () => {
        setSpeakingMessageId(messageId);
        const hasWebSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window;
        const voices = hasWebSpeech ? window.speechSynthesis.getVoices() : [];

        if (!hasWebSpeech || voices.length === 0) {
          playAudioFallback(0);
          return;
        }

        const preferredVoice =
          voices.find((v) => v.lang.toLowerCase() === langTag.toLowerCase()) ||
          voices.find((v) => v.lang.toLowerCase().startsWith(ttsLang.toLowerCase())) ||
          voices[0];

        const speakChunk = (index: number) => {
          if (ttsWin.__auraTtsCancelled || index >= chunks.length) {
            finishAll();
            return;
          }
          try {
            const utter = new SpeechSynthesisUtterance(chunks[index]);
            utter.lang = langTag;
            if (preferredVoice) utter.voice = preferredVoice;
            utter.rate = speed;
            if (profileOverride === 'deep') utter.pitch = 0.85;
            else if (profileOverride === 'bright') utter.pitch = 1.15;

            utter.onend = () => speakChunk(index + 1);
            utter.onerror = () => {
              // If WebSpeech fails mid-way on mobile, switch seamlessly to Audio Engine
              playAudioFallback(index);
            };

            window.speechSynthesis.speak(utter);
          } catch {
            playAudioFallback(index);
          }
        };

        speakChunk(0);
      };

      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const initialVoices = window.speechSynthesis.getVoices();
        if (initialVoices.length === 0) {
          // Give mobile Chrome 150ms to load voices; if still 0 (Android APK), it uses Audio Engine
          setTimeout(startSpeechEngine, 150);
          return;
        }
      }

      startSpeechEngine();
    },
    [
      voiceMuted,
      stopSpeech,
      settings.speechSpeed,
      settings.language,
      liveCallActive,
      
      setInputNotice,
    ]
  );
    
    

  const startLiveCallListening = () => {
    if (!liveCallActive) return;

    // 1. Try SpeechRecognition first
    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstanceLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstanceLike;
    };
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRec) {
      // Fallback to MediaRecorder audio streaming to Gemini
      startMediaRecorderAudioFallback();
      return;
    }

    try {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }

      const recognition = new SpeechRec();
      recognition.lang = settings.language === 'Hindi' ? 'hi-IN' : 'en-IN';
      recognition.interimResults = true;
      recognition.continuous = true;

      let liveCallBuffer = '';
      let silenceTimer: number | null = null;
      let hasSubmitted = false;
      let startTimeout: number | null = null;

      recognition.onstart = () => {
        if (startTimeout) clearTimeout(startTimeout);
        setIsRecording(true);
        setInputNotice('🔴 Mic Listening... अब बोलिए');
      };

      // 2-second timeout guard on onstart
      startTimeout = window.setTimeout(() => {
        if (!isRecording && liveCallActive) {
          try { recognition.stop(); } catch {}
          startMediaRecorderAudioFallback();
        }
      }, 2000);

      recognition.onresult = (event: SpeechRecognitionResultEventLike) => {
        if (!liveCallActive || hasSubmitted) return;
        let fullText = '';
        for (let i = 0; i < event.results.length; i++) {
          fullText += event.results[i][0].transcript;
        }
        liveCallBuffer = fullText.trim();
        setInputText(liveCallBuffer);

        if (silenceTimer) clearTimeout(silenceTimer);
        if (liveCallBuffer.length > 0) {
          silenceTimer = window.setTimeout(() => {
            if (!hasSubmitted && liveCallBuffer.trim() && liveCallActive) {
              hasSubmitted = true;
              try { recognition.stop(); } catch {}
              setIsRecording(false);
              const spoken = liveCallBuffer.trim();
              setInputText('');
              setInputNotice('');
              handleSendMessage(spoken, 'live').then(() => {
                const currentChat = sessions.find((s) => s.id === activeSessionId);
                const lastMsg = currentChat?.messages[currentChat.messages.length - 1];
                const replyText = lastMsg && lastMsg.role === 'assistant' ? lastMsg.content : 'जी बॉस, आगे बोलिए।';
                speakLiveCallReplyAndResume(replyText);
              }).catch(() => {
                if (liveCallActive) setTimeout(() => startLiveCallListening(), 1000);
              });
            }
          }, 1500);
        }
      };

      recognition.onerror = (event: { error?: string }) => {
        if (startTimeout) clearTimeout(startTimeout);
        setIsRecording(false);
        const err = event?.error;
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          setInputNotice('⚠️ AI Studio Preview ने माइक ब्लॉक किया है — इसे Chrome टैब में खोलें!');
          startMediaRecorderAudioFallback();
        } else {
          setInputNotice('🎙️ माइक रीसेट हो रहा है...');
          setTimeout(() => {
            if (liveCallActive) startLiveCallListening();
          }, 1000);
        }
      };

      recognition.onend = () => {
        if (startTimeout) clearTimeout(startTimeout);
        setIsRecording(false);
        if (!hasSubmitted && liveCallBuffer.trim() && liveCallActive) {
          hasSubmitted = true;
          const spoken = liveCallBuffer.trim();
          setInputText('');
          setInputNotice('');
          handleSendMessage(spoken, 'live').then(() => {
            const currentChat = sessions.find((s) => s.id === activeSessionId);
            const lastMsg = currentChat?.messages[currentChat.messages.length - 1];
            const replyText = lastMsg && lastMsg.role === 'assistant' ? lastMsg.content : 'जी बॉस, आगे बोलिए।';
            speakLiveCallReplyAndResume(replyText);
          }).catch(() => {
            if (liveCallActive) setTimeout(() => startLiveCallListening(), 1000);
          });
        } else if (liveCallActive && !hasSubmitted) {
          setTimeout(() => {
            if (liveCallActive) startLiveCallListening();
          }, 600);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsRecording(false);
      startMediaRecorderAudioFallback();
    }
  };

  const startMediaRecorderAudioFallback = () => {
    if (!liveCallActive) return;
    setInputNotice('🎙️ MediaRecorder Audio Mode Active... बोलिए');

    navigator.mediaDevices?.getUserMedia?.({ audio: true }).then((stream) => {
      const mediaRecorder = new MediaRecorder(stream);
      const audioChunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        if (!liveCallActive) return;

        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Full = reader.result as string;
          const base64Data = base64Full.includes(',') ? base64Full.split(',')[1] : '';

          if (base64Data && liveCallActive) {
            setInputNotice('⏳ AURA सुन रही है...');
            try {
              const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  message: 'Transcribe this voice note and answer/reply back directly in simple Hindi/Hinglish.',
                  attachment: {
                    name: 'voice-note.webm',
                    mimeType: 'audio/webm',
                    base64Data,
                  },
                }),
              });
              const data = await res.json();
              if (data.text) {
                speakLiveCallReplyAndResume(data.text);
              } else {
                if (liveCallActive) setTimeout(() => startLiveCallListening(), 1000);
              }
            } catch {
              if (liveCallActive) setTimeout(() => startLiveCallListening(), 1500);
            }
          } else if (liveCallActive) {
            setTimeout(() => startLiveCallListening(), 1000);
          }
        };
        reader.readAsDataURL(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);

      // 1.5-second silence / speech detector with AudioContext Analyser
      try {
        const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let silenceStartTime = Date.now();
        let hasSpoken = false;

        const checkInterval = window.setInterval(() => {
          if (!liveCallActive || mediaRecorder.state !== 'recording') {
            clearInterval(checkInterval);
            return;
          }
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;

          if (avg > 14) {
            hasSpoken = true;
            silenceStartTime = Date.now();
          } else if (hasSpoken && Date.now() - silenceStartTime > 1500) {
            clearInterval(checkInterval);
            try { mediaRecorder.stop(); } catch {}
            setIsRecording(false);
          }
        }, 200);
      } catch {
        // Fallback timer if AudioContext fails
        setTimeout(() => {
          if (mediaRecorder.state === 'recording') {
            try { mediaRecorder.stop(); } catch {}
            setIsRecording(false);
          }
        }, 5000);
      }
    }).catch(() => {
      setInputNotice('⚠️ AI Studio Preview ने माइक ब्लॉक किया है — इसे Chrome टैब में खोलें!');
      setLiveCallActive(false);
    });
  };

  const dispatchChatRequest = async (
    targetSessionId: string,
    promptText: string,
    historyMsgs: ChatMessage[],
    modeToUse: SmartMode,
    attachedFile: AttachmentData | null
  ) => {
    pushCloudAnalytics(authUser, sessionQueriesCount + 1);
    const looksLikeCoding = modeToUse === 'coding' || detectCodingIntent(promptText);
    setIsThinking(true);
    setThinkingNote(
      adminConfig.liveWebSearchEnabled && !looksLikeCoding
        ? 'Searching Live Web...'
        : 'Synthesizing Neural Response...'
    );

    try {
      const systemInstruction = buildSystemInstruction(
        settings,
        modeToUse,
        adminConfig.liveWebSearchEnabled,
        langMode,
        promptText
      );

      const envKey =
        typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY
          ? process.env.GEMINI_API_KEY
          : getSafeEnvApiKey();

      let replyText = '';
      let replySources: Array<{ title: string; uri: string }> | undefined;
      let replyUsedWebSearch = false;

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: promptText,
            history: historyMsgs.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            systemInstruction,
            enableWebSearch: adminConfig.liveWebSearchEnabled,
            attachment: attachedFile
              ? {
                  name: attachedFile.name,
                  mimeType: attachedFile.mimeType,
                  base64Data: attachedFile.base64Data,
                  textContent: attachedFile.textContent,
                }
              : undefined,
          }),
        });

        const data = (await response.json()) as {
          text?: string;
          sources?: Array<{ title: string; uri: string }>;
          usedWebSearch?: boolean;
          error?: string;
        };

        if (response.ok && data.text) {
          replyText = cleanThoughtAndBrokenText(data.text);
          replySources = data.sources;
          replyUsedWebSearch = Boolean(data.usedWebSearch);
        } else {
          throw new Error(data.error || `Status ${response.status}`);
        }
      } catch {
        // Guaranteed Zero-Key Public Chat & Vision Fallback via fetchAuraReply (Pollinations Text API when envKey is empty)
        replyText = await fetchAuraReply(promptText, {
          apiKey: envKey,
          history: historyMsgs.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          systemInstruction,
          enableWebSearch: adminConfig.liveWebSearchEnabled,
          attachment: attachedFile
            ? {
                name: attachedFile.name,
                mimeType: attachedFile.mimeType,
                base64Data: attachedFile.base64Data,
                textContent: attachedFile.textContent,
              }
            : undefined,
        });
      }

      const aiMessage: ChatMessage = {
        id: `msg-${Date.now()}-ai`,
        role: 'assistant',
        content: replyText || 'नमस्ते बॉस! कृपया अपना सवाल एक बार फिर से पूछें।',
        timestamp: Date.now(),
        mode: modeToUse,
        sources: replySources,
        usedWebSearch: replyUsedWebSearch,
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === targetSessionId
            ? {
                ...s,
                updatedAt: Date.now(),
                messages: [...s.messages, aiMessage],
              }
            : s
        )
      );
      setSessionQueriesCount((c) => c + 1);

      const telUpdated = recordTelemetryEvent((prev) => ({
        ...prev,
        totalQueriesProcessed: prev.totalQueriesProcessed + 1,
        activityLogs: [
          {
            id: `log-${Date.now()}`,
            timestamp: Date.now(),
            text: `Query processed in ${modeToUse} mode`,
          },
          ...prev.activityLogs,
        ],
      }));
      setTelemetry(telUpdated);
      setReactionTrigger({ text: aiMessage.content, id: Date.now() });
      (window as unknown as { updateStudyGraphFromChat?: (t: string) => void }).updateStudyGraphFromChat?.(
        aiMessage.content
      );

      if (settings.autoSpeak && aiMessage.content) {
        speakText(aiMessage.content, aiMessage.id);
      }
    } catch {
      const fallbackReply = await fetchAuraReply(promptText, {
        systemInstruction: buildSystemInstruction(
          settings,
          modeToUse,
          adminConfig.liveWebSearchEnabled,
          langMode,
          promptText
        ),
      });
      const fallbackMsg: ChatMessage = {
        id: `msg-${Date.now()}-ai`,
        role: 'assistant',
        content: fallbackReply,
        timestamp: Date.now(),
        mode: modeToUse,
      };
      setSessions((prev) =>
        prev.map((s) =>
          s.id === targetSessionId
            ? {
                ...s,
                updatedAt: Date.now(),
                messages: [...s.messages, fallbackMsg],
              }
            : s
        )
      );
    } finally {
      setIsThinking(false);
      setThinkingNote('');
    }
  };

  const handleSendMessage = async (overridePrompt?: string, overrideMode?: SmartMode) => {
    const rawPrompt = typeof overridePrompt === 'string' ? overridePrompt : inputText;
    const trimmed = rawPrompt.trim();
    const activeAttach = typeof overridePrompt === 'string' ? null : attachment;

    const modeToUse = overrideMode || smartMode;
    if (overrideMode) {
      setSmartMode(overrideMode);
    }

    // 1. Automatic Image Intent Detection (English, Hindi, Hinglish, or activeTool === 'image')
    const isImageRequest =
      (activeTool?.id === 'image' || isImageGenerationRequest(trimmed)) && !activeAttach;

    if (isImageRequest && trimmed) {
      setActiveTool(null);
      if (typeof overridePrompt !== 'string') {
        setInputText('');
        setAttachment(null);
      }
      setInputNotice('');
      await handleGenerateAiImagePrompt(trimmed, modeToUse);
      return;
    }

    if ((!trimmed && !activeAttach) || isThinking) return;

    const nowMs = Date.now();
    if (
      trimmed &&
      trimmed === lastSentMsgRef.current.text &&
      nowMs - lastSentMsgRef.current.time < 3000
    ) {
      setInputNotice('🛡️ सुरक्षा कवच: कृपया कुछ सेकंड रुककर अगला संदेश भेजें।');
      return;
    }
    msgTimestampsRef.current = msgTimestampsRef.current.filter((t) => nowMs - t < 60000);
    if (msgTimestampsRef.current.length >= 12) {
      setInputNotice('🛡️ सुरक्षा कवच: कृपया कुछ सेकंड रुककर अगला संदेश भेजें।');
      return;
    }
    msgTimestampsRef.current.push(nowMs);
    lastSentMsgRef.current = { text: trimmed, time: nowMs };

    stopSpeech();
    setInputNotice('');

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: trimmed || `Analyze attached file: ${activeAttach?.name}`,
      timestamp: Date.now(),
      mode: modeToUse,
      attachment: activeAttach
        ? {
            name: activeAttach.name,
            mimeType: activeAttach.mimeType,
            previewUrl: activeAttach.previewUrl,
          }
        : undefined,
    };

    setReactionTrigger({ text: userMsg.content, id: Date.now() });
    (window as unknown as { updateStudyGraphFromChat?: (t: string) => void }).updateStudyGraphFromChat?.(
      userMsg.content
    );

    let targetSessionId = activeSessionId;
    let historyBefore: ChatMessage[] = [];

    if (!targetSessionId || !sessions.some((s) => s.id === targetSessionId)) {
      targetSessionId = `sess-${Date.now()}`;
      const newSession: ChatSession = {
        id: targetSessionId,
        title: deriveSessionTitle(userMsg.content),
        mode: modeToUse,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [userMsg],
      };
      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(targetSessionId);
    } else {
      const existing = sessions.find((s) => s.id === targetSessionId);
      historyBefore = existing ? existing.messages : [];
      setSessions((prev) =>
        prev.map((s) =>
          s.id === targetSessionId
            ? {
                ...s,
                mode: modeToUse,
                updatedAt: Date.now(),
                messages: [...s.messages, userMsg],
              }
            : s
        )
      );
    }

    if (typeof overridePrompt !== 'string') {
      setInputText('');
      setAttachment(null);
    }

    await dispatchChatRequest(
      targetSessionId,
      userMsg.content,
      historyBefore,
      modeToUse,
      activeAttach
    );
  };

  const handleGenerateAiImagePrompt = async (
    promptText: string,
    modeToUse: SmartMode = smartMode
  ) => {
    const nowMs = Date.now();
    imgTimestampsRef.current = imgTimestampsRef.current.filter((t) => nowMs - t < 120000);
    if (imgTimestampsRef.current.length >= 3) {
      setInputNotice('🛡️ सुरक्षा कवच: कृपया कुछ सेकंड रुककर अगला संदेश भेजें।');
      return;
    }
    imgTimestampsRef.current.push(nowMs);

    stopSpeech();
    setInputNotice('');
    setIsThinking(true);
    setThinkingNote('🎨 Designing your image...');

    // 1. Smart Prompt Cleaner & Visual Enhancer (strips filler words, translates Hindi, enriches prompt)
    const enhancedPrompt = await buildCleanVisualPrompt(promptText);
    const seed = Math.floor(Math.random() * 999999);
    const imageUrl = getPollinationsFluxUrl(enhancedPrompt, seed);

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: promptText.trim(),
      timestamp: Date.now(),
      mode: modeToUse,
    };

    setReactionTrigger({ text: userMsg.content, id: Date.now() });

    let targetSessionId = activeSessionId;
    if (!targetSessionId || !sessions.some((s) => s.id === targetSessionId)) {
      targetSessionId = `sess-${Date.now()}`;
      const newSession: ChatSession = {
        id: targetSessionId,
        title: deriveSessionTitle(enhancedPrompt),
        mode: modeToUse,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [userMsg],
      };
      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(targetSessionId);
    } else {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === targetSessionId
            ? {
                ...s,
                updatedAt: Date.now(),
                messages: [...s.messages, userMsg],
              }
            : s
        )
      );
    }

    const imageMarkdown = `🎨 **Generated Visual:** ${enhancedPrompt}\n\n![${enhancedPrompt}](${imageUrl})\n\n[⬇️ Download Image](${imageUrl})`;

    const aiMsg: ChatMessage = {
      id: `msg-${Date.now()}-ai`,
      role: 'assistant',
      content: imageMarkdown,
      timestamp: Date.now(),
      mode: modeToUse,
    };

    setSessions((prev) =>
      prev.map((s) =>
        s.id === targetSessionId
          ? {
              ...s,
              updatedAt: Date.now(),
              messages: [...s.messages, aiMsg],
            }
          : s
      )
    );

    setSessionQueriesCount((c) => c + 1);

    // Update Live Analytics Dashboard counter
    const updatedTel = recordTelemetryEvent((prev) => ({
      ...prev,
      totalImagesCreated: prev.totalImagesCreated + 1,
      totalQueriesProcessed: prev.totalQueriesProcessed + 1,
      activityLogs: [
        {
          id: `log-${Date.now()}`,
          timestamp: Date.now(),
          text: `Flux AI Image generated: ${enhancedPrompt.slice(0, 35)}...`,
        },
        ...prev.activityLogs,
      ],
    }));
    setTelemetry(updatedTel);

    setIsThinking(false);
    setThinkingNote('');
    setReactionTrigger({ text: 'image ' + enhancedPrompt, id: Date.now() });
  };

  const handleRegenerate = async (assistantMessageId: string) => {
    if (!activeSession || isThinking) return;
    const idx = activeSession.messages.findIndex((m) => m.id === assistantMessageId);
    if (idx <= 0) return;

    const precedingMessages = activeSession.messages.slice(0, idx);
    const lastUser = [...precedingMessages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;

    const historyBeforeLastUser = precedingMessages.slice(
      0,
      precedingMessages.findIndex((m) => m.id === lastUser.id)
    );

    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id
          ? { ...s, messages: precedingMessages }
          : s
      )
    );

    await dispatchChatRequest(
      activeSession.id,
      lastUser.content,
      historyBeforeLastUser,
      lastUser.mode,
      null
    );
  };

  const handleStartQuiz = () => {
    if (!activeSession) return;
    setSmartMode('study');
    setInputNotice('🎯 Starting 5-Question Interactive Quiz...');

    const lastUserMsg = [...activeSession.messages].reverse().find((m) => m.role === 'user')?.content || '';
    const topic = lastUserMsg.length > 3 ? lastUserMsg.slice(0, 30) : 'General Science & Mathematics';

    const quizItems = generateStudyQuiz(topic, langMode);

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: '🎯 Start 5-Q Quiz',
      timestamp: Date.now(),
      mode: 'study',
    };

    const assistantMsg: ChatMessage = {
      id: `msg-${Date.now()}-assistant`,
      role: 'assistant',
      content: `🎯 **AURA Interactive Study Quiz**\nTopic: *${topic}*\nTest your understanding with this interactive 5-question quiz below. Your answers will instantly update your 3D Study Graph mastery percentage!`,
      timestamp: Date.now() + 1,
      mode: 'study',
      quizData: quizItems,
    };

    const updatedSessions = sessions.map((s) => {
      if (s.id === activeSession.id) {
        return {
          ...s,
          updatedAt: Date.now(),
          messages: [...s.messages, userMsg, assistantMsg],
        };
      }
      return s;
    });

    setSessions(updatedSessions);
    (window as unknown as { updateStudyGraphFromChat?: (t: string) => void }).updateStudyGraphFromChat?.(`Quiz Started: ${topic}`);
  };

        if (screen === 'splash') {
      return <SplashScreen />;
        }
    

  if (screen === 'analytics') {
    return (
      <AnalyticsDashboard
        telemetry={telemetry}
        sessions={sessions}
        onBack={() => setScreen('app')}
        authUser={authUser}
        managedUsers={managedUsers}
      />
    );
  }

  if (screen === 'auth' || !authUser) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  if (screen === 'admin') {
    return (
      <AdminPanel
        config={adminConfig}
        users={managedUsers}
        sessions={sessions}
        telemetry={telemetry}
        onUpdateConfig={setAdminConfig}
        onUpdateUsers={setManagedUsers}
        onResetTelemetry={() => {
          const resetVal: TelemetryData = {
            totalRegisteredUsers: 0,
            activeSessionsCount: authUser ? 1 : 0,
            totalQueriesProcessed: 0,
            totalImagesCreated: 0,
            activityLogs: [
              {
                id: `log-${Date.now()}`,
                timestamp: Date.now(),
                text: 'Boss Admin reset all telemetry stats to 0',
              },
            ],
          };
          setTelemetry(resetVal);
          saveTelemetry(resetVal);
        }}
        onBackToApp={() => setScreen('app')}
      />
    );
  }

  const isBoss = authUser.role === 'admin';
  const showMaintenanceLock = adminConfig.maintenanceMode && !isBoss;

  return (
    <div
      data-testid="app-container"
      className="flex h-screen w-full overflow-hidden bg-[#060911] text-[#F1F5F9]"
      onClick={() => {
        setPlusMenuOpen(false);
        setPersonaMenuOpen(false);
      }}
    >
      <Sidebar
        isOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={(id) => {
          stopSpeech();
          setActiveSessionId(id);
        }}
        onDeleteSession={handleDeleteSession}
        onNewChat={handleNewChat}
        onExportChat={handleExportChat}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenAdmin={() => setScreen('admin')}
        onOpenAnalytics={() => setScreen('analytics')}
        onLogout={handleLogout}
        isAdmin={isBoss}
        dailyGoal={dailyGoal}
        onUpdateDailyGoal={(nextGoal) => {
          setDailyGoal(nextGoal);
          saveDailyGoal(nextGoal);
        }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {adminConfig.announcementBanner && (
          <div
            role="status"
            data-testid="announcement-banner"
            className="border-b border-[#00F0FF]/40 bg-gradient-to-r from-[#8B5CF6]/20 via-[#00F0FF]/15 to-[#8B5CF6]/20 px-4 py-2 text-center text-xs font-medium text-[#F1F5F9]"
          >
            {adminConfig.announcementBanner}
          </div>
        )}

        {/* Top Header with Gemini-Style Persona Dropdown */}
        <header className="relative z-30 flex h-13 shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-[#060911] px-3 sm:gap-4 sm:px-4">
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen((prev) => !prev)}
              aria-label="Toggle sidebar"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[#CBD5E1] transition-colors hover:text-white"
            >
              <Menu className="h-4 w-4" />
            </button>
          </div>

          {/* Center Gemini-Style Persona Dropdown Pill */}
          <div
            className="relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              data-testid="persona-dropdown-trigger"
              aria-expanded={personaMenuOpen}
              aria-haspopup="menu"
              onClick={() => {
                setPlusMenuOpen(false);
                setPersonaMenuOpen((prev) => !prev);
              }}
              className="flex items-center gap-2 rounded-xl border border-[#00F0FF]/30 bg-[#131A2B] px-3.5 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:border-[#00F0FF]/60 sm:text-sm"
            >
              <span className="whitespace-nowrap">
                {smartMode === 'coding'
                  ? 'AURA • Coding & Tech'
                  : smartMode === 'study'
                    ? 'AURA • Study & Notes'
                    : smartMode === 'live'
                      ? 'AURA • Live Chat'
                      : 'AURA • Friendly Pro'}
              </span>
              <span className="rounded-md bg-gradient-to-r from-[#00F0FF]/20 to-[#8B5CF6]/25 px-2 py-0.5 font-mono text-[10.5px] font-semibold text-[#00F0FF]">
                {smartMode === 'coding'
                  ? 'Möbius 3D'
                  : smartMode === 'study'
                    ? 'Graph 3D'
                    : smartMode === 'live'
                      ? 'Live Wave'
                      : 'Orbital 3D'}
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-[#94A3B8] transition-transform ${
                  personaMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {personaMenuOpen && (
              <div
                role="menu"
                data-testid="persona-dropdown-menu"
                className="absolute top-11 left-1/2 z-40 w-72 -translate-x-1/2 space-y-1 rounded-2xl border border-[#00F0FF]/35 bg-[#0E1422] p-2 shadow-2xl"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setSmartMode('live');
                    setPersonaMenuOpen(false);
                  }}
                  className={`flex w-full flex-col gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    smartMode === 'live'
                      ? 'border-[#EC4899]/50 bg-[#EC4899]/15 text-white'
                      : 'border-transparent text-[#E2E8F0] hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="flex items-center gap-1.5">
                      <span className="text-[#EC4899]">💬</span>
                      <span>Live Chat</span>
                    </span>
                    <span className="font-mono text-[10px] text-[#EC4899]">Live Wave</span>
                  </div>
                  <p className="text-[11px] text-[#94A3B8]">
                    Natural real-time conversation &amp; vocal heartbeat wave
                  </p>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setSmartMode('general');
                    setPersonaMenuOpen(false);
                  }}
                  className={`flex w-full flex-col gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    smartMode === 'general'
                      ? 'border-[#00F0FF]/40 bg-[#00F0FF]/12 text-white'
                      : 'border-transparent text-[#E2E8F0] hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-[#00F0FF]" />
                      <span>✨ Friendly &amp; Pro</span>
                    </span>
                    <span className="font-mono text-[10px] text-[#00F0FF]">Orbital 3D</span>
                  </div>
                  <p className="text-[11px] text-[#94A3B8]">
                    3D Orbital Neural Core + Live Web Grounding
                  </p>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setSmartMode('coding');
                    setPersonaMenuOpen(false);
                  }}
                  className={`flex w-full flex-col gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    smartMode === 'coding'
                      ? 'border-[#8B5CF6]/50 bg-[#8B5CF6]/15 text-white'
                      : 'border-transparent text-[#E2E8F0] hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="flex items-center gap-1.5">
                      <Code2 className="h-3.5 w-3.5 text-[#C4B5FD]" />
                      <span>💻 Coding &amp; Tech</span>
                    </span>
                    <span className="font-mono text-[10px] text-[#C4B5FD]">Möbius 3D</span>
                  </div>
                  <p className="text-[11px] text-[#94A3B8]">
                    Stark Endgame Möbius Strip + Code Sandbox
                  </p>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setSmartMode('study');
                    setPersonaMenuOpen(false);
                  }}
                  className={`flex w-full flex-col gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    smartMode === 'study'
                      ? 'border-[#00F0FF]/40 bg-[#00F0FF]/12 text-white'
                      : 'border-transparent text-[#E2E8F0] hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="flex items-center gap-1.5">
                      <BookOpen className="h-3.5 w-3.5 text-emerald-400" />
                      <span>📚 Study &amp; Notes</span>
                    </span>
                    <span className="font-mono text-[10px] text-emerald-400">Graph 3D</span>
                  </div>
                  <p className="text-[11px] text-[#94A3B8]">
                    Animated 3D Holographic Study &amp; Analytics Graph
                  </p>
                </button>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                id="aura-mute-btn"
                onClick={() => {
                  setVoiceMuted((prev) => {
                    const next = !prev;
                    if (next && typeof window !== 'undefined' && 'speechSynthesis' in window) {
                      window.speechSynthesis.cancel();
                      setSpeakingMessageId(null);
                    }
                    return next;
                  });
                }}
                title="Mute / Unmute Voice"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(0,240,255,0.25)',
                  color: '#00f0ff',
                  borderRadius: '10px',
                  padding: '5px 9px',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                {voiceMuted ? '🔇' : '🔊'}
              </button>

              <select
                id="quick-lang-select"
                data-testid="quick-lang-select"
                value={langMode}
                onChange={(e) => setLangMode(e.target.value)}
                style={{
                  background: '#131a2b',
                  color: '#00f0ff',
                  border: '1px solid rgba(0,240,255,0.3)',
                  borderRadius: '10px',
                  padding: '4px 8px',
                  fontSize: '11.5px',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="auto">🌐 Auto Detect</option>
                <option value="Hindi">🇮🇳 हिंदी (देवनागरी)</option>
                <option value="Hinglish">💬 Hinglish</option>
                <option value="English">🔤 English</option>
              </select>
              <span
                id="chat-save-badge"
                data-testid="chat-save-badge"
                style={{
                  fontSize: '10.5px',
                  color: saveBadgeColor,
                  fontFamily: '"JetBrains Mono", monospace',
                }}
              >
                {saveBadgeText}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Open settings"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[#CBD5E1] transition-colors hover:border-[#00F0FF]/40 hover:text-[#00F0FF]"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Top Autonomous Cinematic 3D Hologram Stage (~25% Height) */}
        <HologramStage
          mode={hologramMode}
          aiState={aiState}
          statusNote={thinkingNote}
          reactionTrigger={reactionTrigger}
        />

        {showMaintenanceLock ? (
          <main className="flex flex-1 flex-col items-center justify-center p-6 text-center">
            <div className="max-w-md rounded-2xl border border-amber-500/30 bg-[#131A2B] p-6">
              <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-amber-400" />
              <h2 className="font-display text-lg font-semibold text-white">
                System Under Maintenance
              </h2>
              <p className="mt-2 text-sm text-[#94A3B8]">
                AURA is undergoing scheduled neural core calibration by the administrator. Please check back shortly.
              </p>
              <button
                type="button"
                onClick={handleLogout}
                className="mt-5 rounded-xl border border-white/15 px-4 py-2 text-xs font-medium text-[#F1F5F9] hover:bg-white/5"
              >
                Switch Account
              </button>
            </div>
          </main>
        ) : (
          <>
            {/* Chat Feed */}
            <main
              aria-label="Conversation messages"
              data-testid="chat-feed"
              className="flex-1 overflow-y-auto px-4 py-5 md:px-8"
            >
              {!activeSession || activeSession.messages.length === 0 ? (
                <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center py-6 text-center">
                  <h2 className="font-display text-2xl font-semibold text-[#F1F5F9]">
                    Hello, {sanitizeUserHTML(settings.displayName)}. How can I assist you today?
                  </h2>
                  <p className="mt-2 max-w-lg text-sm text-[#94A3B8]">
                    Ask about live world news, build and preview code in real time, or break down complex study topics.
                  </p>

                  <div className="mt-6 grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
                    {STARTER_PROMPTS.map((item) => (
                      <button
                        key={item.title}
                        type="button"
                        onClick={() => handleSendMessage(item.prompt, item.mode)}
                        className="flex flex-col items-start rounded-2xl border border-white/10 bg-[#131A2B]/80 p-4 text-left transition-colors hover:border-[#00F0FF]/40 hover:bg-[#1a233a]"
                      >
                        <div className="mb-2 text-[#00F0FF]">
                          {item.icon === 'globe' ? (
                            <Globe className="h-4 w-4" />
                          ) : item.icon === 'code' ? (
                            <Code2 className="h-4 w-4 text-[#C4B5FD]" />
                          ) : (
                            <BookOpen className="h-4 w-4" />
                          )}
                        </div>
                        <span className="font-display text-sm font-semibold text-[#F1F5F9]">
                          {item.title}
                        </span>
                        <span className="mt-1 line-clamp-2 text-xs text-[#94A3B8]">
                          {item.prompt}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mx-auto flex max-w-3xl flex-col gap-4">
                  {activeSession.messages.map((msg) => (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      isSpeakingThis={speakingMessageId === msg.id}
                      onSpeakToggle={handleSpeakToggle}
                      onRegenerate={
                        msg.role === 'assistant' ? handleRegenerate : undefined
                      }
                      onRunCode={(language, code) =>
                        setPreviewTarget({ language, code })
                      }
                    />
                  ))}

                  {isThinking && (
                    <div
                      role="status"
                      className="flex items-center gap-2.5 self-start rounded-2xl border border-[#00F0FF]/25 bg-[#131A2B]/80 px-4 py-3 text-xs text-[#00F0FF]"
                    >
                      <span className="h-2 w-2 rounded-full bg-[#00F0FF]" />
                      <span className="font-mono">{thinkingNote || 'Thinking...'}</span>
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>
              )}
            </main>

            {/* Bottom Input Bar with Interactive "+" Menu & Active Tool Banner */}
            <footer className="relative shrink-0 border-t border-white/10 bg-[#060911]/95 px-4 py-3 md:px-8">
              <div className="mx-auto max-w-3xl relative">
                {inputNotice && (
                  <p role="alert" className="mb-2 text-xs text-amber-300">
                    {inputNotice}
                  </p>
                )}

                {/* Glowing Active Tool Banner confirming what was selected */}
                {activeTool && (
                  <div
                    id="active-mode-banner"
                    className="flex items-center justify-between mb-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#00F0FF]/20 to-[#8B5CF6]/25 border border-[#00F0FF] text-xs font-semibold text-white shadow-[0_0_15px_rgba(0,240,255,0.2)]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-[#00F0FF] animate-ping" />
                      <span>Active Engine: <strong>{activeTool.label}</strong></span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTool(null)}
                      className="rounded-lg bg-black/40 px-2 py-0.5 text-[11px] text-[#00F0FF] border border-white/20 hover:bg-black/60"
                    >
                      Clear Tool
                    </button>
                  </div>
                )}

                {attachment && (
                  <div className="mb-2 inline-flex items-center gap-2.5 rounded-xl border border-[#00F0FF]/30 bg-[#131A2B] px-3 py-1.5 text-xs text-[#E2E8F0]">
                    {attachment.previewUrl && (
                      <img
                        src={attachment.previewUrl}
                        alt={attachment.name}
                        className="h-7 w-7 rounded object-cover"
                      />
                    )}
                    <span className="font-mono max-w-[220px] truncate">
                      {attachment.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAttachment(null)}
                      aria-label="Remove attachment"
                      className="text-[#94A3B8] hover:text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {/* Glowing Glass Action Sheet for "+" Button */}
                {plusMenuOpen && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    id="plus-menu-popup"
                    className="absolute bottom-16 left-0 z-30 w-76 space-y-1.5 rounded-2xl border border-[#00F0FF]/40 bg-[#0E1422] p-2.5 shadow-2xl"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setPlusMenuOpen(false);
                        setActiveTool({
                          id: 'image',
                          label: 'Create AI Image (Free • Pollinations AI)',
                          placeholder: 'Describe your AI image prompt...',
                        });
                        setInputNotice('AI Image Generator active. Enter your prompt and press Send.');
                      }}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium text-left transition-all ${
                        activeTool?.id === 'image'
                          ? 'bg-gradient-to-r from-[#00F0FF]/25 to-[#8B5CF6]/30 border border-[#00F0FF] text-white shadow'
                          : 'bg-white/[0.03] text-[#F1F5F9] hover:bg-[#00F0FF]/15 hover:text-[#00F0FF]'
                      }`}
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-pink-500/20 text-pink-400 font-bold shrink-0">🎨</div>
                      <div>
                        <p className="font-semibold">Create AI Image (Free • No Login)</p>
                        <p className="text-[10.5px] text-[#94A3B8]">Instant image generation inside chat</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPlusMenuOpen(false);
                        setActiveTool({
                          id: 'search',
                          label: 'Background Live Web Search (Google Grounding)',
                          placeholder: 'Ask about live news, scores, weather...',
                        });
                        setAdminConfig((prev) => ({ ...prev, liveWebSearchEnabled: true }));
                        setInputNotice('Background Live Web Search active with Google Grounding.');
                      }}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium text-left transition-all ${
                        activeTool?.id === 'search'
                          ? 'bg-gradient-to-r from-[#00F0FF]/25 to-[#8B5CF6]/30 border border-[#00F0FF] text-white shadow'
                          : 'bg-white/[0.03] text-[#F1F5F9] hover:bg-[#00F0FF]/15 hover:text-[#00F0FF]'
                      }`}
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#00F0FF]/20 text-[#00F0FF] font-bold shrink-0">🌐</div>
                      <div>
                        <p className="font-semibold">Background Live Web Search</p>
                        <p className="text-[10.5px] text-[#94A3B8]">Ground replies with real-time web</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPlusMenuOpen(false);
                        setActiveTool({
                          id: 'upload',
                          label: 'Upload Photo / File / Document',
                          placeholder: 'Upload image or document to analyze...',
                        });
                        fileInputRef.current?.click();
                      }}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium text-left transition-all ${
                        activeTool?.id === 'upload'
                          ? 'bg-gradient-to-r from-[#00F0FF]/25 to-[#8B5CF6]/30 border border-[#00F0FF] text-white shadow'
                          : 'bg-white/[0.03] text-[#F1F5F9] hover:bg-[#00F0FF]/15 hover:text-[#00F0FF]'
                      }`}
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/20 text-violet-400 font-bold shrink-0">🖼️</div>
                      <div>
                        <p className="font-semibold">Upload Photo / File</p>
                        <p className="text-[10.5px] text-[#94A3B8]">Attach documents or screenshots</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPlusMenuOpen(false);
                        setActiveTool({
                          id: 'coding',
                          label: 'Coding & 3D Möbius Mode',
                          placeholder: 'Ask a coding or tech question...',
                        });
                        setSmartMode('coding');
                        setInputNotice('Coding & 3D Möbius Mode active.');
                      }}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium text-left transition-all ${
                        activeTool?.id === 'coding' || smartMode === 'coding'
                          ? 'bg-gradient-to-r from-[#00F0FF]/25 to-[#8B5CF6]/30 border border-[#00F0FF] text-white shadow'
                          : 'bg-white/[0.03] text-[#F1F5F9] hover:bg-[#00F0FF]/15 hover:text-[#00F0FF]'
                      }`}
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 font-bold shrink-0">💻</div>
                      <div>
                        <p className="font-semibold">Coding &amp; 3D Möbius Mode</p>
                        <p className="text-[10.5px] text-[#94A3B8]">Activate Stark wireframe &amp; sandbox</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPlusMenuOpen(false);
                        setActiveTool({
                          id: 'study',
                          label: 'Study & 3D Book Mode',
                          placeholder: 'Ask a study or concept breakdown question...',
                        });
                        setSmartMode('study');
                        setInputNotice('Study & 3D Book Mode active.');
                      }}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium text-left transition-all ${
                        activeTool?.id === 'study' || smartMode === 'study'
                          ? 'bg-gradient-to-r from-[#00F0FF]/25 to-[#8B5CF6]/30 border border-[#00F0FF] text-white shadow'
                          : 'bg-white/[0.03] text-[#F1F5F9] hover:bg-[#00F0FF]/15 hover:text-[#00F0FF]'
                      }`}
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 font-bold shrink-0">📚</div>
                      <div>
                        <p className="font-semibold">Study &amp; Exam Helper</p>
                        <p className="text-[10.5px] text-[#94A3B8]">Activate 3D Flipping Book mode</p>
                      </div>
                    </button>
                  </div>
                )}

                {/* Quick Prompt Chips based on Active Smart Mode */}
                <div
                  aria-label="Quick Prompt Suggestions"
                  className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none"
                >
                  <span className="shrink-0 font-mono text-[11px] text-[#64748B]">
                    Quick:
                  </span>
                  {smartMode === 'study' && (
                    <button
                      type="button"
                      onClick={() => handleStartQuiz()}
                      className="shrink-0 rounded-xl border border-emerald-500/40 bg-emerald-500/20 px-3 py-1 text-[11px] font-semibold text-emerald-300 transition-all hover:bg-emerald-500/30 hover:text-white flex items-center gap-1 shadow"
                    >
                      <span>🎯 Start 5-Q Quiz</span>
                    </button>
                  )}
                  {getQuickPrompts(smartMode).map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => setInputText(chip.prompt)}
                      className="shrink-0 rounded-xl border border-[#00F0FF]/30 bg-[#00F0FF]/10 px-2.5 py-1 text-[11px] font-medium text-[#00F0FF] transition-all hover:border-[#00F0FF]/60 hover:bg-[#00F0FF]/20 hover:text-white"
                      title={chip.prompt}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#131A2B] p-1.5 focus-within:border-[#00F0FF]/50"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.txt,.md,.js,.ts,.tsx,.jsx,.py,.html,.css,.json,.csv,.pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPersonaMenuOpen(false);
                      setPlusMenuOpen((prev) => !prev);
                    }}
                    aria-label="Open action menu"
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#00F0FF]/40 bg-[#00F0FF]/15 text-[#00F0FF] transition-all hover:bg-[#00F0FF]/25 ${
                      plusMenuOpen ? 'rotate-45 bg-[#00F0FF] text-[#060911]' : ''
                    }`}
                  >
                    <Plus className="h-5 w-5" />
                  </button>

                  <input
                    type="text"
                    aria-label="Message AURA"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={
                      activeTool?.placeholder ||
                      (langMode === 'Hindi'
                        ? 'बॉस, यहाँ हिंदी में लिखें या बोलें...'
                        : smartMode === 'coding'
                          ? 'Ask Coding & Tech Expert...'
                          : smartMode === 'study'
                            ? 'Ask Study & Exam Helper...'
                            : 'Ask AURA anything or search the web...')
                    }
                    className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-[#F1F5F9] placeholder-[#64748B] outline-none"
                  />



                  <button
                    type="button"
                    onClick={toggleVoiceInput}
                    aria-label={isRecording ? 'Stop voice input' : 'Start voice input'}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                      isRecording
                        ? 'bg-red-500/20 text-red-400'
                        : 'text-[#94A3B8] hover:bg-white/5 hover:text-[#00F0FF]'
                    }`}
                  >
                    {isRecording ? (
                      <MicOff className="h-4 w-4" />
                    ) : (
                      <Mic className="h-4 w-4" />
                    )}
                  </button>

                  <button
                    type="submit"
                    disabled={isThinking || (!inputText.trim() && !attachment)}
                    className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#00F0FF] to-[#8B5CF6] px-4 text-sm font-semibold text-[#05070B] transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Send</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (liveCallActive) {
                        setLiveCallActive(false);
                        setInputNotice('📞 Live Call ended.');
                        if (recognitionRef.current) {
                          try { recognitionRef.current.stop(); } catch {}
                          setIsRecording(false);
                        }
                      } else {
                        setLiveCallActive(true);
                        setVoiceMuted(false);
                        setSmartMode('live');
                        setInputNotice('📞 Gemini Live Call active! Speak naturally...');

                        const win = window as unknown as {
                          SpeechRecognition?: new () => SpeechRecognitionInstanceLike;
                          webkitSpeechRecognition?: new () => SpeechRecognitionInstanceLike;
                        };
                        const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;
                        if (!SpeechRec) {
                          setInputNotice('⚠️ 🎙️ AI Studio Preview blocks live mic—open your published Chrome link to talk hands-free!');
                          setLiveCallActive(false);
                          return;
                        }

                        if ('speechSynthesis' in window) {
                          window.speechSynthesis.cancel();
                          const greetUtter = new SpeechSynthesisUtterance('हाँ बॉस, बोलिए मैं सुन रही हूँ।');
                          greetUtter.lang = settings.language === 'Hindi' ? 'hi-IN' : 'en-IN';
                          greetUtter.onend = () => {
                            setTimeout(() => startLiveCallListening(), 200);
                          };
                          greetUtter.onerror = () => {
                            setTimeout(() => startLiveCallListening(), 200);
                          };
                          window.speechSynthesis.speak(greetUtter);
                        } else {
                          setTimeout(() => startLiveCallListening(), 200);
                        }
                      }
                    }}
                    aria-label={liveCallActive ? 'End Live Call' : 'Start Live Call'}
                    title={liveCallActive ? 'End Gemini Live Call' : 'Start Gemini Live Call'}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all ${
                      liveCallActive
                        ? 'border border-red-500 bg-red-500/20 text-red-400 shadow-[0_0_16px_rgba(239,68,68,0.7)] animate-pulse'
                        : 'border border-[#00F0FF]/50 bg-gradient-to-r from-[#00F0FF]/15 via-[#8B5CF6]/15 to-[#EC4899]/15 text-[#00F0FF] shadow-[0_0_12px_rgba(0,240,255,0.25)] hover:scale-105'
                    }`}
                  >
                    <span className="flex items-center gap-0.5 font-mono text-[11px] font-bold tracking-tighter">
                      {liveCallActive ? (
                        <span className="text-red-400 font-bold">🔴</span>
                      ) : (
                        <span className="flex items-end gap-[1px] h-3.5">
                          <span className="w-[2px] bg-[#00F0FF] animate-bounce h-2" style={{ animationDelay: '0ms' }}></span>
                          <span className="w-[2px] bg-[#8B5CF6] animate-bounce h-3.5" style={{ animationDelay: '150ms' }}></span>
                          <span className="w-[2px] bg-[#EC4899] animate-bounce h-2.5" style={{ animationDelay: '300ms' }}></span>
                        </span>
                      )}
                    </span>
                  </button>
                </form>
              </div>
            </footer>
          </>
        )}
      </div>

      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onSave={setSettings}
          onClearHistory={handleClearAllHistory}
          onLogout={handleLogout}
          onTestVoice={(profile, speed) =>
            speakText(
              `Hello ${settings.displayName}, AURA neural voice ${profile} is calibrated at ${speed.toFixed(1)}x speed.`,
              'test-voice',
              profile,
              speed
            )
          }
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {previewTarget && (
        <CodePreviewModal
          language={previewTarget.language}
          code={previewTarget.code}
          onClose={() => setPreviewTarget(null)}
        />
      )}

      {/* Privacy Policy & Terms Modal (App Store Ready) */}
      <div
        id="aura-privacy-modal"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            const m = document.getElementById('aura-privacy-modal');
            if (m) m.style.display = 'none';
          }
        }}
        style={{
          display: 'none',
          position: 'fixed',
          inset: 0,
          background: 'rgba(2, 6, 15, 0.86)',
          backdropFilter: 'blur(8px)',
          zIndex: 4000,
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
        }}
      >
        <div
          style={{
            maxWidth: '400px',
            width: '100%',
            background: '#0c1322',
            border: '1px solid rgba(0,240,255,0.3)',
            borderRadius: '18px',
            padding: '20px',
            color: '#e2e8f0',
            fontSize: '12.5px',
            lineHeight: 1.6,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '10px',
            }}
          >
            <strong style={{ color: '#00f0ff', fontSize: '15px' }}>📜 AURA Privacy Policy &amp; Terms</strong>
            <button
              type="button"
              onClick={() => {
                const m = document.getElementById('aura-privacy-modal');
                if (m) m.style.display = 'none';
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                fontSize: '16px',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
          <p>
            • <b>Data Storage:</b> Chat history and preferences are stored locally on your device (<code>localStorage</code>). We do not sell personal data.
          </p>
          <p style={{ marginTop: '6px' }}>
            • <b>AI &amp; Web Services:</b> Queries, web lookups, and image generation use secure third-party AI APIs (Google Gemini, Pollinations AI, DuckDuckGo).
          </p>
          <p style={{ marginTop: '6px' }}>
            • <b>User Control:</b> You can clear your chat history anytime from the sidebar.
          </p>
        </div>
      </div>
      {/* Live Code Sandbox Overlay Window */}
      <div
        id="aura-code-runner-modal"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            const m = document.getElementById('aura-code-runner-modal');
            const f = document.getElementById('aura-runner-iframe') as HTMLIFrameElement;
            if (f) f.srcdoc = '';
            if (m) m.style.display = 'none';
          }
        }}
        style={{
          display: 'none',
          position: 'fixed',
          inset: 0,
          background: 'rgba(2, 6, 15, 0.92)',
          backdropFilter: 'blur(10px)',
          zIndex: 5000,
          flexDirection: 'column',
          padding: '12px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#0c1322',
            border: '1px solid rgba(0, 240, 255, 0.35)',
            borderBottom: 'none',
            borderRadius: '14px 14px 0 0',
            padding: '10px 14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '9px',
                height: '9px',
                borderRadius: '50%',
                background: '#10b981',
                boxShadow: '0 0 8px #10b981',
              }}
            ></span>
            <span style={{ color: '#00f0ff', fontWeight: 700, fontSize: '13.5px' }}>
              ⚡ AURA Live Code Sandbox
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => {
                const w = window as unknown as { currentSandboxCode?: string; openLiveCodeRunner?: (c: string) => void };
                if (w.currentSandboxCode && w.openLiveCodeRunner) {
                  w.openLiveCodeRunner(w.currentSandboxCode);
                }
              }}
              style={{
                background: 'rgba(0, 240, 255, 0.14)',
                border: '1px solid rgba(0, 240, 255, 0.35)',
                color: '#00f0ff',
                borderRadius: '8px',
                padding: '5px 11px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🔄 Restart
            </button>
            <button
              type="button"
              onClick={() => {
                const modal = document.getElementById('aura-code-runner-modal');
                const iframe = document.getElementById('aura-runner-iframe') as HTMLIFrameElement;
                if (iframe) iframe.srcdoc = '';
                if (modal) modal.style.display = 'none';
              }}
              style={{
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.45)',
                color: '#f87171',
                borderRadius: '8px',
                padding: '5px 11px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ✕ Close
            </button>
          </div>
        </div>

        <iframe
          id="aura-runner-iframe"
          sandbox="allow-scripts"
          style={{
            flex: 1,
            width: '100%',
            border: '1px solid rgba(0, 240, 255, 0.35)',
            borderTop: 'none',
            borderRadius: '0 0 14px 14px',
            background: '#090d16',
          }}
        ></iframe>
      </div>

      {/* Live Code Sandbox Overlay Window */}
      <div
        id="aura-code-runner-modal"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            const m = document.getElementById('aura-code-runner-modal');
            const f = document.getElementById('aura-runner-iframe') as HTMLIFrameElement;
            if (f) f.srcdoc = '';
            if (m) m.style.display = 'none';
          }
        }}
        style={{
          display: 'none',
          position: 'fixed',
          inset: 0,
          background: 'rgba(2, 6, 15, 0.92)',
          backdropFilter: 'blur(10px)',
          zIndex: 5000,
          flexDirection: 'column',
          padding: '12px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#0c1322',
            border: '1px solid rgba(0, 240, 255, 0.35)',
            borderBottom: 'none',
            borderRadius: '14px 14px 0 0',
            padding: '10px 14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '9px',
                height: '9px',
                borderRadius: '50%',
                background: '#10b981',
                boxShadow: '0 0 8px #10b981',
              }}
            ></span>
            <span style={{ color: '#00f0ff', fontWeight: 700, fontSize: '13.5px' }}>
              ⚡ AURA Live Code Sandbox
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => {
                const w = window as unknown as { currentSandboxCode?: string; openLiveCodeRunner?: (c: string) => void };
                if (w.currentSandboxCode && w.openLiveCodeRunner) {
                  w.openLiveCodeRunner(w.currentSandboxCode);
                }
              }}
              style={{
                background: 'rgba(0, 240, 255, 0.14)',
                border: '1px solid rgba(0, 240, 255, 0.35)',
                color: '#00f0ff',
                borderRadius: '8px',
                padding: '5px 11px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🔄 Restart
            </button>
            <button
              type="button"
              onClick={() => {
                const modal = document.getElementById('aura-code-runner-modal');
                const iframe = document.getElementById('aura-runner-iframe') as HTMLIFrameElement;
                if (iframe) iframe.srcdoc = '';
                if (modal) modal.style.display = 'none';
              }}
              style={{
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.45)',
                color: '#f87171',
                borderRadius: '8px',
                padding: '5px 11px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ✕ Close
            </button>
          </div>
        </div>

        <iframe
          id="aura-runner-iframe"
          sandbox="allow-scripts"
          style={{
            flex: 1,
            width: '100%',
            border: '1px solid rgba(0, 240, 255, 0.35)',
            borderTop: 'none',
            borderRadius: '0 0 14px 14px',
            background: '#090d16',
          }}
        ></iframe>
      </div>
    </div>
  );
}
} 
