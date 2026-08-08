import assert from "node:assert/strict";
import { test } from "node:test";
import { Value } from "@sinclair/typebox/value";
import {
  AskCreateRequest,
  CONTRACT_VERSION,
  Cursor,
  EnrollRequest,
  EnrollResponse,
  EVENT_TYPES,
  PollQuery,
  PollResponse,
  RegisterProjectRequest,
  RegisterProjectResponse,
  ReportedEvent,
  ReportRequest,
  ReportResponse,
  SessionWrapupPayload,
  SPOKE_REPORTABLE_EVENT_TYPES,
  UtcTimestamp,
  WireEvent,
} from "./index.ts";

test("wire conventions hold: Z-only timestamps, string cursors, integer version", () => {
  assert.ok(Number.isInteger(CONTRACT_VERSION));
  assert.ok(Value.Check(UtcTimestamp, "2026-08-02T12:00:00Z"));
  assert.ok(!Value.Check(UtcTimestamp, "2026-08-02T12:00:00+02:00"), "offsets rejected");
  assert.ok(Value.Check(Cursor, "42"));
  assert.ok(!Value.Check(Cursor, "42n"));
});

test("AC-20260803-03-10: contract exports every brief-02 wire schema with CONTRACT_VERSION 1", () => {
  assert.equal(CONTRACT_VERSION, 1, "CONTRACT_VERSION must never bump — every change was additive");

  const wireSchemas = {
    EnrollRequest,
    EnrollResponse,
    RegisterProjectRequest,
    RegisterProjectResponse,
    PollQuery,
    PollResponse,
    WireEvent,
    ReportRequest,
    ReportResponse,
    ReportedEvent,
  };
  for (const [name, schema] of Object.entries(wireSchemas)) {
    assert.ok(
      schema && typeof schema === "object",
      `${name} must be exported as a TypeBox schema from src/contract/index.ts`,
    );
  }

  assert.deepEqual(
    SPOKE_REPORTABLE_EVENT_TYPES,
    ["narration", "stage_started", "stage_finished", "lane_halted", "session_wrapup"],
    "SPOKE_REPORTABLE_EVENT_TYPES must be exactly the D2 subset, in order",
  );

  // AC-10: ReportedEvent's eventId is a 26-char Crockford-base32 ULID pattern (D1),
  // and its type field is restricted to the reportable subset — not the full EVENT_TYPES.
  assert.ok(
    Value.Check(ReportedEvent, {
      eventId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      type: "narration",
      payload: { text: "hi" },
    }),
    "a well-formed reported event must validate",
  );
  assert.ok(
    !Value.Check(ReportedEvent, {
      eventId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      type: "spoke_enrolled",
    }),
    "a hub-lifecycle type must not validate as a reportable event",
  );
});

test("AC-20260805-01-1: AskCreateRequest accepts an SDK-shaped ask and rejects a malformed clientAskId; EVENT_TYPES includes ask_cancelled", () => {
  assert.ok(
    Value.Check(AskCreateRequest, {
      clientAskId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      projectId: "prj_x",
      questions: [{ question: "Deploy?", options: [{ label: "Now" }] }],
    }),
    "a minimal SDK-shaped ask must validate",
  );
  assert.ok(
    !Value.Check(AskCreateRequest, {
      clientAskId: "not-a-ulid",
      projectId: "prj_x",
      questions: [{ question: "Deploy?", options: [{ label: "Now" }] }],
    }),
    "a malformed clientAskId must not validate",
  );
  assert.ok(
    (EVENT_TYPES as readonly string[]).includes("ask_cancelled"),
    "EVENT_TYPES must include the new ask_cancelled type",
  );
});

test("AC-20260806-01-8: EVENT_TYPES includes spoke_recovered, SPOKE_REPORTABLE_EVENT_TYPES excludes it", () => {
  assert.ok(
    (EVENT_TYPES as readonly string[]).includes("spoke_recovered"),
    "EVENT_TYPES must include the new spoke_recovered hub-observation type",
  );
  assert.ok(
    !(SPOKE_REPORTABLE_EVENT_TYPES as readonly string[]).includes("spoke_recovered"),
    "a spoke must not be able to report its own recovery — spoke_recovered stays out of SPOKE_REPORTABLE_EVENT_TYPES",
  );
});

test("AC-20260807-01-1, AC-20260807-01-3: EVENT_TYPES appends session_wrapup as the 14th (last) entry, SPOKE_REPORTABLE_EVENT_TYPES appends it as the 5th (last) entry, all pre-existing entries unchanged in order, CONTRACT_VERSION stays 1", () => {
  assert.equal(CONTRACT_VERSION, 1, "additive change: CONTRACT_VERSION must not bump");
  assert.deepEqual(EVENT_TYPES, [
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
  ]);
  assert.deepEqual(SPOKE_REPORTABLE_EVENT_TYPES, [
    "narration",
    "stage_started",
    "stage_finished",
    "lane_halted",
    "session_wrapup",
  ]);
});

test("AC-20260807-01-2: SessionWrapupPayload accepts a well-formed payload and rejects an invalid verdict, an empty summary, a negative queueCount, and a non-integer queueCount", () => {
  assert.ok(
    Value.Check(SessionWrapupPayload, {
      verdict: "green",
      summary: "shipped the relay",
      queueCount: 0,
    }),
    "a well-formed payload must validate",
  );
  assert.ok(
    !Value.Check(SessionWrapupPayload, { verdict: "purple", summary: "x", queueCount: 0 }),
    "an unknown verdict literal must not validate",
  );
  assert.ok(
    !Value.Check(SessionWrapupPayload, { verdict: "green", summary: "", queueCount: 0 }),
    "an empty summary must not validate",
  );
  assert.ok(
    !Value.Check(SessionWrapupPayload, { verdict: "green", summary: "x", queueCount: -1 }),
    "a negative queueCount must not validate",
  );
  assert.ok(
    !Value.Check(SessionWrapupPayload, { verdict: "green", summary: "x", queueCount: 1.5 }),
    "a non-integer queueCount must not validate",
  );
});

test("AC-20260805-01-2: PollResponse.asks items are WireAsk-shaped", () => {
  assert.ok(
    Value.Check(PollResponse, {
      contractVersion: 1,
      cursor: "42",
      events: [],
      asks: [
        {
          askId: "ask_01ARZ3NDEKTSV4RRFFQ69G5FAV",
          projectId: "prj_x",
          questions: [{ question: "Deploy?", options: [{ label: "Now" }] }],
          createdAt: "2026-08-05T12:00:00Z",
        },
      ],
    }),
    "a well-formed WireAsk item must validate inside PollResponse.asks",
  );
  assert.ok(
    !Value.Check(PollResponse, {
      contractVersion: 1,
      cursor: "42",
      events: [],
      asks: [{ foo: 1 }],
    }),
    "a non-conforming asks item must not validate",
  );
});
