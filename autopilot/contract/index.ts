// Wire contract (ADR-0007): TypeBox schemas — one definition drives Fastify runtime
// validation, TypeScript types, and the plain JSON Schema the spoke consumes.
// Wire conventions (ADR-0009): camelCase fields, ISO-8601 UTC "Z" timestamps,
// bigint cursors as strings, discriminator field name "type".

import { type Static, Type } from "@sinclair/typebox";
import {
  ASK_STATUSES,
  EVENT_TYPES,
  SESSION_WRAPUP_VERDICTS,
  SPOKE_REPORTABLE_EVENT_TYPES,
} from "./constants.ts";

export * from "./constants.ts";

export const UtcTimestamp = Type.String({
  pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?Z$",
  description: "ISO-8601 UTC, Z suffix only",
});

export const Cursor = Type.String({
  pattern: "^\\d+$",
  description: "Event-outbox bigint sequence id, string-encoded",
});

export const EventTypeSchema = Type.Union(EVENT_TYPES.map((t) => Type.Literal(t)));
export const AskStatusSchema = Type.Union(ASK_STATUSES.map((s) => Type.Literal(s)));

export const HealthResponse = Type.Object({
  ok: Type.Literal(true),
  contractVersion: Type.Integer(),
});
export type HealthResponseType = Static<typeof HealthResponse>;

export const ErrorResponse = Type.Object({
  code: Type.String(),
  message: Type.String(),
});
export type ErrorResponseType = Static<typeof ErrorResponse>;

export const EnrollRequest = Type.Object({
  code: Type.String({ minLength: 1 }),
  contractVersion: Type.Integer(),
  machineName: Type.String({ minLength: 1, maxLength: 100 }),
  projects: Type.Array(Type.String({ minLength: 1, maxLength: 200 }), {
    default: [],
    uniqueItems: true, // refuter finding: duplicate names would 23505 inside the txn → 500
  }),
});
export type EnrollRequestType = Static<typeof EnrollRequest>;

export const EnrolledProject = Type.Object({
  projectId: Type.String(),
  name: Type.String(),
});
export type EnrolledProjectType = Static<typeof EnrolledProject>;

export const EnrollResponse = Type.Object({
  spokeId: Type.String(),
  token: Type.String(), // shown once; never persisted or logged in the clear
  projects: Type.Array(EnrolledProject),
  contractVersion: Type.Integer(),
});
export type EnrollResponseType = Static<typeof EnrollResponse>;

export const RegisterProjectRequest = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 200 }),
});
export type RegisterProjectRequestType = Static<typeof RegisterProjectRequest>;

export const RegisterProjectResponse = Type.Object({
  projectId: Type.String(),
  name: Type.String(),
  created: Type.Boolean(), // false = name already registered for this spoke (idempotent no-op)
  contractVersion: Type.Integer(),
});
export type RegisterProjectResponseType = Static<typeof RegisterProjectResponse>;

export const WireEvent = Type.Object({
  seq: Cursor, // string-encoded bigint
  type: EventTypeSchema,
  spokeId: Type.Optional(Type.String()), // omitted when the row's spoke_id is NULL
  projectId: Type.Optional(Type.String()), // omitted when NULL
  payload: Type.Unknown(),
  createdAt: UtcTimestamp,
});
export type WireEventType = Static<typeof WireEvent>;

export const PollQuery = Type.Object({
  since: Cursor,
});
export type PollQueryType = Static<typeof PollQuery>;

export const WireAskOption = Type.Object({
  label: Type.String(),
  description: Type.Optional(Type.String()),
});
export type WireAskOptionType = Static<typeof WireAskOption>;

export const WireAskQuestion = Type.Object({
  question: Type.String(),
  header: Type.Optional(Type.String()),
  options: Type.Array(WireAskOption, { minItems: 1 }),
  multiSelect: Type.Optional(Type.Boolean()),
});
export type WireAskQuestionType = Static<typeof WireAskQuestion>;

export const WireAsk = Type.Object({
  askId: Type.String(),
  projectId: Type.String(),
  questions: Type.Array(WireAskQuestion, { minItems: 1 }),
  createdAt: UtcTimestamp,
});
export type WireAskType = Static<typeof WireAsk>;

export const PollResponse = Type.Object({
  contractVersion: Type.Integer(),
  cursor: Cursor, // last returned seq, or `since` when events is []
  events: Type.Array(WireEvent),
  asks: Type.Array(WireAsk, {
    description: "The authed spoke's currently-pending asks, ascending id",
  }),
});
export type PollResponseType = Static<typeof PollResponse>;

export const AskCreateRequest = Type.Object({
  clientAskId: Type.String({
    pattern: "^[0-9A-HJKMNP-TV-Z]{26}$",
    description: "Spoke-minted ULID — the at-least-once dedupe key",
  }),
  projectId: Type.String(),
  questions: Type.Array(WireAskQuestion, { minItems: 1 }),
});
export type AskCreateRequestType = Static<typeof AskCreateRequest>;

export const AskCreateResponse = Type.Object({
  contractVersion: Type.Integer(),
  askId: Type.String(),
  status: AskStatusSchema,
});
export type AskCreateResponseType = Static<typeof AskCreateResponse>;

export const AskCancelParams = Type.Object({ askId: Type.String() });
export type AskCancelParamsType = Static<typeof AskCancelParams>;

export const AskCancelResponse = Type.Object({
  contractVersion: Type.Integer(),
  askId: Type.String(),
  status: AskStatusSchema,
});
export type AskCancelResponseType = Static<typeof AskCancelResponse>;

export const SpokeReportableEventTypeSchema = Type.Union(
  SPOKE_REPORTABLE_EVENT_TYPES.map((t) => Type.Literal(t)),
);

export const ReportedEvent = Type.Object({
  eventId: Type.String({
    pattern: "^[0-9A-HJKMNP-TV-Z]{26}$",
    description: "Spoke-minted ULID — the at-least-once dedupe key",
  }),
  type: SpokeReportableEventTypeSchema,
  projectId: Type.Optional(Type.String()),
  payload: Type.Optional(Type.Unknown()), // opaque; defaults to {} at insert
});
export type ReportedEventType = Static<typeof ReportedEvent>;

export const ReportRequest = Type.Object({
  events: Type.Array(ReportedEvent, { minItems: 1, maxItems: 50 }),
});
export type ReportRequestType = Static<typeof ReportRequest>;

export const ReportResponse = Type.Object({
  contractVersion: Type.Integer(),
  accepted: Type.Integer(), // rows newly appended
  duplicates: Type.Integer(), // rows skipped by (spokeId, eventId) dedupe
});
export type ReportResponseType = Static<typeof ReportResponse>;

export const SessionWrapupVerdictSchema = Type.Union(
  SESSION_WRAPUP_VERDICTS.map((v) => Type.Literal(v)),
);

// The spoke hook's build-time contract for the payload it POSTs; the report route does
// NOT enforce it (payload stays opaque jsonb, ADR-0007) — the narrator reads it
// defensively (D3).
export const SessionWrapupPayload = Type.Object({
  verdict: SessionWrapupVerdictSchema,
  summary: Type.String({ minLength: 1, maxLength: 500 }),
  queueCount: Type.Integer({ minimum: 0 }),
});
export type SessionWrapupPayloadType = Static<typeof SessionWrapupPayload>;
