import type {
  AdminConfig,
  AuthUser,
  ChatSession,
  DailyGoal,
  ManagedUser,
  TelemetryData,
  UserSettings,
} from '../types/aura';

const KEYS = {
  SETTINGS: 'aura_user_settings_v1',
  SESSIONS: 'aura_chat_sessions_v1',
  ACTIVE_SESSION_ID: 'aura_active_session_v1',
  AUTH_USER: 'aura_auth_user_v1',
  ADMIN_CONFIG: 'aura_admin_config_v1',
  MANAGED_USERS: 'aura_managed_users_v1',
  TELEMETRY: 'aura_telemetry',
  DAILY_GOAL: 'aura_daily_goal_v1',
};

export const DEFAULT_DAILY_GOAL: DailyGoal = {
  title: 'Complete 5 Study / Work Tasks',
  targetCount: 5,
  completedCount: 0,
  updatedDate: new Date().toISOString().slice(0, 10),
};

export const DEFAULT_SETTINGS: UserSettings = {
  displayName: 'Explorer',
  voiceProfile: 'Nova',
  speechSpeed: 1.0,
  autoSpeak: false,
  language: 'English',
  personalMemory: '',
  animationStyle: 'auto',
};

export const DEFAULT_ADMIN_CONFIG: AdminConfig = {
  liveWebSearchEnabled: true,
  maintenanceMode: false,
  announcementBanner: '',
};

export const DEFAULT_TELEMETRY: TelemetryData = {
  totalRegisteredUsers: 0,
  activeSessionsCount: 0,
  totalQueriesProcessed: 0,
  totalImagesCreated: 0,
  activityLogs: [],
};

export const SEED_MANAGED_USERS: ManagedUser[] = [
  {
    id: 'u-1',
    name: 'Roshan Patel',
    identifier: 'boss@aura.ai',
    role: 'Boss Admin',
    status: 'Active',
    queries: 0,
    lastSeen: 'Just now',
  },
  {
    id: 'u-2',
    name: 'Aarav Sharma',
    identifier: 'aarav.sharma@techmail.in',
    role: 'Pro Member',
    status: 'Active',
    queries: 0,
    lastSeen: '4 mins ago',
  },
  {
    id: 'u-3',
    name: 'Elena Vance',
    identifier: 'elena.v@studio.io',
    role: 'Pro Member',
    status: 'Active',
    queries: 0,
    lastSeen: '18 mins ago',
  },
  {
    id: 'u-4',
    name: 'Kabir Mehta',
    identifier: '+91 98201 44810',
    role: 'Standard',
    status: 'Active',
    queries: 0,
    lastSeen: '1 hr ago',
  },
  {
    id: 'u-5',
    name: 'Mira Lin',
    identifier: 'mira.lin@campus.edu',
    role: 'Standard',
    status: 'Suspended',
    queries: 0,
    lastSeen: '2 days ago',
  },
];

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

function getUserScope(): string {
  const user = safeRead<AuthUser | null>(KEYS.AUTH_USER, null);
  if (!user || !user.identifier) return 'guest';
  if (user.role === 'guest' || user.identifier.toLowerCase() === 'guest@aura.ai') {
    return 'guest';
  }
  return user.identifier.toLowerCase().replace(/[^a-z0-9@._-]/g, '_');
}

function clearLegacySharedData(): void {
  try {
    window.localStorage.removeItem(KEYS.SESSIONS);
    window.localStorage.removeItem(KEYS.ACTIVE_SESSION_ID);
    window.localStorage.removeItem('aura_saved_chats_v2');
  } catch {
    // Ignore
  }
}

export function loadSettings(): UserSettings {
  const scope = getUserScope();
  if (scope === 'guest') return { ...DEFAULT_SETTINGS };
  return {
    ...DEFAULT_SETTINGS,
    ...safeRead<Partial<UserSettings>>(`${KEYS.SETTINGS}_${scope}`, {}),
  };
}

export function saveSettings(settings: UserSettings): void {
  const scope = getUserScope();
  if (scope === 'guest') return;
  safeWrite(`${KEYS.SETTINGS}_${scope}`, settings);
}

export function loadSessions(): ChatSession[] {
  const scope = getUserScope();
  if (scope === 'guest') return [];
  return safeRead<ChatSession[]>(`${KEYS.SESSIONS}_${scope}`, []);
}

export function saveSessions(sessions: ChatSession[]): void {
  const scope = getUserScope();
  if (scope === 'guest') return;
  safeWrite(`${KEYS.SESSIONS}_${scope}`, sessions);
}

export function loadActiveSessionId(): string | null {
  const scope = getUserScope();
  if (scope === 'guest') return null;
  return safeRead<string | null>(`${KEYS.ACTIVE_SESSION_ID}_${scope}`, null);
}

export function saveActiveSessionId(id: string | null): void {
  const scope = getUserScope();
  if (scope === 'guest') return;
  safeWrite(`${KEYS.ACTIVE_SESSION_ID}_${scope}`, id);
}

export function loadAuthUser(): AuthUser | null {
  return safeRead<AuthUser | null>(KEYS.AUTH_USER, null);
}

export function saveAuthUser(user: AuthUser | null): void {
  clearLegacySharedData();
  if (!user) {
    try {
      window.localStorage.removeItem(KEYS.AUTH_USER);
    } catch {
      // Ignore
    }
    return;
  }
  safeWrite(KEYS.AUTH_USER, user);
}

export function loadAdminConfig(): AdminConfig {
  return { ...DEFAULT_ADMIN_CONFIG, ...safeRead<Partial<AdminConfig>>(KEYS.ADMIN_CONFIG, {}) };
}

export function saveAdminConfig(config: AdminConfig): void {
  safeWrite(KEYS.ADMIN_CONFIG, config);
}

export function loadManagedUsers(): ManagedUser[] {
  const stored = safeRead<ManagedUser[] | null>(KEYS.MANAGED_USERS, null);
  return stored && stored.length > 0 ? stored : SEED_MANAGED_USERS;
}

export function saveManagedUsers(users: ManagedUser[]): void {
  safeWrite(KEYS.MANAGED_USERS, users);
}

export function loadTelemetry(): TelemetryData {
  return { ...DEFAULT_TELEMETRY, ...safeRead<Partial<TelemetryData>>(KEYS.TELEMETRY, {}) };
}

export function saveTelemetry(telemetry: TelemetryData): void {
  safeWrite(KEYS.TELEMETRY, telemetry);
}

export function recordTelemetryEvent(
  updater: (prev: TelemetryData) => TelemetryData
): TelemetryData {
  const current = loadTelemetry();
  const updated = updater(current);
  saveTelemetry(updated);
  return updated;
}

export function loadDailyGoal(): DailyGoal {
  const scope = getUserScope();
  const stored =
    scope === 'guest'
      ? {}
      : safeRead<Partial<DailyGoal>>(`${KEYS.DAILY_GOAL}_${scope}`, {});
  const title =
    typeof stored.title === 'string' && stored.title.trim()
      ? stored.title.trim()
      : DEFAULT_DAILY_GOAL.title;
  const targetCount =
    typeof stored.targetCount === 'number' && stored.targetCount >= 1
      ? Math.min(100, Math.round(stored.targetCount))
      : DEFAULT_DAILY_GOAL.targetCount;
  const completedCount =
    typeof stored.completedCount === 'number' && stored.completedCount >= 0
      ? Math.min(targetCount, Math.round(stored.completedCount))
      : DEFAULT_DAILY_GOAL.completedCount;
  return {
    title,
    targetCount,
    completedCount,
    updatedDate: stored.updatedDate || DEFAULT_DAILY_GOAL.updatedDate,
  };
}

export function saveDailyGoal(goal: DailyGoal): void {
  const scope = getUserScope();
  if (scope === 'guest') return;
  safeWrite(`${KEYS.DAILY_GOAL}_${scope}`, goal);
      }
