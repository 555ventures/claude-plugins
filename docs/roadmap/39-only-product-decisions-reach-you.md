# 39 — Only product decisions reach you

Phase: P3 · Depends on: 35 · Primary workspaces: spec/doctrine.md, spec/commands/{plan,run,fix,fanout,migrate}.md,
spec/agents/{builder,reviewer}.md, spec/templates/{spec,mocks-seed}.md, spec/scripts/{plan,run,fanout,migrate,mocks}.js,
spec/scripts/lib/{pending,question,report,state}.js, style/output-styles/plain.md, docs/v8/interface-contract.md, tests · Risk: T2 · Design stage: no · Expected specs: 1

<!-- Minted 2026-11-06. Replaces brief 35's stop rules (its escalate, scope, spec-edit, conflict and fix-choices
     questions, and `Client sign-off`); everything else brief 35 built stands. Folds in queue item q189.
     JJ is a project manager with clients: a change in architecture, behaviour or major UI/UX has to reach him in
     words he can take to them, and nothing else should stop him. Evidence, all 61 questions in this repo's
     transcripts 2026-11-03..07: 41% client-level, 5% readable by a non-technical person, 52% rejected (mostly
     "explain first"), recommended option taken 28 of 28. Fix choices 10 questions, 0 client-level. Mid-run forks
     7, 0 client-level. Plan forks 21, 15 client-level. And he reports v8 went too quiet on niko-hub and shop-bltr,
     so the fix is not fewer questions alone: what used to be a question must become a line he reads. -->

## Result

A question reaches you only when it is a product decision, and it reads like one: what people using the product
would notice and what each option means for them. Everything mechanical is settled by a rule and shown as a pin.
Every run and batch ends by saying what users will notice and what was decided without asking, so a quiet run can
not hide a real change.

## Scope

1. **Six stops stay; the rest become rules.** Plan forks, the lock yes and heads-up, `unmet`, `assumption` with an
   ask arm, the new `unclear`, and the reviewer's `needs-decision`. Gate or review red after the cap parks; a spec edit reverts and regates; scope
   on a watched path widens with a row the reviewer judges; a conflict is resolved in place; a secret-looking file
   stays out of the commit; a fix's strings and choices go to the reviewer.
2. **The agent that found the fork writes the question, the way a colleague would say it.** Builder for `unmet`,
   `assumption` and `unclear`, reviewer for `needs-decision`, planner for plan forks. No sentence template. Context
   comes first: what is going on, a real example, what was found, what the author would do, then the question. The
   owner is a programmer who does not read the code agents write. One deterministic lint refuses only jargon, code
   tokens and overlong text.
3. **Quiet failure closes.** `Users will notice:` in the Intent, one short heads-up per plan before building on every
   project alike, `userVisible` in the review, two report sections.
4. **A dismissed question is never answered for you.** Asked once more, explained; a second dismissal pauses that
   work and the rest continues.
5. **Plan prepares before it asks.** Without being asked: quick best-practice research by a cheap agent (Context7 when
   a library or tool is involved), then a walk through the expected user's flow step by step. Findings feed the
   questions and the Decisions.
6. **Not crystal clear means ask.** The planner never guesses at what the user wants. A builder that hits a real gap
   stops through a named mark, `unclear`. After building starts, stop only for something real.
7. **At most three at a time, not three in total.** If something is still unclear after the answers, ask the next few.
8. **Fable only for real decisions.** Before a real product question reaches the user, Fable looks for a better or
   structural approach and the recommendation comes from that. Never for wording, small fixes or internal details.
   `/spec:plan` stops pinning its own model, so a user's seat request wins.
9. **The chat sounds the same.** The `style` plugin's output style writes decisions and questions in this voice; its
   verdict line and 🎯 block stay.
10. **q189.** Client wording becomes you / the user; `Client sign-off` becomes `User sign-off`, migrated.

## Who decides what

- **Ask:** failed payment retry or error; deleting an account and order history; staff losing access to phone
  numbers; paid or free email service; moving databases; a plan that cannot work as written; a bug fix that makes
  customers pay more, such as a wrongly applied discount now stopping; going live, always.
- **Heads-up before building:** order number in email subjects; an agreed new checkout step; a bug fix making the
  total show tax; an admin-only filter on a staff screen.
- **Decide and list in the report:** tests keep failing so work pauses; two jobs edit the same file; a file that looks
  like a password is left out; code reorganised with no visible difference; faster page; small wording fix ("Error
  402" to "Your card was declined"); small look change; major library upgrade with no visible change.
- **Decide without listing:** variable names, tidying, test changes, internal notes.

## Style reference

Approved samples, with made-up shop content. They show the voice; they are not a template.

- **Unclear request:** "You asked for discounts on the shop. I looked at how similar shops do it and walked through a
  customer checking out, and one thing isn't clear to me. Say a customer has a 10% code and there's also a summer sale
  running. Most shops let only one apply, because stacking them can eat your margin. Should they get just the better
  of the two, or both? I'd go with the better one, unless you've promised your customers otherwise."
- **Real choice:** "We're adding account deletion. When a customer deletes their account, their past orders are the
  tricky part. Most shops keep orders for tax records but remove the name and address, so the customer is gone but the
  numbers still add up. The other way is to delete everything, which is simpler, but your sales reports would change
  and you may have a tax problem. I'd keep the orders and remove the personal details. Is that OK?"
- **Heads-up:** "Before I start on the order emails, here's what users will notice: every order email will show the
  order number in its subject, so customers can find it in their inbox. Nothing else changes. OK to go ahead?"
- **Plan cannot be followed:** "I need to stop on the receipt work. The plan says to send receipts by text message,
  but the text service we use doesn't deliver to Japan, so those customers would get nothing. Email would work today
  at no extra cost. A different text service would keep the plan, but it adds about a week and a monthly fee. I'd
  switch to email for now. Which do you prefer?"
- **Report:** "Done: order emails. What users will notice: the order number in the subject. Decided without you: the
  first version kept failing its tests, so I paused it and retried with a stronger model. It then passed."

## Out of scope

Mocks, prototype, release and genesis stops. A veto parser: a veto is a reply, and the orchestrator queues a fix.
A model-judged style check: commit 1e786774 records one flipping on identical input with no way out.
