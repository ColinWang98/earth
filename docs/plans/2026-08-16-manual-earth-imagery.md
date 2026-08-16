# Manual Earth Imagery Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Render a bundled NASA VIIRS observation immediately and fetch newer NASA imagery only after an explicit user action.

**Architecture:** Keep the existing NASA loading pipeline inside `Scene.tsx`, but gate it with an immutable request object created by `App.tsx`. Preload a dated NASA snapshot in HTML, retain Blue Marble only for polar gap filling, and expose loading state through `EarthObservationStatus` so the refresh button cannot issue duplicate requests.

**Tech Stack:** React 19, React Three Fiber, Three.js, TypeScript, Vitest, Vite.

---

### Task 1: Specify manual-only loading

**Files:**
- Modify: `src/unifiedScene.test.ts`
- Modify: `src/earthImagery.test.ts`

1. Add a failing boundary test requiring a preloaded NASA VIIRS snapshot, an explicit refresh button, and an imagery request passed from `App` to `Scene`.
2. Add a failing test for a small pure helper that snapshots the selected UTC time into a monotonically increasing request.
3. Run `npm.cmd test -- unifiedScene earthImagery` and confirm the failures describe the missing behavior.

### Task 2: Add the request state and button

**Files:**
- Modify: `src/earthImagery.ts`
- Modify: `src/App.tsx`
- Modify: `src/Scene.tsx`
- Modify: `index.html`
- Modify: `src/styles.css`

1. Implement the request helper with the smallest state shape: request id plus UTC milliseconds.
2. Initialize the status as the dated, bundled NASA VIIRS 4K snapshot and add a loading flag.
3. Add “更新卫星影像” to the time panel; while loading, disable it and show “正在更新…”.
4. Pass the request to `Scene` and gate `useEarthObservationTexture`; without a request, report and retain the bundled NASA snapshot.
5. Add the NASA snapshot preload tag and only the CSS needed for the disabled button state.
6. Run the focused tests and confirm they pass.

### Task 3: Documentation and verification

**Files:**
- Modify: `README.md`

1. Document manual refresh behavior and the researched Fengyun WMS option.
2. Run `npm.cmd test` and `npm.cmd run build`.
3. Start the local site and verify initial status, refresh button behavior, and absence of console errors.
4. Review `git diff --check` and commit only the intended files.
