# Physical Atmosphere Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the neon-like atmospheric rim with a thin, sun-driven spherical-shell scattering approximation.

**Architecture:** Render a depth-tested 3D outer shell. Intersect each camera ray with the outer atmosphere and solid surface, then integrate low-sample exponential density only through the visible atmosphere segment.

**Tech Stack:** React, React Three Fiber, Three.js, GLSL, Vitest

---

### Task 1: Lock the physical-shell behavior

**Files:**
- Modify: `src/unifiedScene.test.ts`

1. Add a test requiring `sphereGeometry`, `raySphereIntersection`, `sampleDensity`, and `opticalDepth` in `Scene.tsx`.
2. Assert the atmosphere does not use `Billboard`, `ringGeometry`, or disabled depth testing.
3. Run `npm.cmd test -- --run src/unifiedScene.test.ts` and confirm the new test fails for the missing volumetric-shell terms.

### Task 2: Replace the atmosphere shader

**Files:**
- Modify: `src/Scene.tsx`

1. Add inner and outer world-radius values to the atmospheric shader.
2. Render a back-sided outer sphere with normal depth testing and no depth writes.
3. Intersect the view ray with both radii and integrate exponential density through the uncovered shell segment.
4. Apply thin Rayleigh scattering on the lit side, weak Mie forward scatter, a narrow warm terminator, and strong night-side fade.
5. Keep the visible atmosphere at `1.025` Earth radii and use 3 desktop / 2 mobile samples.
6. Run the focused test and confirm it passes.

### Task 3: Verify and publish

**Files:**
- Test: `src/unifiedScene.test.ts`

1. Run `npm.cmd test -- --run`.
2. Run `npm.cmd run build`.
3. Inspect the default and sunlit camera presets in the browser and confirm the frame-time target.
4. Commit only the atmosphere implementation, tests, and plan documents.
5. Fast-forward `main`, push, wait for GitHub Pages, and verify the deployed asset hash.
