# Mobile and Starfield Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the HYG starfield visibly magnitude-aware and deliver a smaller, usable mobile experience without changing desktop navigation.

**Architecture:** Generate per-star size/opacity attributes for a soft circular GPU point shader. Select bundled Earth textures by the existing device quality tier, and expose a separate CSS-responsive mobile toolbar with collapsed object details.

**Tech Stack:** TypeScript, React Three Fiber, Three.js shaders, CSS media queries, Sharp-generated static images, Vitest.

---

### Task 1: Magnitude-aware star rendering

**Files:**
- Create: `src/starAppearance.ts`
- Create: `src/starAppearance.test.ts`
- Modify: `src/Scene.tsx`

1. Write failing tests for magnitude ordering and desktop/mobile size bounds.
2. Run `npm.cmd test -- src/starAppearance.test.ts` and confirm the module is missing.
3. Implement the minimal pure appearance function.
4. Add size/opacity geometry attributes and a soft circular shader to `StarCatalog`.
5. Run focused tests and commit.

### Task 2: Mobile 2K assets

**Files:**
- Create: `public/assets/earth-nasa-viirs-2026-08-15-2k.jpg`
- Create: `public/assets/earth-blue-marble-2k.jpg`
- Create: `public/assets/earth-night-2k.jpg`
- Create: `public/assets/earth-specular-1k.jpg`
- Modify: `index.html`
- Modify: `src/Scene.tsx`
- Modify: `src/unifiedScene.test.ts`

1. Write a failing architecture test requiring responsive 2K URLs and preloads.
2. Run the focused test and confirm failure.
3. Generate deterministic downscaled assets with Sharp.
4. Select URLs from `quality` and add mutually exclusive desktop/mobile preload media queries.
5. Run focused tests, inspect file dimensions/sizes, and commit.

### Task 3: Compact mobile controls

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Modify: `src/unifiedScene.test.ts`

1. Write a failing architecture test for the mobile toolbar and collapsible details.
2. Run the focused test and confirm failure.
3. Add preset cycling, label/small-body/detail actions, and a close control.
4. Add responsive grid/toolbar/bottom-sheet CSS while leaving desktop rules intact.
5. Run focused and full tests; commit.

### Task 4: Visual and production verification

**Files:**
- Modify: `README.md`

1. Document magnitude-aware stars, mobile 2K resources, and the mobile toolbar.
2. Run `npm.cmd test`, `npm.cmd run build`, and `git diff --check`.
3. Verify the production preview at desktop and 390×844 mobile viewports, including stars, controls, collapsed/expanded details, overflow, and console errors.
4. Commit documentation and prepare the branch for integration.
