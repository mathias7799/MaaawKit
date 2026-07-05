---
description: Capture a lesson/decision/repo-fact as a schema-valid memory record (.agent/memory/) so future sessions of any agent know it
argument-hint: <the thing to remember, or blank to extract lessons from this session>
---
Read the memory-and-learning skill. Record: $ARGUMENTS

If arguments were given: classify the type (lesson / decision / repo-fact / preference / failure-pattern), generalize the phrasing past the single incident, pick tags and the path globs it applies to, then capture it with `maaaw memory add "<title>" --body "<evidence-first paragraph>" --type <type> --tags <a,b> --paths "<globs>" --confidence <low|medium|high>`.

If blank: review THIS session for uncaptured lessons — corrections I gave you, root causes found, failed approaches, stated preferences — propose the records (title, type, confidence), then capture the ones I confirm.
