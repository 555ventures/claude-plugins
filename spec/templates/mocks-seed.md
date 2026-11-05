# Seed

<!-- One `### <journey-kebab>` per journey: a job story (`When <situation>, I want <motivation>,
     so I can <outcome>.`), then numbered beats `N. "client sentence" -> screen[@state]`, N from 1,
     screen and state matching `^[\w][\w-]*$`. One beat lands on `@first-run` or `@empty`.
     Alternates are separate journeys. Invent every sample value.

     Each distinct `screen[@state]` is one gray json-render file,
     design/mocks/screens/<screen>[@<state>].json:
       { "root": "page",
         "elements": {
           "page":  { "type": "Stack",  "props": { "gap": 16 }, "children": ["title", "go"] },
           "title": { "type": "Heading", "props": { "text": "Invite your team", "level": 1 }, "children": [] },
           "go":    { "type": "Button", "props": { "label": "Send invite" }, "children": [],
                      "on": { "press": { "action": "navigate", "params": { "to": "invite-sent" } } } } } }
     Components: Stack Row Grid Card Divider Heading Text Badge Alert Button Field Select Checkbox
     Tabs Nav List Table Image Avatar. Every move between two beats' screens is a control whose
     `on.press` navigates to the next screen. -->

## Product

{ three sentences: what it is · who it is for · the one job it must do }

## Journeys

### { journey-kebab }
When { situation }, I want { motivation }, so I can { outcome }.
1. "{ I open the app }" -> home
2. "{ I see nothing here yet }" -> roster@first-run
