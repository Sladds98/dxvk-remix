---
paths:
  - "public/include/remix/**"
  - "public/include/remixapi/**"
  - "src/dxvk/rtx_render/rtx_remix_api*"
  - "src/dxvk/rtx_render/rtx_fork_*"
  - "bridge/src/**/remix_api*"
  - "bridge/src/util/util_remixapi*"
  - "docs/Remix*.md"
---

# Remix API surface: keep the docs in step

The Remix C API is the integration contract for plugins and host applications, and integrators
read the docs rather than the code, so a change to the surface and its doc updates land in the
same commit. Reviewers reject API changes without them.

## What counts as the API surface

- The C header `public/include/remix/remix_c.h`: every function-pointer typedef, `remixapi_*`
  struct, enum and handle, and every macro a consumer compiles against.
- The C++ wrapper `public/include/remix/remix.h`, the RAII / type-safe layer over the same surface.
- String-keyed conventions on top of the API:
  - `__<ns>.*` keys read through `SetGameValue` / `GetGameValue` (the GameStateStore convention
    used by fork-side subsystems).
  - `rtx.<ns>.*` option namespaces declared by fork-side `rtx_fork_*` modules as plugin-tuning
    surfaces (for example `rtx.weather.preset.*`). Internal `rtx.*` knobs are published through
    `RtxOptions.md` and need no separate doc work.

## Which docs to update

- `docs/RemixApi.md`, the hub reference: when adding, removing or renaming fields on
  `remixapi_Interface`, changing function signatures, adding `*EXT` structs, error codes, or new
  format / category enum values.
- `docs/RemixApiChangelog.md`: a dated entry for every surface change, under `Added`, `Changed`,
  `Fixed` or `Removed`.
- `docs/RemixSDK.md`: only when the high-level setup or mental model changes.
- A spoke page for each new `__<ns>.*` convention or fork-side `rtx.<ns>.*` namespace: add
  `docs/Remix<Ns>API.md` (use `docs/RemixSkyAPI.md` as the template) and a row in the
  [Convention namespaces](../../docs/RemixApi.md#convention-namespaces) table.
- `RemixApiSurface.md` is generated from `remix_c.h` by `scripts-common/generate_remix_api_md.py`;
  regenerate it with `scripts/regen-docs.ps1` instead of editing it.

The audit script does not check any of this, so it rests on the author and the reviewer.
