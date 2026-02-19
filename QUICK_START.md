# Quick Start Guide

Get started with Angular Project Automator in minutes!

## 📦 Installation

### Option 1: Global Installation (Recommended)

```bash
npm install -g @jatinmourya/ng-init
```

### Option 2: Use with npx (No installation needed)

```bash
npx @jatinmourya/ng-init
```

## 🚀 Create Your First Project

### Step 1: Run the CLI

```bash
ng-init
```

### Step 2: Follow the Interactive Prompts

The CLI will guide you through:

1. **System Check** - Reviews your Node.js, npm, and Angular CLI versions
2. **Angular Version Selection** (3-step process):
   - Select major version (e.g., Angular 17, 18, 19)
   - Select minor version (e.g., 17.0.x, 17.1.x)
   - Select patch version (e.g., 17.1.0, 17.1.1)
3. **Compatibility Check** - Ensures your Node.js version is compatible
4. **Project Configuration** - Name your project and choose location
5. **Project Options** - Configure routing, styles, strict mode, and standalone components
6. **Library Search** - Add additional npm packages (with auto version resolution)
7. **Save Profile** - Optionally save your configuration for reuse

### Step 3: Start Developing

```bash
cd your-project-name
ng serve
```

Open [http://localhost:4200](http://localhost:4200) in your browser!

## 🎯 Common Use Cases

### Use Case 1: Project with Libraries

```bash
ng-init
# Select Angular 17
# Configure project options
# Search for @angular/material, @ngrx/store, etc.
# Save as "my-setup" profile
```

### Use Case 2: Quick Basic Setup

```bash
ng-init
# Select latest Angular
# Configure project options with routing
# Skip library installation
```

### Use Case 3: Reuse Saved Profile

```bash
ng-init
# Say "Yes" to use saved profile
# Select your profile
# Confirm and create
```

## 🔧 System Requirements

### Required
- **Node.js**: v18.0.0 or higher
- **npm**: Comes with Node.js

### Recommended
- **nvm**: For automatic Node version management
  - Windows: [nvm-windows](https://github.com/coreybutler/nvm-windows)
  - macOS/Linux: [nvm](https://github.com/nvm-sh/nvm)

## ⚡ Quick Commands

```bash
# Create new project
ng-init

# Check system versions
ng-init check

# List saved profiles
ng-init profile list

# Show profile details
ng-init profile show my-profile

# Export profile
ng-init profile export my-profile ./profile.json

# Import profile
ng-init profile import ./profile.json

# Show examples
ng-init examples
```

## 📚 What Gets Created?

When you create a project, you get:

### Basic Setup
- ✅ Angular project with selected version
- ✅ All dependencies installed
- ✅ TypeScript configuration
- ✅ Development server ready
- ✅ Routing configured (if enabled)
- ✅ Stylesheet setup (CSS/SCSS/SASS/LESS)


## 🐛 Troubleshooting

### "Node version incompatible"
The CLI will automatically guide you to:
- Install compatible Node version with nvm
- Or install Node.js directly on Windows

### "Angular CLI not found"
The CLI uses `npx @angular/cli` so you don't need Angular CLI globally installed.

### "npm registry timeout"
- Check your internet connection
- Try again or use a VPN if behind firewall

### "Permission denied" (Linux/macOS)
```bash
sudo npm install -g @jatinmourya/ng-init
```

## 💡 Pro Tips

### Tip 1: Save Time with Profiles
Create profiles for your common project setups:
- Team standard configuration
- Personal preference
- Different project types

### Tip 2: Use Interactive Search
The interactive library search:
- Shows package popularity
- Validates packages in real-time
- Displays download statistics
- Ensures you get the right package

### Tip 3: Enable Pre-commit Hooks
Always enable Husky hooks to:
- Auto-format code before commit
- Run linting checks
- Maintain code quality

### Tip 4: Generate Documentation
Enable README and CHANGELOG generation to:
- Start with good documentation
- Follow best practices
- Save time on setup

## 🔗 Next Steps

After creating your project:

1. **Explore the structure**
   ```bash
   cd your-project
   tree src/  # or ls -R src/
   ```

2. **Run development server**
   ```bash
   ng serve
   ```

3. **Generate components**
   ```bash
   ng generate component my-component
   ng generate service my-service
   ```

4. **Build for production**
   ```bash
   ng build --configuration production
   ```

5. **Run tests**
   ```bash
   ng test
   ```

## 📖 Learn More

- [Full README](./README.md) - Complete documentation
- [Project Documentation](./PROJECT_DOCUMENTATION.md) - Architecture details
- [Contributing Guide](./CONTRIBUTING.md) - How to contribute
- [Changelog](./CHANGELOG.md) - Version history

## 🆘 Need Help?

- GitHub Issues: Report bugs or request features
- Examples: Run `ng-init examples`
- Documentation: Check README.md

---

**Ready to build amazing Angular apps? Let's go! 🚀**
