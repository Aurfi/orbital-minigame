@echo off
REM Orbital Launch Game - Initial Setup Script for Windows

echo 🚀 Setting up Orbital Launch Game development environment...

REM Check if Docker is running
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not running. Please start Docker and try again.
    exit /b 1
)

REM Check if docker-compose is available
docker-compose --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ docker-compose is not installed. Please install Docker Compose and try again.
    exit /b 1
)

echo 📦 Building Docker image (this may take a few minutes on first run)...
docker-compose build game-base

if %errorlevel% equ 0 (
    echo ✅ Setup complete!
    echo.
    echo 🎮 Ready to develop! Use these commands:
    echo   Development server: docker-compose up game-dev
    echo   Run tests:         docker-compose run --rm game-test
    echo   Watch tests:       docker-compose run --rm game-test-watch
    echo.
    echo 🌐 Game will be available at: http://localhost:9876
) else (
    echo ❌ Setup failed. Please check the error messages above.
    exit /b 1
)