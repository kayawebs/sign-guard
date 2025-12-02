# Clean Git History (remove `node_modules` from history)

This repository previously committed `node_modules/`. The steps below rewrite Git history to remove it entirely and shrink the repo.

Important: rewriting history changes commit SHAs. Coordinate with all collaborators.

## 0) Preconditions

- Ensure you have a clean working tree: `git status` (no uncommitted changes)
- Make a backup (optional): `git clone --mirror <repo> ../repo-backup.git`

## 1) Add proper ignores (done)

`.gitignore` now excludes `node_modules/`, `.next/`, `var/`, `.env*`, etc., so they won't be re‑added.

## 2) Install `git-filter-repo` (recommended)

- macOS (Homebrew): `brew install git-filter-repo`
- Python/pipx: `pipx install git-filter-repo` or `pip install git-filter-repo`

> If you cannot use filter-repo, see BFG alternative below.

## 3) Rewrite history to remove `node_modules/`

From the repo root:

```bash
# remove node_modules from all history
git filter-repo --path node_modules --path-glob 'node_modules/**' --invert-paths

# (Optional) remove other large/derived dirs if they ever slipped in
# git filter-repo --path .next --path-glob '.next/**' --invert-paths
```

## 4) Garbage collect and repack

```bash
git for-each-ref --format='delete %(refname)' refs/original/ | git update-ref --stdin
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

## 5) Force push rewritten history

```bash
# push current branch (e.g., main) and tags (if needed)
git push --force origin HEAD
# if you have multiple branches, push each (or push --all)
# git push --force --all origin
# git push --force --tags origin
```

Collaborators must re-clone or hard reset:

```bash
git fetch --all
git reset --hard origin/<branch>
```

## BFG Repo-Cleaner (alternative)

If you prefer BFG:

```bash
# Download BFG jar: https://rtyley.github.io/bfg-repo-cleaner/
java -jar bfg.jar --delete-folders node_modules --delete-files node_modules --no-blob-protection .

git reflog expire --expire=now --all
git gc --prune=now --aggressive

git push --force origin HEAD
```

## Verify

- `git log --stat` no longer shows `node_modules/`
- Repo size (`du -sh .git`) is significantly reduced

## Notes

- The application persists runtime data in `var/` (contracts and audit results). These should not be committed and are now ignored.
- OSS uploads are authoritative storage for files; local `var/storage/` is only for runtime cache/samples.
