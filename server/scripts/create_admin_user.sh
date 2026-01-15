#!/bin/bash
# LSDAMM - Create Admin User Script
# Creates an initial admin user for the system

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}===============================${NC}"
echo -e "${GREEN}  LSDAMM Admin User Setup${NC}"
echo -e "${GREEN}===============================${NC}"
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    exit 1
fi

# Prompt for credentials
read -p "Enter admin email: " ADMIN_EMAIL
read -sp "Enter admin password: " ADMIN_PASSWORD
echo ""
read -p "Enter display name (optional): " ADMIN_NAME

# Validate email
if [[ ! "$ADMIN_EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
    echo -e "${RED}Error: Invalid email format${NC}"
    exit 1
fi

# Validate password length
if [[ ${#ADMIN_PASSWORD} -lt 8 ]]; then
    echo -e "${RED}Error: Password must be at least 8 characters${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Creating admin user...${NC}"

# Create admin user
cd "$SERVER_DIR"
node -e "
import { registerUser } from './dist/auth/user_auth.js';

async function createAdmin() {
  try {
    const result = await registerUser(
      '${ADMIN_EMAIL}',
      '${ADMIN_PASSWORD}',
      '${ADMIN_NAME}' || undefined,
      'admin'
    );
    console.log('Admin user created successfully!');
    console.log('User ID:', result.user.user_id);
    console.log('Email:', result.user.email);
    console.log('Role:', result.user.role);
    console.log('');
    console.log('Access Token:', result.tokens.accessToken);
    console.log('');
    console.log('Store this token securely. You can use it to authenticate API requests.');
  } catch (error) {
    console.error('Failed to create admin user:', error.message);
    process.exit(1);
  }
}

createAdmin();
" 2>/dev/null || echo -e "${RED}Failed to create admin user${NC}"

echo ""
echo -e "${GREEN}===============================${NC}"
echo -e "${GREEN}  Admin user setup complete!${NC}"
echo -e "${GREEN}===============================${NC}"
