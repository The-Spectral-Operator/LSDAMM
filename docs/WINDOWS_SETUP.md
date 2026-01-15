# LSDAMM Windows Setup Guide

Complete guide for setting up LSDAMM on Windows systems.

---

## 📋 Prerequisites

### Required Software

1. **Node.js 20 or higher**
   - Download from: https://nodejs.org/
   - Choose the "LTS" (Long Term Support) version
   - During installation, check "Automatically install necessary tools"
   - Verify installation:
     ```powershell
     node --version
     npm --version
     ```

2. **Git** (recommended)
   - Download from: https://git-scm.com/download/win
   - Use default installation options
   - Verify installation:
     ```powershell
     git --version
     ```

### Optional but Recommended

- **Windows Terminal** (modern terminal with better features)
  - Install from Microsoft Store
  - Or download from: https://github.com/microsoft/terminal

- **Visual Studio Code** (if using VS Code extension)
  - Download from: https://code.visualstudio.com/

---

## 🚀 Automated Setup

The easiest way to set up LSDAMM on Windows is using the automated setup script.

### Step 1: Download LSDAMM

**Option A: Using Git** (recommended)
```powershell
git clone https://github.com/The-Spectral-Operator/LSDAMM.git
cd LSDAMM
```

**Option B: Download ZIP**
1. Go to https://github.com/The-Spectral-Operator/LSDAMM
2. Click "Code" → "Download ZIP"
3. Extract the ZIP file to a folder (e.g., `C:\LSDAMM`)
4. Open PowerShell or Command Prompt in that folder

### Step 2: Run Setup Script

Double-click `setup.bat` or run from command line:

```powershell
setup.bat
```

The script will:
1. ✅ Check for Node.js and npm
2. ✅ Install server dependencies
3. ✅ Create required directories
4. ✅ Set up configuration files
5. ✅ Build TypeScript
6. ✅ Initialize database
7. ✅ Install chatbot dependencies
8. ✅ Create startup scripts

### Step 3: Configure API Keys

Edit `server\.env` and add your API keys:

```env
# Required
JWT_SECRET=your-secure-random-string-here

# AI Providers (add the ones you want to use)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
XAI_API_KEY=xai-...

# Optional
OLLAMA_API_KEY=...  # Only if using Ollama Cloud
```

**Important:** Generate a secure JWT_SECRET:
- Use a password manager to generate a random 64-character string
- Or use Node.js:
  ```powershell
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

### Step 4: Start Services

**Start everything at once:**
```powershell
start-all.bat
```

**Or start services individually:**
```powershell
# Terminal 1: Start server
start-server.bat

# Terminal 2: Start chatbot
start-chatbot.bat
```

### Step 5: Verify Installation

1. **Check Server Health:**
   - Open browser to: http://localhost:3001/api/health
   - Should see: `{"status": "healthy", ...}`

2. **Access Chatbot:**
   - Open browser to: http://localhost:8080
   - You should see the LSDAMM chat interface

3. **Test API:**
   ```powershell
   # Register a user
   curl -X POST http://localhost:3001/api/users/register `
     -H "Content-Type: application/json" `
     -d '{\"email\":\"test@example.com\",\"password\":\"TestPass123\"}'
   ```

---

## 🔧 Manual Setup

If you prefer manual setup or the automated script fails:

### 1. Install Server Dependencies

```powershell
cd server
npm install
```

### 2. Create Configuration Files

```powershell
# Copy configuration templates
copy config\server.example.toml config\server.toml
copy config\.env.example .env

# Edit .env with your API keys
notepad .env
```

### 3. Create Directories

```powershell
mkdir data
mkdir logs
mkdir data\uploads
```

### 4. Build TypeScript

```powershell
npm run build
```

### 5. Initialize Database

```powershell
npm run setup:db
```

### 6. Start Server

```powershell
npm run dev
```

### 7. Install Chatbot (Optional)

```powershell
cd ..\chatbot
npm install
npm start
```

---

## 🎯 VS Code Extension Setup

If you want to use the VS Code extension:

### 1. Install Extension

```powershell
cd vscode-extension
npm install
npm run build
```

### 2. Package Extension (Optional)

```powershell
npm install -g vsce
vsce package
```

This creates a `.vsix` file you can install in VS Code.

### 3. Install in VS Code

1. Open VS Code
2. Press `Ctrl+Shift+P`
3. Type "Extensions: Install from VSIX"
4. Select the generated `.vsix` file

### 4. Configure Extension

1. Open VS Code Settings (`Ctrl+,`)
2. Search for "LSDAMM"
3. Configure:
   - Server URL: `ws://localhost:3001/ws`
   - Auth Token: (get from server login)
   - Client ID: (any unique identifier)

---

## 🐳 Docker Setup (Advanced)

If you prefer using Docker on Windows:

### Prerequisites

- Docker Desktop for Windows
- WSL 2 enabled

### Setup

```powershell
cd server\docker
copy .env.example .env
# Edit .env with your settings

docker-compose up -d
```

---

## 🛠️ Troubleshooting

### Port Already in Use

If ports 3001 or 8080 are already in use:

**Option 1: Change ports in config**
Edit `server\config\server.toml`:
```toml
[server]
port = 3002  # Change to any free port
```

**Option 2: Kill the process using the port**
```powershell
# Find process using port 3001
netstat -ano | findstr :3001

# Kill process (replace PID with actual process ID)
taskkill /PID <PID> /F
```

### Database Initialization Failed

If database setup fails:

1. Delete existing database:
   ```powershell
   del server\data\mesh.db
   ```

2. Run setup again:
   ```powershell
   cd server
   npm run setup:db
   ```

### Node.js Version Issues

Ensure you have Node.js 20+:
```powershell
node --version
```

If version is too old:
1. Uninstall old Node.js from Control Panel
2. Download latest LTS from https://nodejs.org/
3. Install and restart PowerShell

### Permission Errors

If you get permission errors:

**Option 1: Run as Administrator**
- Right-click PowerShell or Command Prompt
- Select "Run as Administrator"

**Option 2: Fix npm permissions**
```powershell
# Change npm global directory
npm config set prefix "%APPDATA%\npm"

# Add to PATH if needed
# Add %APPDATA%\npm to your PATH environment variable
```

### TypeScript Build Errors

If TypeScript compilation fails:

```powershell
cd server
# Clean build
rmdir /s /q dist
npm run build
```

### Firewall Warnings

Windows Defender may ask to allow Node.js network access:
- Click "Allow access" for both Private and Public networks

---

## 📦 Running as Windows Service

To run LSDAMM as a Windows service (auto-start on boot):

### Using NSSM (Non-Sucking Service Manager)

1. **Download NSSM:**
   - https://nssm.cc/download

2. **Install Server Service:**
   ```powershell
   nssm install LSDammServer "C:\Program Files\nodejs\node.exe"
   nssm set LSDammServer AppParameters "dist\main.js"
   nssm set LSDammServer AppDirectory "C:\LSDAMM\server"
   nssm set LSDammServer DisplayName "LSDAMM Coordination Server"
   nssm set LSDammServer Description "Lackadaisical Spectral Distributed AI MCP Mesh Server"
   nssm set LSDammServer Start SERVICE_AUTO_START
   ```

3. **Start Service:**
   ```powershell
   nssm start LSDammServer
   ```

4. **Check Status:**
   ```powershell
   nssm status LSDammServer
   ```

---

## 🔒 Security Recommendations

1. **Firewall:**
   - Only expose ports 3001 and 8080 if needed externally
   - Use Windows Defender Firewall to restrict access

2. **API Keys:**
   - Never commit `.env` to Git
   - Ensure `.gitignore` includes `.env`
   - Use environment variables in production

3. **HTTPS:**
   - Use a reverse proxy (IIS, nginx) for HTTPS in production
   - Obtain SSL certificates (Let's Encrypt)

4. **Updates:**
   - Keep Node.js updated
   - Regularly run `npm update` in server directory

---

## 📚 Next Steps

- ✅ [API Documentation](API.md)
- ✅ [Architecture Guide](../LSDAMM-FULL-Scaffold-and-Build.md)
- ✅ Main [README](../README.md)

---

## 💡 Tips

- **Quick Restart:** Close terminal windows and run `start-all.bat` again
- **View Logs:** Check `server\logs\server.log` for error messages
- **Update Dependencies:** Run `npm update` in `server` folder periodically
- **Backup Database:** Copy `server\data\mesh.db` regularly

---

## 🆘 Getting Help

If you encounter issues:

1. Check server logs: `server\logs\server.log`
2. Verify `.env` configuration
3. Ensure all dependencies are installed
4. Open an issue on GitHub with logs and error messages

---

**Happy coding! 🌌 Phase Ω Online · Shadow Lattice Resonates 🌌**
