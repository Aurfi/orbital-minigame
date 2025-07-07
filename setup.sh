#!/bin/bash

# Orbital Launch Game - Initial Setup Script
echo "🚀 Setting up Orbital Launch Game development environment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose is not installed. Please install Docker Compose and try again."
    exit 1
fi

echo "📦 Building Docker image (this may take a few minutes on first run)..."
docker-compose build game-base

if [ $? -eq 0 ]; then
    echo "✅ Setup complete!"
    echo ""
    echo "🎮 Ready to develop! Use these commands:"
    echo "  Development server: docker-compose up game-dev"
    echo "  Run tests:         docker-compose run --rm game-test"
    echo "  Watch tests:       docker-compose run --rm game-test-watch"
    echo ""
    echo "🌐 Game will be available at: http://localhost:9876"
else
    echo "❌ Setup failed. Please check the error messages above."
    exit 1
fi