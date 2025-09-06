# Mini Orbital Launch Game

Educational web-based rocket simulation game that teaches programming concepts and orbital mechanics.

## 🐳 Docker Development Setup

### Prerequisites
- Docker and Docker Compose installed

### Quick Start

**First time setup (choose one):**

**Option 1: Automated setup (recommended)**
```bash
# Linux/Mac
./setup.sh

# Windows
setup.bat
```

**Option 2: Manual setup**
```bash
docker-compose build game-base
```

**Daily development commands:**

1. **Development server (ALWAYS use this):**
   ```bash
   docker-compose up game-dev
   ```
   Game will be available at http://localhost:9876

2. **Run tests (ALWAYS use this):**
   ```bash
   docker-compose run --rm game-test
   ```

3. **Watch tests during development:**
   ```bash
   docker-compose run --rm game-test-watch
   ```

4. **Build the project:**
   ```bash
   docker-compose run --rm game-dev npm run build
   ```

5. **Code formatting and linting:**
   ```bash
   docker-compose run --rm game-dev npm run format
   docker-compose run --rm game-dev npm run lint
   ```

### Development Workflow

- **One-time setup**: Build the base image with `docker-compose build game-base`
- **Daily development**: Use `docker-compose up game-dev` for development server
- **Fast testing**: Use `docker-compose run --rm game-test` for quick test runs
- The development server runs with hot reload
- Source code is mounted as a volume for instant updates
- Node modules are cached in a Docker volume for faster rebuilds
- All dependencies are managed within the container
- **No rebuilding needed** unless package.json changes

### Rebuilding (only when needed)

Only rebuild the Docker image when:
- package.json dependencies change
- Dockerfile is modified
- You want to update the base Node.js version

```bash
docker-compose build game-base --no-cache  # Force rebuild if needed
```

### ❌ DO NOT RUN LOCALLY

**Never run these commands directly on your host machine:**
- ❌ `npm test` 
- ❌ `npm run dev`
- ❌ `npm run build`
- ❌ `vitest`

**Always use the Docker equivalents above instead.**

## Project Structure

```
src/
├── core/          # Core game engine and interfaces
├── physics/       # Physics simulation and orbital mechanics
├── rendering/     # Canvas rendering and graphics
└── ui/           # User interface and HUD elements

```
