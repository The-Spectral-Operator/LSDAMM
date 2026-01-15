#!/bin/bash
# LSDAMM - Database Setup Script
# Sets up the SQLite database and runs migrations

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}===============================${NC}"
echo -e "${GREEN}  LSDAMM Database Setup${NC}"
echo -e "${GREEN}===============================${NC}"
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    exit 1
fi

# Check if in correct directory
if [[ ! -f "$SERVER_DIR/package.json" ]]; then
    echo -e "${RED}Error: Must be run from server directory${NC}"
    exit 1
fi

# Create data directory if it doesn't exist
DATA_DIR="${SERVER_DIR}/data"
if [[ ! -d "$DATA_DIR" ]]; then
    echo -e "${YELLOW}Creating data directory...${NC}"
    mkdir -p "$DATA_DIR"
fi

# Create logs directory if it doesn't exist
LOGS_DIR="${SERVER_DIR}/logs"
if [[ ! -d "$LOGS_DIR" ]]; then
    echo -e "${YELLOW}Creating logs directory...${NC}"
    mkdir -p "$LOGS_DIR"
fi

# Copy configuration if not exists
CONFIG_FILE="${SERVER_DIR}/config/server.toml"
if [[ ! -f "$CONFIG_FILE" ]]; then
    echo -e "${YELLOW}Creating default configuration...${NC}"
    cp "${SERVER_DIR}/config/server.example.toml" "$CONFIG_FILE"
    echo -e "${YELLOW}Please edit ${CONFIG_FILE} with your settings${NC}"
fi

# Build TypeScript if needed
if [[ ! -d "$SERVER_DIR/dist" ]]; then
    echo -e "${YELLOW}Building TypeScript...${NC}"
    cd "$SERVER_DIR"
    npm run build
fi

# Run database initialization
echo -e "${YELLOW}Initializing database...${NC}"
node -e "
import { initializeDatabase, closeDatabase } from './dist/db/database.js';
initializeDatabase();
closeDatabase();
console.log('Database initialized successfully');
" 2>/dev/null || {
    # Fallback for CommonJS
    cd "$SERVER_DIR"
    node --experimental-specifier-resolution=node -e "
    const { initializeDatabase, closeDatabase } = require('./dist/db/database.js');
    initializeDatabase();
    closeDatabase();
    console.log('Database initialized successfully');
    "
}

echo ""
echo -e "${GREEN}===============================${NC}"
echo -e "${GREEN}  Database setup complete!${NC}"
echo -e "${GREEN}===============================${NC}"
echo ""
echo "Database location: ${DATA_DIR}/mesh.db"
echo ""
echo "Next steps:"
echo "  1. Edit config/server.toml with your settings"
echo "  2. Set up environment variables (.env)"
echo "  3. Run: npm run dev"
