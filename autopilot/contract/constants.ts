// Cross-plane constants (ADR-0009): every literal referenced on both sides of the
// hub↔spoke or hub↔Telegram seam lives here. This folder is copied verbatim into the
// spoke repo when the contract changes (ADR-0007) — nothing here may import outside
// src/contract/.

export const CONTRACT_VERSION = 1;

export const HEADER_TELEGRAM_SECRET = "x-telegram-bot-api-secret-token";
export const AUTH_SCHEME = "Bearer";

export const EVENT_TYPES = [
  "narration",
  "stage_started",
  "stage_finished",
  "question_asked",
  "answer_given",
  "ask_cancelled",
  "lane_halted",
  "spoke_enrolled",
  "spoke_offline",
  "spoke_recovered",
  "enrollment_code_issued",
  "project_registered",
  "spoke_revoked",
  "session_wrapup",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const ASK_STATUSES = ["pending", "answered", "cancelled"] as const;
export type AskStatus = (typeof ASK_STATUSES)[number];

export const SPOKE_REPORTABLE_EVENT_TYPES = [
  "narration",
  "stage_started",
  "stage_finished",
  "lane_halted",
  "session_wrapup",
] as const;
export type SpokeReportableEventType = (typeof SPOKE_REPORTABLE_EVENT_TYPES)[number];

export const SESSION_WRAPUP_VERDICTS = ["green", "yellow", "red"] as const;
export type SessionWrapupVerdict = (typeof SESSION_WRAPUP_VERDICTS)[number];
