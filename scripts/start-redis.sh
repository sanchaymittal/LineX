#!/bin/bash

# Start Redis using Docker Compose
echo "Starting LineX Redis..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Navigate to docker directory
cd "$(dirname "$0")/../docker" || exit 1

# Start Redis container
echo "📦 Starting Redis container..."
docker-compose up -d redis

# Wait for Redis to be healthy
echo "⏳ Waiting for Redis to be ready..."
timeout=60
counter=0

while [ $counter -lt $timeout ]; do
    if docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; then
        echo "✅ Redis is ready!"
        echo "🔗 Redis connection: redis://localhost:6379"
        exit 0
    fi
    
    counter=$((counter + 1))
    sleep 1
done

echo "❌ Redis failed to start within ${timeout} seconds"
docker-compose logs redis
exit 1