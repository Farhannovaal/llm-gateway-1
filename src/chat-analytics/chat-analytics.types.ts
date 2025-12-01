export interface DailySummaryItem {
  day: string;
  totalTurns: number;
  turnsUsedRag: number;
  pctUsedRag: number;
  avgLatencyMs: number | null;
}

export interface SourceUsageItem {
  source: string;
  totalRefs: number;
}

export interface HistoryUsageItem {
  day: string;
  totalTurns: number;
  turnsWithHistory: number;
}

export interface ModeUsageItem {
  mode: string;
  totalTurns: number;
  turnsUsedRag: number;
  avgLatencyMs: number | null;
}

export interface SessionSummaryItem {
  sessionId: string;
  totalTurns: number;
  usedRagTurns: number;
  hasHistory: boolean;
  lastActivityAt: string | null;
  summary: string;
}

export interface GlobalSummary {
  totalSessions: number;
  totalTurns: number;
  totalRagTurns: number;
  pctUsedRag: number;
  avgLatencyMs: number | null;
  topSources: SourceUsageItem[];
}

export interface SessionListItem {
  id: string;
  userId: string | null;
  title: string | null;
  createdAt: string;
  lastActivityAt: string | null;
  totalTurns: number;
  usedRagTurns: number;
  lastUserText: string | null;
  lastAssistantText: string | null;
}

export interface SessionTurnItem {
  id: string;
  createdAt: string;
  userText: string;
  assistantText: string;
  mode: string | null;
  usedRag: boolean;
  hitsCount: number;
  latencyMs: number | null;
}
