# Installation & Setup Guide

Complete guide to install and configure Angular Project Automator.

## 📋 Prerequisites

Before installing, ensure you have:

### Required
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher (comes with Node.js)

### Recommended
- **nvm** (Node Version Manager) - For automatic Node version management
  - Allows CLI to automatically switch Node versions
  - Simplifies Node.js version management

## 🚀 Installation Methods

### Method 1: Global Installation (Recommended)

Install the package globally to use `ng-init` command anywhere:

```bash
npm install -g @jatinmourya/ng-init
```

Verify installation:
```bash
ng-init --version
```

### Method 2: Using npx (No Installation)

Run without installing:

```bash
npx @jatinmourya/ng-init
```

This downloads and runs the latest version temporarily.

### Method 3: Local Development

For development or testing:

```bash
# Clone the repository
git clone https://github.com/jatinmourya/ng-init.git
cd ng-init

# Install dependencies
npm install

# Link globally for testing
npm link

# Now you can use ng-init command
ng-init

# Unlink when done
npm unlink -g ng-init
```

## 🔧 Platform-Specific Setup

### Windows

#### Install Node.js
1. **With winget** (recommended):
   ```bash
   winget install OpenJS.NodeJS.LTS
   ```

2. **Manual download**:
   - Visit [nodejs.org](https://nodejs.org)
   - Download Windows installer
   - Run installer

#### Install nvm-windows (Optional but Recommended)
1. Download from [nvm-windows releases](https://github.com/coreybutler/nvm-windows/releases)
2. Run `nvm-setup.zip` installer
3. Restart terminal

Test nvm:
```bash
nvm version
```

#### Install Angular Project Automator
```bash
npm install -g @jatinmourya/ng-init
```

### macOS

#### Install Node.js
1. **With Homebrew** (recommended):
   ```bash
   brew install node
   ```

2. **With nvm**:
   ```bash
   # Install nvm first
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
   
   # Restart terminal, then:
   nvm install --lts
   ```

#### Install Angular Project Automator
```bash
npm install -g @jatinmourya/ng-init
```

### Linux

#### Install Node.js

**Ubuntu/Debian**:
```bash
# Using NodeSource
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Fedora/RHEL/CentOS**:
```bash
sudo dnf install nodejs
```

**With nvm**:
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
# Restart terminal
nvm install --lts
```

#### Install Angular Project Automator
```bash
npm install -g @jatinmourya/ng-init
# or with sudo if needed
sudo npm install -g @jatinmourya/ng-init
```

## ✅ Verify Installation

### Check Node.js and npm
```bash
node --version   # Should be v18.0.0 or higher
npm --version    # Should be v9.0.0 or higher
```

### Check ng-init
```bash
ng-init --version
ng-init check     # Shows all system versions
```

## 🔍 Troubleshooting Installation

### Issue: "command not found: ng-init"

**Solution 1**: Check npm global bin path
```bash
npm config get prefix
```

Ensure this path is in your system PATH.

**Solution 2**: Use npx instead
```bash
npx @jatinmourya/ng-init
```

### Issue: Permission denied (Linux/macOS)

**Solution 1**: Use sudo
```bash
sudo npm install -g @jatinmourya/ng-init
```

**Solution 2**: Fix npm permissions (recommended)
```bash
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
npm install -g @jatinmourya/ng-init
```

### Issue: Node version too old

**Solution**: Update Node.js
```bash
# With nvm
nvm install --lts
nvm use --lts

# Or download from nodejs.org
```

### Issue: npm install fails

**Solution 1**: Clear npm cache
```bash
npm cache clean --force
npm install -g @jatinmourya/ng-init
```

**Solution 2**: Use different registry
```bash
npm install -g @jatinmourya/ng-init --registry https://registry.npmjs.org/
```

### Issue: Windows long path errors

**Solution**: Enable long paths
```powershell
# Run PowerShell as Administrator
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
```

## 🔄 Updating

### Update to Latest Version
```bash
npm update -g @jatinmourya/ng-init
```

### Check Current Version
```bash
ng-init --version
```

### Check for Updates
```bash
npm outdated -g ng-init
```

## 🗑️ Uninstallation

### Remove Global Package
```bash
npm uninstall -g ng-init
```

### Remove Saved Profiles (Optional)
Profiles are saved in `~/.ng-init/`

```bash
# Windows
rmdir /s %USERPROFILE%\.ng-init

# macOS/Linux
rm -rf ~/.ng-init
```

## ⚙️ Configuration

### Environment Variables (Optional)

You can set these environment variables:

```bash
# Custom npm registry
export NPM_REGISTRY=https://registry.npmjs.org

# Proxy settings (if behind firewall)
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080
```

### Profile Location

Profiles are stored at:
- **Windows**: `C:\Users\<username>\.ng-init\profiles.json`
- **macOS/Linux**: `~/.ng-init/profiles.json`

Note: Profiles are local only. There is no cloud sync or remote profile storage in this release.

## 🎯 First Run

After installation, run:

```bash
ng-init check
```

This verifies:
- ✅ Node.js is installed
- ✅ npm is working
- ✅ nvm is available (optional)
- ✅ Angular CLI version

Then create your first project:

```bash
ng-init
```

Important: The CLI does not automatically initialize Git repositories, create `.gitignore` files, or generate README/CHANGELOG files. Helper functions exist in `src/utils/file-utils.js` for manual use.

## 📚 Next Steps

1. Read [QUICK_START.md](./QUICK_START.md) for quick start guide
2. Read [README.md](./README.md) for full documentation
3. Run `ng-init examples` for usage examples
4. Create your first Angular project!

## 🆘 Getting Help

If you encounter issues:

1. Run `ng-init check` to diagnose system
2. Check [Troubleshooting](#troubleshooting-installation) section
3. Review [GitHub Issues](https://github.com/jatinmourya/ng-init/issues)
4. Create new issue with:
   - Operating system
   - Node.js version
   - npm version
   - Error message
   - Steps to reproduce

## 📊 System Requirements Summary

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Node.js | v18.0.0 | v18.19.0 (LTS) or v20.11.0 (LTS) |
| npm | v9.0.0 | v10.0.0+ |
| nvm | Optional | Highly Recommended |
| RAM | 2 GB | 4 GB+ |
| Disk Space | 500 MB | 1 GB+ |
| Internet | Required | Stable connection |

## ✨ Post-Installation Tips

### Enable Tab Completion (Optional)

**Bash**:
```bash
ng-init --completion >> ~/.bashrc
source ~/.bashrc
```

**Zsh**:
```bash
ng-init --completion >> ~/.zshrc
source ~/.zshrc
```

### Create Alias (Optional)

Add to your shell config:
```bash
alias nga='ng-init'
alias ngac='ng-init check'
alias ngap='ng-init profile list'
```

### Set Default Profile

Create a default profile for quick project creation:
```bash
ng-init
# Configure your preferred settings
# Save as "default" profile
```

Next time:
```bash
ng-init
# Select "default" profile
```

---

**Installation complete! Ready to create amazing Angular projects! 🚀**
