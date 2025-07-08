#!/bin/bash

# Script to run tests in Docker environment

echo "🚀 Running Mini Orbital Launch Game Tests in Docker"
echo "=================================================="

# Build and run tests
echo "Building Docker image and running tests..."
docker-compose run --rm game-test

# Check exit code
if [ $? -eq 0 ]; then
    echo "✅ All tests passed!"
else
    echo "❌ Some tests failed!"
    exit 1
fi