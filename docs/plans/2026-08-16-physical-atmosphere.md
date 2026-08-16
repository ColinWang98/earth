# Physical Atmosphere Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the neon-like atmospheric rim with a thin, sun-driven spherical-shell scattering approximation.

**Architecture:** Replace the transparent full-sphere shell with a camera-facing narrow ring. Correct its apparent radii for perspective, then use tangent path length, exponential density, optical depth, and narrow day/terminator masks.

**Tech Stack:** React, React Three Fiber, Three.js, GLSL, Vitest

---

### Task 1: Lock the physical-shell behavior

**Files:**
- Modify: `src/unifiedScene.test.ts`

1. Add a test requiring `Billboard`, `ringGeometry`, `tangentPathLength`, and `opticalDepth` in `Scene.tsx`.
2. Assert the atmosphere no longer uses a full `sphereGeometry` shell.
3. Run `npm.cmd test -- --run src/unifiedScene.test.ts` and confirm the new test fails for the missing thin-ring terms.

### Task 2: Replace the atmosphere shader

**Files:**
- Modify: `src/Scene.tsx`

1. Add inner, outer, and perspective-corrected radius uniforms.
2. Render only the atmospheric annulus as a camera-facing ring.
3. Convert normalized height and tangent path length to exponential optical depth.
4. Apply thin Rayleigh scattering on the lit side, weak Mie forward scatter, a narrow warm terminator, and strong night-side fade.
5. Keep the visible atmosphere at `1.018` Earth radii.
6. Run the focused test and confirm it passes.

### Task 3: Verify and publish

**Files:**
- Test: `src/unifiedScene.test.ts`

1. Run `npm.cmd test -- --run`.
2. Run `npm.cmd run build`.
3. Inspect the default and sunlit camera presets in the browser and confirm the frame-time target.
4. Commit only the atmosphere implementation, tests, and plan documents.
5. Fast-forward `main`, push, wait for GitHub Pages, and verify the deployed asset hash.
