# Plan: Neon Snake (Rich Gameplay)

**Generated**: 2026-02-24
**Estimated Complexity**: High

## Overview
Build a pure-frontend neon-themed Snake game with multiple modes, varied items, hazards, portals, level progression, audio, and persistent data. The project is a static HTML/CSS/JS app with a responsive layout and a modular game engine.

## Prerequisites
- Modern browser with Canvas and Web Audio support
- No build tools or external dependencies
- Optional: local static server for testing

## Sprint 1: Core Game Loop + UI Skeleton
**Goal**: Playable snake with movement, growth, scoring, collisions, and a basic UI scaffold.
**Demo/Validation**:
- Open `neon-snake/index.html`
- Start game, move snake with arrow keys/WASD, eat food, score increases, game over on collision

### Task 1.1: Project scaffold
- **Location**: `neon-snake/index.html`, `neon-snake/styles.css`, `neon-snake/main.js`
- **Description**: Create base HTML layout (header, canvas, panels, controls) and wire CSS/JS.
- **Dependencies**: None
- **Acceptance Criteria**:
  - Static page loads without errors
  - Canvas is visible and centered
- **Validation**:
  - Open in browser, no console errors

### Task 1.2: Core engine
- **Location**: `neon-snake/main.js`
- **Description**: Implement grid, snake movement, direction queue, food spawn, collision detection, score.
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - Snake moves at fixed speed
  - Eating food grows snake and increases score
  - Game ends on wall/self collision
- **Validation**:
  - Play and confirm behaviors

## Sprint 2: Rich Gameplay Systems
**Goal**: Multiple modes, power-ups, hazards, portals, and level progression.
**Demo/Validation**:
- Toggle modes and observe rule changes (time, lives)
- Power-ups visibly activate with timers

### Task 2.1: Modes + rules
- **Location**: `neon-snake/main.js`, `neon-snake/index.html`
- **Description**: Add Classic/Survival/Time Attack modes with rule variations (lives/time limit).
- **Dependencies**: Task 1.2
- **Acceptance Criteria**:
  - Mode switch affects HUD and win/lose conditions
- **Validation**:
  - Start each mode and verify rule set

### Task 2.2: Items + power-ups
- **Location**: `neon-snake/main.js`
- **Description**: Add multiple food types and power-ups with durations (speed, slow, shield, ghost, magnet, score multiplier).
- **Dependencies**: Task 1.2
- **Acceptance Criteria**:
  - Items spawn, are collected, and apply effects
  - Active effects show countdowns
- **Validation**:
  - Collect each item type and observe effect

### Task 2.3: Hazards + portals
- **Location**: `neon-snake/main.js`
- **Description**: Add static obstacles, moving hazards, and paired portals.
- **Dependencies**: Task 1.2
- **Acceptance Criteria**:
  - Hazards collide as expected
  - Portals teleport the snake
- **Validation**:
  - Force collisions and teleportation

### Task 2.4: Level progression
- **Location**: `neon-snake/main.js`
- **Description**: Score-based levels that increase speed, obstacles, and spawn intensity.
- **Dependencies**: Task 2.1, Task 2.2, Task 2.3
- **Acceptance Criteria**:
  - Level increases at score thresholds
  - Difficulty ramps perceptibly
- **Validation**:
  - Reach multiple levels in one session

## Sprint 3: Neon Visuals + Audio + Persistence
**Goal**: High-quality neon UI, sound effects, and localStorage persistence.
**Demo/Validation**:
- UI feels neon, polished, responsive
- Audio plays on events
- High score persists after reload

### Task 3.1: Visual design system
- **Location**: `neon-snake/styles.css`, `neon-snake/index.html`
- **Description**: Implement neon theme, glow effects, typography, and animated accents; make layout responsive.
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - Distinct neon aesthetic
  - Layout adapts to mobile/tablet/desktop
- **Validation**:
  - Resize viewport; no overlap or overflow

### Task 3.2: Audio engine
- **Location**: `neon-snake/main.js`
- **Description**: Implement Web Audio-based SFX (eat, power-up, hit, level up) with toggle.
- **Dependencies**: Task 1.2
- **Acceptance Criteria**:
  - Sounds trigger only after user gesture
  - Toggle persists
- **Validation**:
  - Start game, hear SFX, toggle sound off/on

### Task 3.3: Persistence
- **Location**: `neon-snake/main.js`
- **Description**: Save high scores by mode, settings, and unlocked level in localStorage.
- **Dependencies**: Task 2.4
- **Acceptance Criteria**:
  - Reload preserves scores and settings
- **Validation**:
  - Refresh page and verify values

## Sprint 4: Testing + Balance Pass
**Goal**: Validate gameplay balance, responsiveness, and stability.
**Demo/Validation**:
- Play 10+ minutes without crashes
- No visual glitches on key breakpoints

### Task 4.1: Manual QA checklist
- **Location**: `neon-snake/main.js`, `neon-snake/styles.css`
- **Description**: Verify collisions, power-up stacking, portal edge cases, and performance.
- **Dependencies**: Sprint 1-3
- **Acceptance Criteria**:
  - No soft-locks or invalid spawns
- **Validation**:
  - Manual test at 375px/768px/1024px/1440px

## Testing Strategy
- Manual playtesting per sprint
- Console error check
- Responsive layout checks at 375, 768, 1024, 1440 widths

## Potential Risks & Gotchas
- Web Audio blocked until user gesture (mitigate by lazy init on Start)
- Item spawns overlapping snake/obstacles (ensure valid spawn search)
- High speed causing missed collisions (use fixed step updates)
- Mobile canvas scaling issues (handle DPR on resize)

## Rollback Plan
- Delete `neon-snake/` and the plan file
