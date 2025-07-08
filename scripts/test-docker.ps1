# PowerShell script to run tests in Docker environment

Write-Host "🚀 Running Mini Orbital Launch Game Tests in Docker" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# Build and run tests
Write-Host "Building Docker image and running tests..." -ForegroundColor Yellow
docker-compose run --rm game-test

# Check exit code
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ All tests passed!" -ForegroundColor Green
} else {
    Write-Host "❌ Some tests failed!" -ForegroundColor Red
    exit 1
}