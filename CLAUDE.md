# CLAUDE.md — Remix Plus

Remix Plus is a port of NVIDIA's `dxvk-remix` that lets **modern games run through the Remix
SDK API**. It derives from the gmod-rtx community fork and carries API surface, capture /
replacement, hw-skinning, tonemap and atmosphere work. It is not engine-specific; Unity is one
integration path among several.

This repository is Joe's fork (`Sladds98/dxvk-remix`) of the canonical
[`RemixProjGroup/dxvk-remix`](https://github.com/RemixProjGroup/dxvk-remix). Contributor docs
live in `docs/`: the contribution flow and fork discipline in
[`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md), and the inventory of every upstream file the fork
touches in [`docs/fork-touchpoints.md`](docs/fork-touchpoints.md).

NVIDIA's upstream agent guide (coding standards, meson registration of new files, RTX option
conventions, shader layout) applies here too: @AGENTS.md

## Branches and pull requests

- `main` changes only by merging a pull request. Start each piece of work on a branch cut from
  `main` (`git switch -c <name> origin/main`), push that branch, and open a PR into `main`. The PR
  is where the Windows build runs and where Joe reviews, so nothing reaches `main` unbuilt.
- Keep published history append-only: no force push (including `--force-with-lease`), no rebase
  or amend of pushed commits. Bring a base branch in with a merge. Other people pull these
  branches, and a rewrite breaks their checkouts.
- `.githooks/pre-push` refuses pushes to `main` and pushes that would not fast-forward, and
  GitHub's branch rules enforce the same on the server. Enable the repo hooks once per clone:
  `git config core.hooksPath .githooks`. Leave hooks on (no `--no-verify`) unless Joe asks.
- Other branch lines have their own base. `gta4-atmos-dlss5` is Kim2091's DLSS 5 / GTA IV line
  (Neural Uplift lives there); it is hundreds of commits apart from `main`, so work meant for it
  branches from it and its PR targets it.
- Ask before pushing to a remote other people pull from: canonical `RemixProjGroup/dxvk-remix`
  and `kim2091/dxvk-remix`.
- Branch names are free-form. The maintainer's own convention is `unity-workstream/<NN>-<name>`.
- Fill in `.github/PULL_REQUEST_TEMPLATE.md`; keep each PR to one change.

## Attribution

- Commits, PR titles and descriptions, review comments, code and docs carry no Claude
  attribution: no co-author trailer, no generated-by footer, no claude.ai session link. Commits
  in this fork are authored as `Joe Sladden <joe-sladden@hotmail.co.uk>`. (Joe's rule, 29 Sep
  2026.)
- Three layers enforce it: the `attribution` block in `.claude/settings.json`, the
  `.githooks/commit-msg` hook that strips trailers, and the `Attribution guard` workflow
  (`scripts/attribution-check.mjs`).
- The GitHub integration appends a footer to PR descriptions on GitHub's side. After opening or
  editing a PR, re-read its description and remove the footer.
- Existing history stays as it is, including upstream contributors' commits that credit Claude.
  The guard reports those as notices and holds only Joe's commits to the rule.

## Fork discipline for upstream files

The fork minimises rebase cost against upstream NVIDIA `dxvk-remix`; `docs/CONTRIBUTING.md` has
the full pattern.

- Prefer a hook over an inline edit: put fork logic in a fork-owned
  `src/dxvk/rtx_render/rtx_fork_<subsystem>.cpp/h` and leave a one-line `fork_hooks::…` call in the
  upstream file.
- Inline edits are fine when small (under ~20 lines) and structurally impossible as a hook, such
  as a struct field or an enum bit.
- A commit that touches an upstream file also updates `docs/fork-touchpoints.md` in the same
  commit; the PR template checks for it. Run `scripts/audit-fork-touchpoints.sh` before
  committing upstream edits.
- Leave `submodules/` and `external/` alone; they are third-party pins.

## API surface and generated docs

- The Remix C API is the integration contract for plugins and hosts, so an API change ships with
  its doc updates in the same commit. The detailed list of files and docs is in
  `.claude/rules/api-surface.md`, which loads when you work on API files.
- `RtxOptions.md` is generated: run Remix with `DXVK_DOCUMENTATION_WRITE_RTX_OPTIONS_MD=1` after
  adding an `RTX_OPTION`, and commit the result. Where Remix cannot run (a Linux cloud session),
  hand-add the row in the same format and say "regenerate in-app" in the commit message.
- `RemixApiSurface.md` is generated from `public/include/remix/remix_c.h` by
  `scripts-common/generate_remix_api_md.py`; regenerate with `scripts/regen-docs.ps1` rather than
  editing it.

## Building and verifying

- On Windows, build with the project skills: `rtx-build` for the runtime (64-bit `d3d9.dll`),
  `bridge-build` for the bridge (32-bit client + 64-bit server). Ship only on exit code 0 with zero
  compile errors.
- A Linux cloud session cannot build this project. Open the PR and treat the `Build` workflow as
  the compile check; its artifacts (`rtx-remix-for-x86-games-<run>-<sha>-<flavour>`) are what gets
  installed for testing.
- A task is done when the build is green, not when the code is written.

## Working with Joe

- Explain in plain language and back claims with evidence (log lines, CI output, code
  references) rather than guesses. Say plainly when something failed or was skipped.
- Do what the task asks. Suggest adjacent features, refactors or cleanups separately rather than
  folding them into the change.
- Game-side steps (installing builds, editing game configs, reading game logs) happen on Joe's PC
  through his Cowork session. Hand those over as a clear, copy-pasteable block rather than asking
  Joe to do them by hand.

## Gmod reference repo

The upstream gmod-rtx community fork is a read-only source for porting features. `origin/unity`
is the port's baseline (Remix API, capture, hw-skinning and atmosphere work);
`origin/gmod-ex` is Garry's Mod–specific and usually out of scope. Read from it only; it takes
no commits or pushes from here.
