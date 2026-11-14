import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOSS_ADMIN_EMAIL,
  BOSS_ADMIN_PIN,
  DEMO_OTP_CODE,
  buildPollinationsImageUrl,
  buildRunnableHtmlDocument,
  buildSystemInstruction,
  calculateAdminStats,
  cleanImageSubject,
  detectCodingIntent,
  extractCleanImagePrompt,
  extractGroundingSources,
  formatConversationMarkdown,
  getPollinationsFluxUrl,
  isBossAdminLogin,
  isImageGenerationRequest,
  parseMessageSegments,
  resolveHologramMode,
  validateLoginCredentials,
  verifyOtpCode,
  getQuickPrompts,
  cleanThoughtAndBrokenText,
  isBrokenOrIncompleteReply,
  formatGroundingSourcesAsMarkdown,
  fetchAuraReply,
} from './auraLogic';
import type { ChatSession, ManagedUser, UserSettings } from '../types/aura';

test('auth validation and boss admin detection', () => {
  assert.equal(validateLoginCredentials('', '').valid, false);
  assert.equal(validateLoginCredentials('invalid', '1234').valid, false);
  assert.equal(validateLoginCredentials('roshan@aura.ai', '12').valid, false);

  const regular = validateLoginCredentials('roshan@aura.ai', 'secret99');
  assert.equal(regular.valid, true);
  assert.equal(regular.isAdminAccess, false);

  const bossEmail = validateLoginCredentials(BOSS_ADMIN_EMAIL, 'pass123');
  assert.equal(bossEmail.valid, true);
  assert.equal(bossEmail.isAdminAccess, true);

  const bossPin = validateLoginCredentials('', BOSS_ADMIN_PIN);
  assert.equal(bossPin.valid, true);
  assert.equal(bossPin.isAdminAccess, true);

  assert.equal(isBossAdminLogin('BOSS@AURA.AI', 'anything'), true);
  assert.equal(isBossAdminLogin('guest@aura.ai', '2026'), true);
  assert.equal(isBossAdminLogin('user@aura.ai', '1234'), false);
});

test('6-digit OTP verification', () => {
  assert.equal(verifyOtpCode(DEMO_OTP_CODE), true);
  assert.equal(verifyOtpCode('482 910'), true);
  assert.equal(verifyOtpCode('123456'), false);
  assert.equal(verifyOtpCode('48291'), false);
});

test('coding intent detection and hologram auto-switching', () => {
  assert.equal(detectCodingIntent('Write a Python function to reverse a list'), true);
  assert.equal(detectCodingIntent('Debug my React component state'), true);
  assert.equal(detectCodingIntent('What is the weather in Tokyo today?'), false);

  assert.equal(resolveHologramMode('auto', 'general', 'Hello AURA'), 'orbital');
  assert.equal(resolveHologramMode('auto', 'coding', 'Hello AURA'), 'mobius');
  assert.equal(resolveHologramMode('auto', 'study', 'Explain gravity'), 'book');
  assert.equal(resolveHologramMode('auto', 'live', 'Hello AURA'), 'livewave');
  assert.equal(
    resolveHologramMode('auto', 'general', 'Can you fix this TypeScript bug?'),
    'mobius'
  );
  assert.equal(resolveHologramMode('orbital', 'coding', 'Write HTML'), 'orbital');
  assert.equal(resolveHologramMode('mobius', 'general', 'Hi'), 'mobius');
  assert.equal(resolveHologramMode('livewave', 'general', 'Hi'), 'livewave');
});

test('message segment parsing identifies runnable web code blocks', () => {
  const sample = `Here is a button:\n\`\`\`html\n<button>Click</button>\n\`\`\`\nAnd Python:\n\`\`\`python\nprint("hi")\n\`\`\``;
  const segments = parseMessageSegments(sample);
  assert.equal(segments.length, 4);
  assert.deepEqual(segments[0], { type: 'text', content: 'Here is a button:' });
  assert.deepEqual(segments[1], {
    type: 'code',
    language: 'html',
    code: '<button>Click</button>',
    isRunnableWeb: true,
  });
  assert.deepEqual(segments[2], { type: 'text', content: 'And Python:' });
  assert.deepEqual(segments[3], {
    type: 'code',
    language: 'python',
    code: 'print("hi")',
    isRunnableWeb: false,
  });
});

test('buildRunnableHtmlDocument wraps HTML and JS safely', () => {
  const htmlDoc = buildRunnableHtmlDocument('html', '<h1>Hello</h1>');
  assert.equal(htmlDoc.includes('<h1>Hello</h1>'), true);

  const jsDoc = buildRunnableHtmlDocument('javascript', 'console.log(42);');
  assert.equal(jsDoc.includes('console.log(42);'), true);
});

test('extractGroundingSources deduplicates web URIs', () => {
  const chunks = [
    { web: { uri: 'https://example.com/a', title: 'Source A' } },
    { web: { uri: 'https://example.com/a', title: 'Duplicate A' } },
    { web: { uri: 'https://example.com/b', title: 'Source B' } },
  ];
  const sources = extractGroundingSources(chunks);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].title, 'Source A');
  assert.equal(sources[1].uri, 'https://example.com/b');
});

test('system instruction and markdown export include display name and memory', () => {
  const settings: UserSettings = {
    displayName: 'Roshan',
    voiceProfile: 'Nova',
    speechSpeed: 1.0,
    autoSpeak: false,
    language: 'Hinglish',
    personalMemory: 'Always give concise bullet points.',
    animationStyle: 'auto',
  };
  const instruction = buildSystemInstruction(settings, 'study', true);
  assert.equal(instruction.includes('Roshan'), true);
  assert.equal(instruction.includes('Hinglish'), true);
  assert.equal(instruction.includes('Always give concise bullet points.'), true);

  const session: ChatSession = {
    id: 's1',
    title: 'Physics Study',
    mode: 'study',
    createdAt: 1700000000000,
    updatedAt: 1700000001000,
    messages: [
      {
        id: 'm1',
        role: 'user',
        content: 'Explain gravity',
        timestamp: 1700000000000,
        mode: 'study',
      },
      {
        id: 'm2',
        role: 'assistant',
        content: 'Gravity attracts mass.',
        timestamp: 1700000001000,
        mode: 'study',
        sources: [{ title: 'NASA', uri: 'https://nasa.gov' }],
      },
    ],
  };
  const md = formatConversationMarkdown(session);
  assert.equal(md.includes('# AURA Conversation: Physics Study'), true);
  assert.equal(md.includes('https://nasa.gov'), true);
});

test('calculateAdminStats computes live counts from users and sessions without placeholders', () => {
  const users: ManagedUser[] = [
    {
      id: 'u1',
      name: 'Boss',
      identifier: 'boss@aura.ai',
      role: 'Boss Admin',
      status: 'Active',
      queries: 10,
      lastSeen: 'Now',
    },
    {
      id: 'u2',
      name: 'Mira',
      identifier: 'mira@aura.ai',
      role: 'Standard',
      status: 'Suspended',
      queries: 5,
      lastSeen: '2d ago',
    },
  ];
  const sessions: ChatSession[] = [
    {
      id: 's1',
      title: 'Session 1',
      mode: 'general',
      createdAt: 1000,
      updatedAt: 2000,
      messages: [
        { id: 'm1', role: 'user', content: 'Hi', timestamp: 1000, mode: 'general' },
        { id: 'm2', role: 'assistant', content: 'Hello', timestamp: 1500, mode: 'general' },
        { id: 'm3', role: 'user', content: 'News?', timestamp: 2000, mode: 'general' },
      ],
    },
    {
      id: 's2',
      title: 'Session 2',
      mode: 'coding',
      createdAt: 3000,
      updatedAt: 3500,
      messages: [
        { id: 'm4', role: 'user', content: 'Code?', timestamp: 3000, mode: 'coding' },
      ],
    },
  ];

  const stats = calculateAdminStats(users, sessions, 2);
  assert.equal(stats.totalRegisteredUsers, 2);
  assert.equal(stats.activeUsersCount, 1);
  assert.equal(stats.activeSessionsCount, 2);
  assert.equal(stats.totalQueriesProcessed, 18);

  const emptyStats = calculateAdminStats([], [], 0);
  assert.equal(emptyStats.totalRegisteredUsers, 0);
  assert.equal(emptyStats.activeUsersCount, 0);
  assert.equal(emptyStats.activeSessionsCount, 0);
  assert.equal(emptyStats.totalQueriesProcessed, 0);
});

test('parseMessageSegments extracts markdown image cards cleanly', () => {
  const sample = `Here is your generated AI image:\n\n![AI Generated Image](https://image.pollinations.ai/prompt/dragon?width=1024&height=1024&nologo=true)\n\n[Download Image](https://image.pollinations.ai/prompt/dragon?width=1024&height=1024&nologo=true)`;
  const segments = parseMessageSegments(sample);
  assert.equal(segments.length, 3);
  assert.deepEqual(segments[0], { type: 'text', content: 'Here is your generated AI image:' });
  assert.deepEqual(segments[1], {
    type: 'image',
    alt: 'AI Generated Image',
    url: 'https://image.pollinations.ai/prompt/dragon?width=1024&height=1024&nologo=true',
  });
  assert.deepEqual(segments[2], {
    type: 'text',
    content: '[Download Image](https://image.pollinations.ai/prompt/dragon?width=1024&height=1024&nologo=true)',
  });
});

test('getQuickPrompts returns mode-specific prompt chips', () => {
  const codingChips = getQuickPrompts('coding');
  assert.ok(codingChips.length >= 2);
  assert.ok(codingChips.some((c) => c.label.includes('Debug')));

  const studyChips = getQuickPrompts('study');
  assert.ok(studyChips.length >= 2);
  assert.ok(studyChips.some((c) => c.label.includes('Quiz') || c.label.includes('Explain')));

  const generalChips = getQuickPrompts('general');
  assert.ok(generalChips.length >= 2);
});

test('isImageGenerationRequest detects English, Hindi, Hinglish and slash commands', () => {
  assert.equal(isImageGenerationRequest('/image futuristic cyber city'), true);
  assert.equal(isImageGenerationRequest('generate image of a golden eagle'), true);
  assert.equal(isImageGenerationRequest('create an image of taj mahal'), true);
  assert.equal(isImageGenerationRequest('draw a picture of a neon robot'), true);
  assert.equal(isImageGenerationRequest('photo of snow mountains'), true);
  assert.equal(isImageGenerationRequest('चित्र बनाओ एक शेर का'), true);
  assert.equal(isImageGenerationRequest('फोटो बनाओ ताज महल की'), true);
  assert.equal(isImageGenerationRequest('इमेज जनरेट करो'), true);
  assert.equal(isImageGenerationRequest('cyber car image banao'), true);
  assert.equal(isImageGenerationRequest('Create one car image'), true);
  assert.equal(isImageGenerationRequest('hello what is the capital of France?'), false);
  assert.equal(isImageGenerationRequest('explain how async await works in javascript'), false);

  assert.equal(cleanImageSubject('Create one car image'), 'car');
  assert.equal(extractCleanImagePrompt('generate image of golden eagle'), 'golden eagle');
  assert.equal(extractCleanImagePrompt('/image cyberpunk city'), 'cyberpunk city');
  assert.equal(extractCleanImagePrompt('फोटो बनाओ ताज महल की'), 'ताज महल');

  const fluxUrl = getPollinationsFluxUrl('luxury sports car', 98765);
  assert.ok(fluxUrl.includes('image.pollinations.ai/prompt/luxury%20sports%20car'));
  assert.ok(fluxUrl.includes('model=flux'));
  assert.ok(fluxUrl.includes('seed=98765'));
  assert.ok(fluxUrl.includes('safe=true'));

  const url = buildPollinationsImageUrl('dragon', 12345);
  assert.ok(url.includes('image.pollinations.ai/prompt/dragon'));
  assert.ok(url.includes('seed=12345'));
});

test('cleanThoughtAndBrokenText strips internal thought leaks, orphan tags, and fake search indicators', () => {
  // 1. Complete thought tag
  const raw1 = '<thought>I need to check cricket scores for today...</thought>India won the match by 5 wickets!';
  assert.equal(cleanThoughtAndBrokenText(raw1), 'India won the match by 5 wickets!');

  // 2. Multiline thought with casing
  const raw2 = '<THOUGHT>\nStep 1: Parse user query\nStep 2: Generate response\n</THOUGHT>\nHere is your solution.';
  assert.equal(cleanThoughtAndBrokenText(raw2), 'Here is your solution.');

  // 3. Orphan closing tag at the start
  const raw3 = 'some intermediate reasoning step\n</thought>The exact answer is 42.';
  assert.equal(cleanThoughtAndBrokenText(raw3), 'The exact answer is 42.');

  // 4. Orphan closing tag inline
  const raw4 = '</thought>Hello! How can I assist you today?';
  assert.equal(cleanThoughtAndBrokenText(raw4), 'Hello! How can I assist you today?');

  // 5. Unclosed trailing thought tag
  const raw5 = 'Valid response here.<thought>Wait what about other cases...';
  assert.equal(cleanThoughtAndBrokenText(raw5), 'Valid response here.');

  // 6. Fake search placeholders
  const raw6 = '* (Searching Google for current news...)*\nHere are the top headlines for today.';
  assert.equal(cleanThoughtAndBrokenText(raw6), 'Here are the top headlines for today.');

  const raw7 = '*(Searching Google...)*\nResult content';
  assert.equal(cleanThoughtAndBrokenText(raw7), 'Result content');

  // 7. Empty or whitespace
  assert.equal(cleanThoughtAndBrokenText(''), '');
  assert.equal(cleanThoughtAndBrokenText('   '), '');
});

test('isBrokenOrIncompleteReply validates response quality and rejects broken replies', () => {
  // Empty, null, or short
  assert.equal(isBrokenOrIncompleteReply(''), true);
  assert.equal(isBrokenOrIncompleteReply('Short'), true);
  assert.equal(isBrokenOrIncompleteReply('Under 15 chars'), true);

  // Still contains thought tags
  assert.equal(isBrokenOrIncompleteReply('This is a response but still contains </thought> tag here'), true);
  assert.equal(isBrokenOrIncompleteReply('This contains <thought> tags inside the response text'), true);

  // Fake searching placeholder with no substance
  assert.equal(isBrokenOrIncompleteReply('* (Searching Google...)*'), true);
  assert.equal(isBrokenOrIncompleteReply('*(Searching Google for answers...)*'), true);

  // Valid, complete replies
  assert.equal(
    isBrokenOrIncompleteReply('Quantum computing leverages superposition and entanglement to perform complex computations.'),
    false
  );
  assert.equal(
    isBrokenOrIncompleteReply('नमस्ते! मैं ऑरा (AURA) हूँ, आपकी व्यक्तिगत एआई साथी। मैं आपकी क्या मदद करूँ?'),
    false
  );
});

test('formatGroundingSourcesAsMarkdown formats clickable links', () => {
  const sources = [
    { title: 'BBC News', uri: 'https://bbc.com/news' },
    { title: 'Reuters', uri: 'https://reuters.com' },
  ];
  const formatted = formatGroundingSourcesAsMarkdown(sources);
  assert.ok(formatted.includes('🌐 **Live Web Sources:**'));
  assert.ok(formatted.includes('• [BBC News](https://bbc.com/news)'));
  assert.ok(formatted.includes('• [Reuters](https://reuters.com)'));

  assert.equal(formatGroundingSourcesAsMarkdown([]), '');
});

test('fetchAuraReply is exported and callable', () => {
  assert.equal(typeof fetchAuraReply, 'function');
});

test('Daily Goal Tracker calculates progress percentage and updates progress within bounds', async () => {
  const { calculateGoalProgress, updateDailyGoalProgress } = await import('./auraLogic');

  assert.equal(calculateGoalProgress(0, 5), 0);
  assert.equal(calculateGoalProgress(2, 5), 40);
  assert.equal(calculateGoalProgress(5, 5), 100);
  assert.equal(calculateGoalProgress(8, 5), 100);
  assert.equal(calculateGoalProgress(-2, 5), 0);

  const initialGoal = {
    title: 'Solve 4 Coding Challenges',
    targetCount: 4,
    completedCount: 1,
    updatedDate: '2026-11-14',
  };

  const incremented = updateDailyGoalProgress(initialGoal, 1);
  assert.equal(incremented.completedCount, 2);
  assert.equal(calculateGoalProgress(incremented.completedCount, incremented.targetCount), 50);

  const maxedOut = updateDailyGoalProgress(initialGoal, 10);
  assert.equal(maxedOut.completedCount, 4);
  assert.equal(calculateGoalProgress(maxedOut.completedCount, maxedOut.targetCount), 100);

  const floored = updateDailyGoalProgress(initialGoal, -5);
  assert.equal(floored.completedCount, 0);
  assert.equal(calculateGoalProgress(floored.completedCount, floored.targetCount), 0);
});

test('getSafeEnvApiKey safely reads environment without throwing when process is undefined or MY_GEMINI_API_KEY', async () => {
  const { getSafeEnvApiKey, fetchFreePublicFallback } = await import('./auraLogic');
  assert.equal(typeof getSafeEnvApiKey(), 'string');
  assert.equal(typeof fetchFreePublicFallback, 'function');
});



