#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get the script's directory and set up paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(dirname "$SCRIPT_DIR")"
CLIENT_DIR="$APP_ROOT/src/client"
OUT_DIR="$APP_ROOT/out/client"
TEST_SCRIPT="$SCRIPT_DIR/test-workflows.ts"

# Debug output
echo -e "${YELLOW}Using directories:${NC}"
echo "APP_ROOT: $APP_ROOT"
echo "CLIENT_DIR: $CLIENT_DIR"
echo "OUT_DIR: $OUT_DIR"
echo "TEST_SCRIPT: $TEST_SCRIPT"

# Create out directory if it doesn't exist
mkdir -p "$OUT_DIR"

# Check if test script exists
if [ ! -f "$TEST_SCRIPT" ]; then
    echo -e "${RED}Error: Test script not found at $TEST_SCRIPT${NC}"
    exit 1
fi

# Check for .env file
if [ ! -f "$CLIENT_DIR/.env" ]; then
    echo -e "${RED}Error: .env file not found in $CLIENT_DIR!${NC}"
    echo "Please create a .env file with the following variables:"
    echo "ANTHROPIC_API_KEY=your_api_key_here"
    exit 1
fi

# Check for required config files
if [ ! -f "$OUT_DIR/mcp-config.json" ]; then
    echo -e "${RED}Error: mcp-config.json not found in $OUT_DIR${NC}"
    exit 1
fi

if [ ! -f "$OUT_DIR/setup-config.json" ]; then
    echo -e "${RED}Error: setup-config.json not found in $OUT_DIR${NC}"
    exit 1
fi

echo -e "${YELLOW}Building TypeScript files...${NC}"

cd "$APP_ROOT"
npx ts-node --esm scripts/test-workflows.ts

if [ $? -ne 0 ]; then
    echo -e "${RED}Build failed!${NC}"
    exit 1
fi

echo -e "${GREEN}Build successful!${NC}"
echo -e "${YELLOW}Running test workflow...${NC}"

# Change to the out directory
cd "$OUT_DIR"

# Run the test script
node "$TEST_SCRIPT"

# Check if the test completed successfully
if [ $? -ne 0 ]; then
    echo -e "${RED}Test failed!${NC}"
    exit 1
fi

echo -e "${GREEN}Test completed successfully!${NC}" 