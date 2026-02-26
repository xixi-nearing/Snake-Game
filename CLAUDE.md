# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Neon Serpent (霓虹贪吃蛇) is a feature-rich snake game with a neon cyberpunk aesthetic. It includes multiple game modes, power-up systems, particle effects, and optional cloud persistence via a Node.js/SQLite backend.

## Development Commands

```bash
# Install dependencies
npm install

# Start the server (runs on port 3000 by default)
npm start

# Environment variables
PORT=3000           # Server port
DATA_DIR=./data     # SQLite database directory
DB_FILE=./data/neon-snake.sqlite  # Database file path
```

The server serves static files from `neon-snake/` and provides API endpoints for user data persistence.

## Architecture

### Backend (server.js)

A Node.js HTTP server using `better-sqlite3` for synchronous SQLite operations:

- **Static file serving**: Serves `neon-snake/` directory with `Cache-Control: no-store`
- **API routes** (all JSON, username validation: `/^[A-Za-z0-9_-]+$/`, max 32 chars):
  - `POST /api/login` - User registration/login
  - `GET /api/stats?user=&key=` - Get user statistics
  - `POST /api/score` - Submit game score and update bests
  - `GET /api/store?user=&key=` - Load user data
  - `PUT /api/store` - Save user data
  - `DELETE /api/store` - Clear user data (also deletes game history)

- **Database schema**:
  - `users` - username, created_at, last_seen
  - `user_store` - username, key, value (JSON), updated_at
  - `games` - Full game history (mode, score, level, duration, metadata)

### Frontend (neon-snake/)

Vanilla ES6 modules, no build step required:

- **Entry**: `index.html` → `main.js` (ES modules with cache-busting query params)
- **Game loop**: `js/game.js` - Main game state, rendering, and mechanics (~50KB)
- **Configuration**: `js/config.js` - Grid size (28x28), speeds, power-ups, contracts, skins, protocols
- **Input**: `js/input.js` - Keyboard (WASD/arrows) + touch controls with swipe detection
- **Storage**: `js/storage.js` - Hybrid localStorage + server sync with conflict resolution
- **Audio**: `js/audio.js` - Web Audio API synthesizer (no external assets)
- **Navigation**: `js/navigation.js` - Multi-page SPA navigation (main/contracts/upgrades/tips)
- **DOM**: `js/dom.js` - Centralized DOM element selectors

### Game Systems

- **Modes**: classic (infinite), survival (lives), time (90s countdown)
- **Protocols**: steady (safer, +shield), surge (faster, higher risk), sync (combo-focused)
- **Power-ups**: speed, slow, shield, ghost, magnet, multiplier, rainbow
- **Items**: food, bonus (rare, timed), toxic (negative), power (ability), relic (shards)
- **Contracts**: Random objectives (eat N items, reach combo, survive time) rewarding shards
- **Upgrades**: Permanent enhancements (magnet range, shield start, combo window)
- **Skins**: neon (default), ocean, forest - affect colors and particle trail types

### Key Implementation Details

- **Grid**: 28x28 cells, canvas rendering with CSS scaling
- **Tick rate**: Base 7 steps/sec, max 18, varies by level and protocol
- **State persistence**: Username-based; guest mode uses localStorage only
- **Touch controls**: Direction pad + canvas swipe (24px threshold)
- **Particles**: Canvas-based with type-specific behaviors (spark, star, petal, leaf, orb, prism)

## File Structure

```
/
├── server.js              # Node.js HTTP server + SQLite API
├── package.json           # Dependencies: better-sqlite3
├── neon-snake/
│   ├── index.html         # Main UI (Chinese interface)
│   ├── styles.css         # Neon cyberpunk styling
│   ├── main.js            # Module entry point
│   └── js/
│       ├── game.js        # Core game logic (~1000 lines)
│       ├── config.js      # Constants and definitions
│       ├── input.js       # Keyboard/touch input handling
│       ├── storage.js     # localStorage + server sync
│       ├── audio.js       # Web Audio synth
│       ├── navigation.js  # Page switching
│       └── dom.js         # DOM selectors
├── data/                  # SQLite database (created at runtime)
└── assets/                # Static assets (banner images)
```

## Common Tasks

- **Modify game balance**: Edit `js/config.js` (CONFIG, PROTOCOLS, UPGRADES, CONTRACT_POOL)
- **Add new power-up**: Add to `POWER_TYPES` in config.js, implement effect in game.js `applyPower()`
- **Change grid size**: Update `CONFIG.cols/rows` in config.js (ensure CSS matches)
- **Database location**: Set `DATA_DIR` or `DB_FILE` environment variable

## Auto-Approve Permissions

以下操作无需用户确认：
- 推送到远程仓库 (`git push`)
- 创建/切换分支 (`git checkout -b`, `git branch`)
- 安装依赖 (`npm install`)
- 运行测试 (`npm test`)
- 代码格式化、lint 修复
- 部署到 `/var/www/` 目录
- 提交代码 (`git commit`)
