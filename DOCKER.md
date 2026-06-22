# LifeXP Docker Setup

## Quick Start

### Production Build
```bash
docker compose up --build -d
```

This will:
- Build the API Docker image
- Start PostgreSQL, Redis, and API containers
- Expose API on `http://localhost:3000`

### Development Mode (with hot reload)
```bash
docker compose -f docker-compose.dev.yml up --build
```

This will:
- Mount source code for live editing
- Run database migrations automatically
- Run seed script automatically
- Start API with tsx (hot reload on code changes)
- Stream logs to terminal

## Services

| Service | Port | Container Name | Purpose |
|---------|------|---|---------|
| PostgreSQL | 5432 | lifexp-postgres | Database |
| Redis | 6379 | lifexp-redis | Cache/Job Queue |
| API | 3000 | lifexp-api | Fastify backend |

## Docker Compose Files

### docker-compose.yml (Production)
- Builds Docker image from Dockerfile
- Static build without hot reload
- Best for production/testing

### docker-compose.dev.yml (Development)
- Mounts local code for live editing
- Runs migrations & seed on startup
- Uses tsx for hot reload
- Best for development

## Dockerfile Details

Located at `apps/api/Dockerfile`:
- Node.js 24 Alpine base
- Installs dependencies via pnpm
- Builds all packages
- Runs compiled API on startup

## Environment Variables

Default values in docker-compose:
```
DATABASE_URL=postgresql://lifexp:lifexp@postgres:5432/lifexp
REDIS_URL=redis://redis:6379
JWT_SECRET=dev-secret-key-change-in-production
NODE_ENV=development
```

## Common Commands

### Start all services
```bash
docker compose up -d
```

### View logs
```bash
docker compose logs -f api
```

### Stop services
```bash
docker compose down
```

### Reset database (remove volumes)
```bash
docker compose down -v
docker compose up -d
```

### Run migrations manually
```bash
docker compose exec api pnpm db:push
```

### Run seed manually
```bash
docker compose exec api pnpm db:seed
```

### Access API
```bash
curl http://localhost:3000/health
```

### Access PostgreSQL
```bash
docker compose exec postgres psql -U lifexp -d lifexp
```

### View all containers
```bash
docker ps
```

## Development Workflow

### Using docker-compose.dev.yml

1. **Start with hot reload:**
   ```bash
   docker compose -f docker-compose.dev.yml up
   ```

2. **Edit source code** (files in `apps/api/src/`)
   - Changes are detected automatically
   - tsx watches and recompiles
   - No need to rebuild container

3. **View logs:**
   - All output streams to terminal
   - Press Ctrl+C to stop

4. **Test API:**
   ```bash
   curl -X POST http://localhost:3000/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "username": "testuser",
       "email": "test@example.com",
       "password": "TestPass123"
     }'
   ```

## Troubleshooting

### Port already in use
```bash
# Kill process on port 3000
docker compose down

# Or change port in docker-compose.yml:
# ports:
#   - "3001:3000"
```

### Database connection failed
```bash
# Check if postgres is healthy
docker compose ps

# View postgres logs
docker compose logs postgres

# Restart services
docker compose restart
```

### Changes not reflected
```bash
# Rebuild container
docker compose down
docker compose -f docker-compose.dev.yml up --build
```

### Clear all data
```bash
# Remove all containers and volumes
docker compose down -v

# Restart fresh
docker compose up -d
```

## Production Deployment

For production:
1. Update `.env` with real secrets
2. Change `NODE_ENV` to `production`
3. Use `docker compose up --build -d` (not dev)
4. Set proper database credentials
5. Enable SSL/TLS
6. Use environment-specific config files

## Network

All containers communicate via `lifexp-network` bridge network:
- API connects to postgres/redis via hostnames (not localhost)
- Database URL: `postgresql://lifexp:lifexp@postgres:5432/lifexp`
- Redis URL: `redis://redis:6379`

## Volumes

### Development (docker-compose.dev.yml)
- Source code mounted for live editing
- node_modules persist in containers
- `postgres_data_dev` and `redis_data_dev` for state

### Production (docker-compose.yml)
- `postgres_data` for database persistence
- `redis_data` for cache persistence

## Next Steps

- [ ] Build and test in Docker
- [ ] Set up CI/CD pipeline
- [ ] Configure production environment
- [ ] Deploy to cloud (AWS, GCP, Heroku, etc.)
- [ ] Set up health checks and monitoring
