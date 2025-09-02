# Building and Releasing Guide

This document explains how to build and release the PDF Image Processor Electron application.

## Automated Building with GitHub Actions

### Supported Platforms
- **macOS Apple Silicon (ARM64)** - `.dmg` and `.zip` packages
- **Windows x64** - `.exe` installer and portable executable

### Automatic Builds
The GitHub Actions workflow automatically builds the app when:

1. **Push to main branch** - builds but doesn't create release
2. **Pull Request** - builds for testing
3. **Git tags** (v*) - builds and creates GitHub release
4. **Manual trigger** - can be run manually from GitHub Actions tab

### Creating a Release

1. **Prepare your code**
   ```bash
   # Ensure all changes are committed
   git add .
   git commit -m "Release preparation"
   git push origin main
   ```

2. **Create and push a version tag**
   ```bash
   # Create a version tag (change version as needed)
   git tag v1.0.0
   git push origin v1.0.0
   ```

3. **Automatic Release Process**
   - GitHub Actions will detect the tag
   - Build macOS and Windows versions
   - Create a GitHub Release
   - Upload all build artifacts
   - Generate release notes

### Manual Build Trigger

1. Go to your repository on GitHub
2. Click "Actions" tab
3. Select "Build Electron App" workflow
4. Click "Run workflow" button
5. Choose branch and click "Run workflow"

## Local Building

### Prerequisites
- Node.js 18+ 
- npm 9+
- Native dependencies will be installed automatically

### Build Commands

```bash
# Install dependencies
npm install

# Build web assets
npm run build

# Build all Electron components
npm run build:electron

# Build for current platform only
npm run electron:build

# Build for specific platforms
npm run dist:mac    # macOS only
npm run dist:win    # Windows only
npm run dist:linux  # Linux only
```

### Output Locations
- **GitHub Actions**: `dist-electron/` directory
- **Local builds**: `dist-electron/` directory

## Build Artifacts

### macOS (Apple Silicon)
- `PDF图像处理器-1.0.0-arm64.dmg` - Installer package
- `PDF图像处理器-1.0.0-arm64-mac.zip` - Application bundle

### Windows (x64)
- `PDF图像处理器 Setup 1.0.0.exe` - NSIS installer
- `PDF图像处理器 1.0.0.exe` - Portable executable

## Customization

### App Information
Edit `electron-builder.json`:
```json
{
  "appId": "com.yourcompany.pdfprocessor",
  "productName": "Your PDF Processor",
  "copyright": "Copyright © 2024 Your Company"
}
```

### Version Management
Update version in `package.json`:
```json
{
  "version": "1.0.0"
}
```

### Icons
Add appropriate icons to `build/` directory:
- `icon.icns` - macOS icon
- `icon.ico` - Windows icon
- `icons/` - Linux icons (various sizes)

### Code Signing (Optional)

#### Windows Code Signing
Add GitHub Secrets:
- `CSC_LINK` - Base64 encoded .p12 certificate
- `CSC_KEY_PASSWORD` - Certificate password

#### macOS Code Signing
- Add Apple Developer certificates
- Enable notarization in `electron-builder.json`

## Troubleshooting

### Common Issues

1. **Native module build failures**
   - Ensure proper Node.js version (18+)
   - Clear node_modules and reinstall: `rm -rf node_modules && npm install`

2. **GitHub Actions build failures**
   - Check that all required dependencies are in `package.json`
   - Verify TypeScript compilation succeeds locally

3. **Icon not showing**
   - Add proper icon files to `build/` directory
   - Ensure icon formats match platform requirements

### Build Logs
- **GitHub Actions**: Check the Actions tab for detailed logs
- **Local**: Build output will show in terminal

## Release Notes

When creating releases via tags, GitHub will automatically:
- Generate release notes from commits
- Include all build artifacts
- Mark as latest release

You can edit the release afterwards to:
- Add custom release notes
- Mark as pre-release if needed
- Upload additional files

## Environment Variables

The build process supports these environment variables:

- `NODE_ENV` - Set to 'production' for optimized builds
- `CSC_IDENTITY_AUTO_DISCOVERY` - Disable automatic code signing
- `CSC_LINK` - Windows code signing certificate
- `CSC_KEY_PASSWORD` - Certificate password
