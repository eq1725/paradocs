#!/bin/bash
# ParaDocs Bulk Ingestion Script
# Run this from your local machine with proper credentials

set -e

echo "======================================"
echo "  ParaDocs Bulk Ingestion Runner"
echo "======================================"
echo ""

# Check for required environment variables
if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "❌ SUPABASE_SERVICE_ROLE_KEY is not set"
    echo ""
    echo "Please set it first:"
    echo "  export SUPABASE_SERVICE_ROLE_KEY='your_key_here'"
    echo ""
    exit 1
fi

# Configuration
API_BASE="${API_BASE:-https://discoverparadocs.com}"
ARCTIC_SHIFT_API="https://arctic-shift.photon-reddit.com/api/posts/search"

# Subreddits to import
SUBREDDITS=(
    "paranormal"
    "ufos"
    "ufo"
    "ghosts"
    "aliens"
    "bigfoot"
    "cryptids"
    "cryptozoology"
    "glitch_in_the_matrix"
    "highstrangeness"
    "thetruthishere"
    "skinwalkers"
    "humanoidencounters"
    "nde"
    "astralprojection"
    "missing411"
    "dogman"
    "crawlersightings"
    "fleshgait"
    "shadowpeople"
)

# Function to import a subreddit via Arctic Shift
import_subreddit() {
    local subreddit=$1
    local limit=${2:-1000}

    echo "📥 Fetching r/$subreddit (limit: $limit)..."

    # Fetch posts from Arctic Shift
    local response=$(curl -s "${ARCTIC_SHIFT_API}?subreddit=${subreddit}&limit=${limit}&sort=created_utc:desc")

    # Check if we got data
    local count=$(echo "$response" | jq -r '.data | length' 2>/dev/null || echo "0")

    if [ "$count" = "0" ] || [ "$count" = "null" ]; then
        echo "   ⚠️  No posts found for r/$subreddit"
        return
    fi

    echo "   📦 Got $count posts, importing..."

    # Import to ParaDocs
    local result=$(curl -s -X POST "${API_BASE}/api/admin/direct-import" \
        -H "Content-Type: application/json" \
        -d "{\"posts\": $(echo "$response" | jq '.data')}")

    local inserted=$(echo "$result" | jq -r '.result.inserted // 0')
    local skipped=$(echo "$result" | jq -r '.result.skipped // 0')
    local rejected=$(echo "$result" | jq -r '.result.rejected // 0')

    echo "   ✅ Inserted: $inserted, Skipped: $skipped, Rejected: $rejected"

    # Rate limiting
    sleep 2
}

# Function to trigger web scraper ingestion
trigger_scraper() {
    local source=$1
    local limit=${2:-500}

    echo "🔄 Triggering $source scraper (limit: $limit)..."

    local result=$(curl -s -X POST "${API_BASE}/api/admin/ingest?source=${source}&limit=${limit}" \
        -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
        -H "Content-Type: application/json")

    echo "   Result: $result"
}

# Main menu
echo "What would you like to import?"
echo ""
echo "  1) Reddit - All paranormal subreddits (Arctic Shift API)"
echo "  2) NUFORC - UFO sightings (web scraper)"
echo "  3) BFRO - Bigfoot sightings (web scraper)"
echo "  4) All sources (Reddit + Scrapers)"
echo "  5) Single subreddit"
echo ""
read -p "Enter choice [1-5]: " choice

case $choice in
    1)
        echo ""
        echo "🚀 Starting Reddit bulk import..."
        echo ""
        for sub in "${SUBREDDITS[@]}"; do
            import_subreddit "$sub" 2000
        done
        echo ""
        echo "✅ Reddit import complete!"
        ;;
    2)
        echo ""
        echo "🛸 Triggering NUFORC ingestion..."
        trigger_scraper "nuforc" 1000
        ;;
    3)
        echo ""
        echo "🦶 Triggering BFRO ingestion..."
        trigger_scraper "bfro" 500
        ;;
    4)
        echo ""
        echo "🌟 Running full ingestion..."
        echo ""

        echo "=== Phase 1: Reddit Import ==="
        for sub in "${SUBREDDITS[@]}"; do
            import_subreddit "$sub" 1000
        done

        echo ""
        echo "=== Phase 2: Web Scrapers ==="
        trigger_scraper "nuforc" 500
        sleep 5
        trigger_scraper "bfro" 200
        sleep 5
        trigger_scraper "nderf" 200

        echo ""
        echo "✅ Full ingestion complete!"
        ;;
    5)
        read -p "Enter subreddit name (without r/): " sub
        read -p "Enter limit [1000]: " limit
        limit=${limit:-1000}
        import_subreddit "$sub" "$limit"
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "======================================"
echo "  Import finished!"
echo "======================================"
