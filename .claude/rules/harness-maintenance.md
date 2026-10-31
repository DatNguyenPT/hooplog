---
paths:
  - ".claude/**"
  - "tools/**"
---
# Editing the harness

- Keep it lean: agent file <= 90 lines, SKILL.md <= 130, CLAUDE.md <= 150. Detail goes in `references/` and is linked from SKILL.md. Run `node tools/harness-lint.mjs` after every change; it also prints the token cost of each agent spawn.
- Define once: a persona is the first paragraph of its agent file (text before the first `## `). Shared rules live only in CLAUDE.md. Never copy them into agents or skills.
- Frontmatter: one line per key, descriptions in double quotes with no inner double quotes. `skills:` preloads the FULL skill text at every spawn, so preload one lean skill per agent and point to the rest by path.
- Editing CLAUDE.md, agents, skills or settings mid-session busts the prompt cache. Batch edits, then start a fresh session.
- Loop state is owned by `tools/lib/loop.mjs`. Change behavior there and in `tools/test/loopctl.test.mjs` together, then run `npm test`.
- `tools/ask.mjs`: the system prefix must stay byte-stable (no timestamps or ids) or prompt caching silently stops working.
