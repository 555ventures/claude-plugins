# Seed

<!-- Written by `mocks.js` at SEED; fill it in, then mark seed-done. The driver refuses a journey with
     no job story, no beats, a malformed beat, or a non-contiguous number, and any `{ placeholder }`
     left in a journey id.

     JOURNEYS. One `### <journey-kebab>` per journey: a job-story line
     (`When <situation>, I want <motivation>, so I can <outcome>.`), then numbered beats, one per
     line: `N. "client sentence" -> screen[@state]`. Quotes are mandatory, N runs from 1, screen and
     state match `^[\w][\w-]*$`. One beat per journey should land on an off-path state
     (`@first-run` or `@empty`). Alternates are separate journeys. Invent every sample value;
     never ask the user for data.

     SCREEN FILES. SCREENS draws one gray json-render file per distinct `screen[@state]` target at
     design/mocks/screens/<screen>.json or <screen>@<state>.json:
       { "root": "page",
         "elements": {
           "page":  { "type": "Stack",  "props": { "gap": 16 }, "children": ["title", "go"] },
           "title": { "type": "Heading", "props": { "text": "Invite your team", "level": 1 }, "children": [] },
           "go":    { "type": "Button", "props": { "label": "Send invite" }, "children": [],
                      "on": { "press": { "action": "navigate", "params": { "to": "invite-sent" } } } } } }
     Components: Stack Row Grid Card Divider Heading Text Badge Alert Button Field Select Checkbox
     Tabs Nav List Table Image Avatar. Every move between two beats' screens is a control whose
     `on.press` navigates (`params.to` = the next screen name). Element keys are stable names. -->

## Product

{ three sentences: what it is · who it is for · the one job it must do }

## Journeys

### { journey-kebab }
When { situation }, I want { motivation }, so I can { outcome }.
1. "{ I open the app }" -> home
2. "{ I see nothing here yet }" -> roster@first-run
