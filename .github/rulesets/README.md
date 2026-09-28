# Rulesets

Branch rulesets are **repository settings, not code**. Nothing in this folder
takes effect on its own — GitHub never reads it. The JSON here exists because
rulesets can be imported and exported, so this is a reviewable record of the
intended configuration rather than six screens of clicking to reproduce.

Same distinction as elsewhere in `.github/`:

| Thing | Lives where | Applied by |
|---|---|---|
| CI workflow | `workflows/ci.yml` | GitHub, automatically |
| Dependabot version updates | `dependabot.yml` | GitHub, automatically |
| Dependabot **alerts** | repository settings | you, in the UI |
| Branch **rulesets** | repository settings | you, in the UI (this folder is a copy) |

## Importing `require-lint-and-build.json`

**Settings → Rules → Rulesets → New ruleset → Import a ruleset**, then select
the file.

Afterwards, add the bypass so you can still push straight to `main`:

**Edit the ruleset → Bypass list → Add bypass → Repository admin**

That one step is deliberately not in the JSON. The bypass entry is keyed by a
numeric role ID, and writing down an ID I had not verified risked granting the
wrong role a bypass on the default branch — a bad thing to get subtly wrong.
One click in the UI is unambiguous.

## What it does

Requires the `Lint & build` check to pass before anything merges into the
default branch. That context string has to match the **job name** in
`workflows/ci.yml` exactly:

```yaml
jobs:
  build:
    name: Lint & build   # <- this is the status check context
```

Rename the job and the rule silently stops matching — it will sit there
waiting for a check that no longer reports. If you rename one, rename both.

## Notes

- `strict_required_status_checks_policy: false` means a PR does not have to be
  rebased onto the latest `main` before merging. Set it to `true` if you would
  rather every merge be tested against current `main`, at the cost of more
  rebasing.
- The check must have run at least once before GitHub will offer it in the
  "Add checks" picker. It has.
