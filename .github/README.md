# GitHub Actions Build Configuration

This directory contains GitHub Actions workflows for automated building and releasing of the PDF Image Processor Electron app.

## Workflows

### `build-electron.yml`
Automatically builds the Electron application for multiple platforms:

#### Supported Platforms:
- **macOS Apple Silicon (arm64)** - builds `.dmg` and `.zip` files
- **Windows x64** - builds portable `.exe` executable

#### Triggers:
- Push to `main` branch
- Pull requests to `main` branch  
- Git tags starting with `v*` (e.g., `v1.0.0`)
- Manual workflow dispatch

#### Artifacts:
Built applications are uploaded as artifacts and retained for 7 days:
- `pdf-reader-macos-arm64` - macOS builds
- `pdf-reader-windows-x64` - Windows builds

#### Releases:
When you push a git tag starting with `v`, the workflow will:
1. Build for all platforms
2. Create a GitHub release
3. Upload all build artifacts to the release
4. Generate release notes automatically

## Usage

### Creating a Release:
```bash
# Tag your commit
git tag v1.0.0
git push origin v1.0.0

# GitHub Actions will automatically:
# 1. Build for macOS and Windows
# 2. Create a release
# 3. Upload the built apps
```

### Manual Build:
Go to the Actions tab in GitHub and manually trigger the "Build Electron App" workflow.

## Code Signing (Optional)

To enable code signing, add these secrets to your GitHub repository:

### Windows:
- `CSC_LINK` - Base64 encoded .p12 certificate
- `CSC_KEY_PASSWORD` - Certificate password

### macOS:
- Add your Apple Developer certificates to the runner
- Set up notarization (currently disabled)

## Requirements

The build process requires:
- Node.js 18+
- All npm dependencies
- Access to native modules (sharp, mupdf)

## Output Structure

```
dist-electron/
├── PDF图像处理器-1.0.0-arm64.dmg    # macOS ARM64 installer
├── PDF图像处理器-1.0.0-arm64-mac.zip # macOS ARM64 app bundle
└── PDF图像处理器 1.0.0.exe           # Windows portable executable
```
