# LifeXP Setup Guide

## Prerequisites

- Node.js 18+ and pnpm
- Docker & Docker Compose
- PostgreSQL 16 (via Docker)
- Redis 7 (via Docker)

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Start Services

Start PostgreSQL and Redis:

```bash
docker compose up -d
```

Verify they're running:

```bash
docker ps
```

### 3. Setup Database

Run migrations and seed:

```bash
cd apps/api
pnpm db:push      # Create all tables from schema
pnpm db:seed      # Populate seed data
```

### 4. Start API Server

```bash
cd apps/api
pnpm dev
```

The API will start on `http://localhost:3000`

Check health: `curl http://localhost:3000/health`

## Project Structure

```
lifexp/
├── apps/
│   ├── api/          # Fastify + PostgreSQL backend
│   ├── web/          # React + Vite PWA (upcoming)
│   └── mobile/       # Expo React Native (upcoming)
├── packages/
│   ├── types/        # Shared TypeScript interfaces
│   ├── xp-engine/    # Pure XP computation functions
│   └── api-client/   # Typed fetch wrapper (upcoming)
└── docker-compose.yml
```

## API Endpoints (Implemented)

### Auth
- `POST /auth/register` - Create new account
- `POST /auth/login` - Login with email/password
- `POST /auth/refresh` - Get new access token
- `POST /auth/logout/:tokenId` - Logout

### Logs
- `POST /logs` - Log activity (requires auth)
- `GET /logs` - Get user's recent logs (requires auth)

## Development

### Build all packages
```bash
pnpm build
```

### Run tests (XP engine)
```bash
cd packages/xp-engine
pnpm test
```

### Watch mode
```bash
pnpm dev
```

## Testing the API

### Register a user
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "athlete1",
    "email": "user@example.com",
    "password": "SecurePass123"
  }'
```

### Login
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123"
  }'
```

### Log an activity
```bash
curl -X POST http://localhost:3000/logs \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "activitySlug": "running",
    "value": 5,
    "intensityInputs": {
      "pace_min_per_km": 6
    }
  }'
```

## Environment Variables

Copy `.env.example` to `.env` and update as needed:

```env
DATABASE_URL=postgresql://lifexp:lifexp@localhost:5432/lifexp
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_jwt_secret_key_here_change_in_production
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_test_your_key_here
NODE_ENV=development
PORT=3000
```

## Database Schema

Seed data includes:
- 4 sections: Fitness, Wellness, Learning, Productivity
- 10 activities: running, cycling, swimming, workout, walking, meditation, sleep, reading, focus_session, deep_work
- 5 streak bonus tiers (3→2%, 7→5%, 30→10%, 90→15%, 365→25%)
- XP multiplier caps (perk_stack→2.0, intensity→1.5, streak→1.25, total→3.0)
- 5 sample perks for testing

## Architecture Notes

### XP Computation Pipeline (5 Layers)
1. Base XP: value × effort_minutes_per_unit
2. Intensity: scored 0-100, mapped to multiplier
3. Perk Multipliers: additive stacking, capped
4. Streak Bonus: tier lookup, capped
5. Daily XP Cap: enforced after all multipliers

### Personal Bests
- Per-activity, per-input-key
- `vs_personal_best` flag: if true, beating your own PB gives score=100 regardless of absolute value
- Enables fair progression for all fitness levels

### Activity Logging
- Single DB transaction with 19 steps (spec)
- Updates: activity/section/hero XP, streaks, personal bests
- Handles level-ups, perk choices, shared goals, events
- All XP breakdown stored in activity_log for retroactive analysis

## Troubleshooting

### Database connection failed
```bash
# Check if Docker services are running
docker ps

# Check logs
docker logs lifexp-postgres-1
docker logs lifexp-redis-1

# Restart services
docker compose restart
```

### Port already in use
Change `PORT` in `.env` if 3000 is taken

### JWT token issues
Make sure `JWT_SECRET` is set in `.env` (different from default in production)
