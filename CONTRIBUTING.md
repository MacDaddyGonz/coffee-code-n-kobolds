# Contributing

## Branch strategy

Two long-lived branches, both protected and neither deletable:

| Branch | Purpose | How changes get in |
| ------ | ------- | ------------------ |
| `main` | Stable / released code | **Pull request from `dev` only** |
| `dev`  | Integration branch, day-to-day work | Direct pushes and merges are fine |

```
feature/xyz ──┐
              ├──▶ dev ──(pull request)──▶ main
  fix/abc  ───┘
```

### Rules enforced by GitHub

Both branches are covered by repository rulesets:

- **Neither branch can be deleted.**
- **Neither branch accepts force pushes** (no non-fast-forward updates).
- **`main` requires a pull request.** Pushing straight to `main` is rejected, even for the repo
  owner. Approvals are not required, so a solo maintainer can still merge their own PR — the point
  is that every change to `main` passes through a reviewable PR.

### Day-to-day

```bash
git checkout dev
git pull
git checkout -b feature/short-description

# ... work ...

git push -u origin feature/short-description
# open a PR into dev, or merge locally and push dev directly
```

### Releasing to `main`

```bash
git checkout dev
git pull
git push
```

Then open a pull request from `dev` into `main` on GitHub and merge it there.

## Commit messages

Short imperative subject line, e.g. `Add initiative tracker to DM panel`. Body optional; use it to
explain *why* when the reason isn't obvious from the diff.
