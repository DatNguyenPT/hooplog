---
name: create-pr
description: "Open a pull request end to end: preflight, feature branch, verified commit, push and gh pr create with a factual description. User-invoked only (/create-pr). Args: draft, review, base=<branch>."
disable-model-invocation: true
argument-hint: "[draft] [review] [base=<branch>]"
---
# Create a pull request

Invoking this skill is the user's go-ahead for exactly this: create a feature branch if needed, commit, push that branch, open one PR. It is not permission to merge, force-push, enable auto-merge, or add reviewers or labels the user did not name.

Arguments: `draft` opens a draft PR. `review` runs `tech-lead` before opening. `base=<branch>` overrides the base.

## Procedure
1. **Preflight.** Run `node tools/pr-preflight.mjs` (read-only, one JSON). Any `problems`: stop and say why. Otherwise print a 3-line plan (branch, base, N commits and M files) and heed `warnings` (behind base, no `gh`).
2. **Branch.** If `needsBranch`, `git switch -c <type>/<slug>`. Type is feat, fix, chore, docs, test or refactor; slug is kebab-case, 40 characters at most, from the change. Copy the pattern in `lastBranches` if there is one. Never commit to the base branch.
3. **Stage deliberately.** Add the files in `dirty` that belong to this change, by name. Never add anything in `doNotStage`, and never `git add -A` blindly. Name what you left out.
4. **Verify.** Run the project's lint and unit tests (commands from CLAUDE.md, package.json or the Makefile). Red: stop, show the output tail, and ask whether to fix it (`.claude/skills/agent-loop/SKILL.md`) or open as draft. Keep the exact commands and results for the body. No check exists: write "not verified".
5. **Review** (only with `review`, or when the diff is risky: auth, money, migrations, infra or CI, over 400 changed lines). Delegate to `tech-lead`. A BLOCKER stops the run; MAJOR findings go under Review notes in the body.
6. **Commit.** Match the style in `lastSubjects`. Imperative subject of 72 characters at most; the body says why. End with the attribution line this session specifies. A failing hook means fix the cause: never `--no-verify`, never amend a commit that is already pushed.
7. **Describe.** Write the body to a temp file outside the repo, from `template` if the repo has one, else `references/pr-body.md`. State only what ran. Add `Closes #n` only when a commit or the user names the issue.
8. **Open.** `node tools/pr-create.mjs --title "<title>" --body-file <file> [--base <b>] [--draft]`. The code refuses the base branch, a dirty tree and force. It pushes with upstream, reuses an already-open PR, and without `gh` pushes then prints a compare link (exit 3). The permission prompt for this command is the final confirmation.
9. **After.** If PR-tracking tools exist in this client (`get_status`, `bind_pr`), bind the PR so CI and review comments are tracked. Never poll CI. Reply with a Result Card: PR URL, base <- head, commits, checks run and results, what was left out.

## Never
Force-push. Commit or push to the base branch. Skip hooks. Stage secrets or build output. Merge or enable auto-merge. Open a second PR for the same branch. Report results that did not run.
