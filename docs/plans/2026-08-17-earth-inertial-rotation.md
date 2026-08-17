# Earth Inertial Rotation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Render Earth as a physically rotating body in an inertial scene while preserving Astronomy Engine day/night accuracy.

**Architecture:** Add pure Earth-orientation helpers for sidereal spin, obliquity, and inertial sunlight. Drive the Earth surface and shared scene light every render frame from interpolated simulation UTC; keep camera, stars, and orbital geometry inertial.

**Tech Stack:** TypeScript, React Three Fiber, Three.js, Astronomy Engine, Vitest.

---

### Task 1: Earth orientation math

**Files:**
- Create: `src/earthOrientation.ts`
- Create: `src/earthOrientation.test.ts`

1. Write failing tests for J2000 sidereal angle, axial tilt, one-sidereal-day repetition, and preservation of the Earth-fixed solar dot product after the inertial transform.
2. Run `npm.cmd test -- src/earthOrientation.test.ts` and confirm failure because the module does not exist.
3. Implement `earthRotationAngleRad`, `EARTH_AXIAL_TILT_RAD`, `earthLocalToInertial`, and `getEarthInertialSunDirection` with no Three.js dependency.
4. Run the focused test and confirm it passes.
5. Commit the math and tests.

### Task 2: Render-frame Earth rotation

**Files:**
- Modify: `src/Scene.tsx`
- Modify: `src/unifiedScene.test.ts`

1. Write a failing boundary test requiring `EarthGlobe` to accept `utcMs`, `paused`, and `rate`, use `frameSimulationUtcMs`, rotate an Earth surface group, and use inertial sunlight.
2. Run the focused test and confirm the missing integration fails.
3. Add a shared per-frame astronomical light vector, rotate only Earth-attached visual layers, and make the sun-direction marker follow the shared vector.
4. Thread time props through orbit and flight Earth render paths.
5. Run focused and full tests; commit the integration.

### Task 3: Production verification

**Files:**
- Modify: `README.md`

1. Document inertial camera behavior, sidereal rotation, axial tilt, and pause/reverse/rate behavior.
2. Run `npm.cmd test`, `npm.cmd run build`, and `git diff --check`.
3. Open the production preview, confirm one canvas and no console errors, then compare two high-rate frames to verify visible continent movement.
4. Commit documentation and prepare the branch for integration.
