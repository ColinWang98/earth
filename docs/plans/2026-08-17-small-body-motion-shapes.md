# Small-Body Motion and Shapes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Render seven curated small bodies with continuous accelerated orbits, visible spin axes, and a NASA/procedural hybrid of irregular shapes.

**Architecture:** Extend the build-time JPL snapshot with physical presentation metadata, then use a frame-interpolated simulation clock inside a dedicated small-body renderer. Load four localized NASA GLBs only for selected targets and use deterministic procedural rocks as the lightweight fallback and for the remaining targets.

**Tech Stack:** React 19, TypeScript, React Three Fiber, Three.js, Astronomy Engine, Vitest, NASA GLB assets, JPL SBDB.

---

### Task 1: Enrich the small-body snapshot

**Files:**
- Modify: `scripts/small-body-lib.mjs`
- Modify: `scripts/build-small-bodies.mjs`
- Modify: `scripts/small-body-lib.test.mjs`
- Modify: `src/data/small-bodies.json`
- Modify: `src/smallBodies.ts`
- Test: `src/smallBodies.test.ts`

**Step 1:** Add failing parser and catalogue tests for `rotationPeriodHours`, pole coordinates, axis-source flags, model keys, and non-spherical axis ratios.

**Step 2:** Run `npm.cmd test -- scripts/small-body-lib.test.mjs src/smallBodies.test.ts` and confirm the new assertions fail because the fields are absent.

**Step 3:** Request `phys-par=true`, parse JPL physical parameters, add explicit illustrative fallbacks where JPL is incomplete, and regenerate the deterministic snapshot.

**Step 4:** Re-run the focused tests and confirm they pass.

**Step 5:** Commit with `git commit -m "feat: add small-body spin metadata"`.

### Task 2: Add a continuous render clock and spin math

**Files:**
- Create: `src/smallBodyMotion.ts`
- Create: `src/smallBodyMotion.test.ts`

**Step 1:** Write failing tests for interpolated forward, paused, and reverse simulation time; normalized pole vectors; and deterministic spin angles.

**Step 2:** Run `npm.cmd test -- src/smallBodyMotion.test.ts` and confirm failure because the module does not exist.

**Step 3:** Implement small pure functions for frame time, J2000 pole conversion to Three.js coordinates, and spin phase.

**Step 4:** Re-run the focused tests and confirm they pass.

**Step 5:** Commit with `git commit -m "feat: add continuous small-body motion math"`.

### Task 3: Localize NASA shape assets

**Files:**
- Create: `public/assets/small-bodies/ceres.glb`
- Create: `public/assets/small-bodies/vesta.glb`
- Create: `public/assets/small-bodies/eros.glb`
- Create: `public/assets/small-bodies/bennu.glb`
- Create: `public/assets/small-bodies/sources.json`
- Create: `scripts/optimize-small-body-models.mjs`
- Test: `src/smallBodies.test.ts`

**Step 1:** Add failing manifest tests requiring four local NASA assets, official source URLs, credits, and lazy-load model paths.

**Step 2:** Download the four official NASA GLBs and run an offline simplification step suitable for Quest; keep the source manifest but not duplicate raw files.

**Step 3:** Verify each GLB exists, has nonzero size, and the combined optimized size stays below the documented budget.

**Step 4:** Re-run focused tests and commit with `git commit -m "feat: localize NASA small-body shapes"`.

### Task 4: Replace generic markers with dedicated spinning rocks

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/Scene.tsx`
- Modify: `src/unifiedScene.test.ts`
- Test: `src/smallBodyMotion.test.ts`

**Step 1:** Add failing architecture assertions that `SmallBodyVisual` exists, selected small bodies use the NASA model map, procedural rocks use deterministic deformation, and `SmallBodies` receives `paused` and `rate`.

**Step 2:** Run the focused tests and verify the expected failures.

**Step 3:** Implement the dedicated small-body group. In `useFrame`, interpolate simulation time, propagate its orbit, update world position, orient the spin pole, and rotate the irregular visual. Keep cached orbit geometry and current labels/hit targets.

**Step 4:** Route selected real-shape targets through lazy `useGLTF`; use a procedural fallback for unselected and unsupported targets. Ensure no small body enters `TexturedPlanet`.

**Step 5:** Run focused tests and commit with `git commit -m "feat: animate irregular small bodies"`.

### Task 5: Surface data provenance and verify

**Files:**
- Modify: `src/App.tsx`
- Modify: `README.md`
- Modify: `src/unifiedScene.test.ts`

**Step 1:** Add failing tests for rotation period, axis-source wording, and NASA shape attribution in object details/documentation.

**Step 2:** Implement concise detail rows and documentation without changing unrelated controls.

**Step 3:** Run `npm.cmd test`, `npm.cmd run build`, and `git diff --check`.

**Step 4:** Verify accelerated positions with a fixed-time regression and inspect the four asset URLs in the production output.

**Step 5:** Commit with `git commit -m "docs: describe small-body shape sources"`.

