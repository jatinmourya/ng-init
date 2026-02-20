# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.3] - 2026-02-04

### Changed
- Updated documentation for accuracy
- Streamlined dependencies (removed unused packages)
- Improved build process with esbuild

### Fixed
- Documentation now reflects actual project structure
- Corrected dependency list in documentation

---

## [1.1.0] - 2026-01-31

### Added
- **Dynamic Library Version Resolution** - Automatically resolves compatible library versions based on Angular version
- **npm Registry Integration** - Real-time fetching of package peer dependencies for compatibility checking
- **Intelligent Version Matching** - For Angular-scoped packages (`@angular/*`, `@ngrx/*`), automatically matches major versions
- **Compatibility Warnings** - Displays warnings for potentially incompatible library versions
- **Package Caching** - 5-minute cache for npm registry responses to improve performance
- **Three-step Angular Version Selection** - Select major → minor → patch versions interactively

### Changed
- Improved library installation process with resolved versions display
- Enhanced compatibility checking with semver validation

### Fixed
- Library versions now properly resolve for Angular compatibility instead of defaulting to 'latest'
- Improved error handling in npm registry requests

---

## [1.0.0] - 2026-01-30

### Added

#### Core Features
- System environment check displaying Node.js, npm, nvm, and Angular CLI versions
- Interactive Angular version selection from npm registry
- Node.js compatibility checking with selected Angular version
- Smart Node version management with nvm support
- Node.js installation assistant for systems without nvm
- Project location configuration (current or custom directory)
- Complete project initialization with Angular CLI

#### Advanced Features
- Pre-configured project templates (Basic, Enterprise, PWA, Material, Testing, Standalone)
- Interactive library search with npm registry autocomplete
- Real-time package validation and metadata display
- Popular library bundles (UI Framework, State Management, Forms, Testing, etc.)
- Configuration presets (TypeScript strict mode, ESLint, Prettier, Husky)
- Automatic project structure generation (core, shared, features folders)
- Git repository initialization with .gitignore
- Documentation generation (README.md, CHANGELOG.md)
- Profile management system (save, load, export, import configurations)

#### CLI Commands
- `ng-init` - Main interactive project creation
- `ng-init create` - Alias for main command
- `ng-init check` - System version check
- `ng-init profile list` - List saved profiles
- `ng-init profile show <name>` - Show profile details
- `ng-init profile delete <name>` - Delete a profile
- `ng-init profile export <name> <output>` - Export profile to file
- `ng-init profile import <file>` - Import profile from file
- `ng-init examples` - Show usage examples

#### Utility Modules
- Version checker for system components
- npm registry search and validation
- Compatibility checking and resolution
- Package installation management
- Interactive prompt handlers
- File operations and utilities
- Profile management system

#### Templates & Bundles
- 6 pre-configured project templates
- 8 popular library bundles
- 3 configuration presets
- Standard and domain-driven project structures
- Git configuration templates
- Documentation templates

### Technical Details

#### Dependencies
- @inquirer/prompts: ^7.10.1
- axios: ^1.6.5
- chalk: ^5.3.0
- commander: ^13.1.0
- execa: ^9.6.1
- ora: ^8.0.1
- semver: ^7.5.4

#### Supported Platforms
- Windows (with nvm-windows support)
- macOS (with nvm support)
- Linux (with nvm support)

#### Node.js Requirements
- Minimum: Node.js v18.0.0
- Recommended: Node.js v18.19.0 or v20.11.0 (LTS)

### Documentation
- Comprehensive README.md with usage examples
- Detailed PROJECT_DOCUMENTATION.md with architecture
- CONTRIBUTING.md with contribution guidelines
- LICENSE (MIT)

### Initial Release Notes

This is the initial release of Angular Project Automator, a comprehensive CLI tool designed to streamline Angular project initialization with:

- **80% reduction** in project setup time
- **Zero environment errors** with guided Node.js version management
- **Intelligent library search** with npm registry integration
- **Reusable profiles** for team standardization
- **Best practices** built-in with pre-configured templates

The tool automates the entire project setup process, from checking system prerequisites to creating a fully-configured Angular project with all necessary libraries and tooling.

### Known Limitations

- Windows: Direct Node.js installation requires winget
- Network required for npm registry access
- Some features require nvm for full functionality

### Future Plans

#### Phase 2 (Completed)
- ✅ Enhanced library bundles
- ✅ More project templates
- ✅ Additional configuration presets
- ✅ Improved documentation generation

### Phase 3 (Completed)
- ✅ Advanced Git integration
- ✅ Enhanced profile management
- ⏳ Migration assistant (planned)
- ⏳ Multi-language support (planned)

### Phase 4 (Planned)
- Dashboard/Analytics
- Update notifications
- Cloud sync features
- Team collaboration features

---

[1.2.3]: https://github.com/jatinmourya/ng-init/releases/tag/v1.2.3
[1.1.0]: https://github.com/jatinmourya/ng-init/releases/tag/v1.1.0
[1.0.0]: https://github.com/jatinmourya/ng-init/releases/tag/v1.0.0
