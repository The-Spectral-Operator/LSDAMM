# LSDAMM Production Deployment Guide

Complete guide for deploying LSDAMM to production environments.

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Server Preparation](#server-preparation)
3. [Deployment Methods](#deployment-methods)
4. [Security Hardening](#security-hardening)
5. [Monitoring & Logging](#monitoring--logging)
6. [Backup & Recovery](#backup--recovery)
7. [Scaling](#scaling)
8. [Maintenance](#maintenance)

---

## Prerequisites

### Minimum Requirements

- **OS:** Ubuntu 22.04 LTS / Debian 11+ / CentOS 8+ / Windows Server 2019+
- **CPU:** 2+ cores
- **RAM:** 4GB minimum, 8GB+ recommended
- **Storage:** 20GB+ SSD
- **Network:** Static IP, open ports 80/443

### Software Requirements

- Node.js 20 LTS
- npm 10+
- SQLite3 (included)
- Nginx or Apache (recommended for reverse proxy)
- SSL certificate (Let's Encrypt recommended)
- systemd (Linux) or Windows Service Manager

---

## Server Preparation

### 1. Update System

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y build-essential git curl
```

**CentOS/RHEL:**
```bash
sudo dnf update -y
sudo dnf install -y gcc gcc-c++ make git curl
```

### 2. Install Node.js

```bash
# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should be v20.x.x
npm --version   # Should be 10.x.x
```

### 3. Create Service User

```bash
# Create dedicated user (recommended for security)
sudo useradd -r -m -s /bin/bash lsdamm
sudo usermod -aG sudo lsdamm  # Optional: add to sudo group
```

### 4. Clone Repository

```bash
# Switch to service user
sudo su - lsdamm

# Clone repository
git clone https://github.com/The-Spectral-Operator/LSDAMM.git
cd LSDAMM
```

---

## Deployment Methods

### Method 1: Systemd Service (Linux - Recommended)

#### 1. Install Dependencies

```bash
cd ~/LSDAMM/server
npm ci --production
npm run build
```

#### 2. Configure Environment

```bash
# Create production .env
cat > .env << 'EOF'
NODE_ENV=production
PORT=3001
HOST=0.0.0.0

# Security
JWT_SECRET=<GENERATE-SECURE-64-CHAR-STRING>
JWT_EXPIRES_IN=24h

# Database
DB_PATH=./data/mesh.db

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/server.log

# AI Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
XAI_API_KEY=xai-...

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# CORS
CORS_ORIGINS=https://yourdomain.com,https://chat.yourdomain.com
EOF

# Secure permissions
chmod 600 .env
```

**Generate secure JWT_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### 3. Initialize Database

```bash
npm run setup:db
```

#### 4. Create Systemd Service

```bash
# Create service file
sudo tee /etc/systemd/system/lsdamm.service > /dev/null << 'EOF'
[Unit]
Description=LSDAMM Coordination Server
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=lsdamm
Group=lsdamm
WorkingDirectory=/home/lsdamm/LSDAMM/server
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=lsdamm

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/home/lsdamm/LSDAMM/server/data
ReadWritePaths=/home/lsdamm/LSDAMM/server/logs

[Install]
WantedBy=multi-user.target
EOF
```

#### 5. Enable and Start Service

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service (start on boot)
sudo systemctl enable lsdamm

# Start service
sudo systemctl start lsdamm

# Check status
sudo systemctl status lsdamm

# View logs
sudo journalctl -u lsdamm -f
```

### Method 2: Docker Deployment

#### 1. Prepare Docker Environment

```bash
cd ~/LSDAMM/server/docker

# Copy and configure environment
cp .env.example .env
# Edit .env with production settings
nano .env
```

#### 2. Build and Deploy

```bash
# Build image
docker-compose build

# Start services
docker-compose up -d

# View logs
docker-compose logs -f coordination-server

# Check status
docker-compose ps
```

#### 3. Production Docker Compose

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  coordination-server:
    build: ..
    restart: always
    ports:
      - "3001:3001"
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    environment:
      - NODE_ENV=production
    env_file:
      - .env
    networks:
      - lsdamm-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G

  nginx:
    image: nginx:alpine
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - coordination-server
    networks:
      - lsdamm-network

networks:
  lsdamm-network:
    driver: bridge
```

### Method 3: PM2 Process Manager

```bash
# Install PM2 globally
npm install -g pm2

# Start server with PM2
cd ~/LSDAMM/server
pm2 start dist/main.js --name lsdamm-server

# Configure PM2 to start on boot
pm2 startup
pm2 save

# Monitor
pm2 status
pm2 logs lsdamm-server
pm2 monit
```

---

## Security Hardening

### 1. Nginx Reverse Proxy

```nginx
# /etc/nginx/sites-available/lsdamm
upstream lsdamm_backend {
    server 127.0.0.1:3001;
    keepalive 64;
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS Server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name yourdomain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Proxy Configuration
    location / {
        proxy_pass http://lsdamm_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # WebSocket Support
    location /ws {
        proxy_pass http://lsdamm_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
    }

    # Rate Limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;
        proxy_pass http://lsdamm_backend;
    }
}
```

**Enable site:**
```bash
sudo ln -s /etc/nginx/sites-available/lsdamm /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 2. SSL Certificate (Let's Encrypt)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d yourdomain.com

# Auto-renewal (certbot sets this up automatically)
sudo certbot renew --dry-run
```

### 3. Firewall Configuration

```bash
# UFW (Ubuntu/Debian)
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# Firewalld (CentOS/RHEL)
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

### 4. Environment Security

```bash
# Restrict .env permissions
chmod 600 ~/LSDAMM/server/.env

# Ensure data directory security
chmod 750 ~/LSDAMM/server/data
chmod 600 ~/LSDAMM/server/data/mesh.db

# Regular security updates
sudo apt update && sudo apt upgrade -y  # Ubuntu/Debian
sudo dnf update -y                       # CentOS/RHEL
```

---

## Monitoring & Logging

### 1. Application Logs

```bash
# View server logs
tail -f ~/LSDAMM/server/logs/server.log

# Systemd journal logs
sudo journalctl -u lsdamm -f

# Docker logs
docker-compose logs -f coordination-server
```

### 2. Log Rotation

```bash
# Create logrotate config
sudo tee /etc/logrotate.d/lsdamm > /dev/null << 'EOF'
/home/lsdamm/LSDAMM/server/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0644 lsdamm lsdamm
    sharedscripts
    postrotate
        systemctl reload lsdamm > /dev/null 2>&1 || true
    endscript
}
EOF
```

### 3. Health Monitoring

```bash
# Create health check script
cat > /usr/local/bin/lsdamm-health.sh << 'EOF'
#!/bin/bash
HEALTH_URL="http://localhost:3001/api/health"
if ! curl -sf "$HEALTH_URL" > /dev/null; then
    echo "Health check failed at $(date)"
    systemctl restart lsdamm
fi
EOF

chmod +x /usr/local/bin/lsdamm-health.sh

# Add cron job (every 5 minutes)
(crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/lsdamm-health.sh") | crontab -
```

### 4. Prometheus Metrics (Optional)

LSDAMM exposes Prometheus metrics at `/metrics`:

```bash
# Install Prometheus
# https://prometheus.io/download/

# Configure scraping
# prometheus.yml
scrape_configs:
  - job_name: 'lsdamm'
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: '/metrics'
```

---

## Backup & Recovery

### 1. Database Backup

```bash
# Create backup script
cat > /usr/local/bin/lsdamm-backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/backup/lsdamm"
DB_PATH="/home/lsdamm/LSDAMM/server/data/mesh.db"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"
cp "$DB_PATH" "$BACKUP_DIR/mesh_${DATE}.db"

# Keep only last 7 days
find "$BACKUP_DIR" -name "mesh_*.db" -mtime +7 -delete

echo "Backup completed: mesh_${DATE}.db"
EOF

chmod +x /usr/local/bin/lsdamm-backup.sh

# Schedule daily backups (2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/lsdamm-backup.sh") | crontab -
```

### 2. Configuration Backup

```bash
# Backup configuration files
tar -czf lsdamm-config-$(date +%Y%m%d).tar.gz \
    ~/LSDAMM/server/config/ \
    ~/LSDAMM/server/.env
```

### 3. Recovery

```bash
# Stop service
sudo systemctl stop lsdamm

# Restore database
cp /backup/lsdamm/mesh_YYYYMMDD_HHMMSS.db ~/LSDAMM/server/data/mesh.db

# Restore configuration
tar -xzf lsdamm-config-YYYYMMDD.tar.gz -C ~/

# Start service
sudo systemctl start lsdamm
```

---

## Scaling

### Horizontal Scaling

For high-traffic deployments:

1. **Load Balancer**: Use Nginx or HAProxy
2. **Multiple Instances**: Run multiple server instances
3. **Shared Database**: Use PostgreSQL or MySQL instead of SQLite
4. **Session Affinity**: Use sticky sessions for WebSocket connections

### Vertical Scaling

```bash
# Increase Node.js memory limit
# Edit systemd service
Environment="NODE_OPTIONS=--max-old-space-size=4096"
```

---

## Maintenance

### Updates

```bash
# Pull latest code
cd ~/LSDAMM
git pull origin main

# Update dependencies
cd server
npm ci --production

# Rebuild
npm run build

# Restart service
sudo systemctl restart lsdamm
```

### Database Maintenance

```bash
# Vacuum database (reclaim space)
sqlite3 ~/LSDAMM/server/data/mesh.db "VACUUM;"

# Check integrity
sqlite3 ~/LSDAMM/server/data/mesh.db "PRAGMA integrity_check;"
```

### Performance Tuning

```bash
# Monitor resource usage
htop
iotop
netstat -tunap | grep 3001

# Node.js profiling
node --prof dist/main.js
```

---

## Checklist

Before going live:

- [ ] Set strong JWT_SECRET
- [ ] Configure all API keys
- [ ] Enable HTTPS with valid SSL certificate
- [ ] Configure firewall
- [ ] Set up log rotation
- [ ] Configure automated backups
- [ ] Set up health monitoring
- [ ] Test disaster recovery
- [ ] Configure rate limiting
- [ ] Review CORS settings
- [ ] Test WebSocket connections
- [ ] Load test the API
- [ ] Document custom configuration

---

## Support

For production deployment assistance:
- 📖 [API Documentation](API.md)
- 🐛 [GitHub Issues](https://github.com/The-Spectral-Operator/LSDAMM/issues)
- 📧 Email: support@lackadaisical-security.com

---

**Happy deploying! 🚀**
