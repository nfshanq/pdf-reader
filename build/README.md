# Build Resources

This directory contains resources needed for building the Electron application.

## Required Files

### Icons
You should add the following icon files for proper application packaging:

- `icon.icns` - macOS application icon (512x512 or higher)
- `icon.ico` - Windows application icon (256x256 or higher)
- `icons/` - Linux icon files (various sizes)

### Certificates
- `entitlements.mac.plist` - macOS entitlements (already provided)

## Icon Requirements

### macOS (.icns)
- Recommended size: 512x512 or 1024x1024
- Format: ICNS
- Should include multiple resolutions

### Windows (.ico)
- Recommended size: 256x256
- Format: ICO
- Should include multiple resolutions (16x16, 32x32, 48x48, 256x256)

### Linux
Create an `icons/` directory with PNG files:
- 16x16.png
- 24x24.png
- 32x32.png
- 48x48.png
- 64x64.png
- 128x128.png
- 256x256.png
- 512x512.png

## Creating Icons

You can use online tools or image editors to create these icons from a source image:
1. Start with a high-resolution PNG (1024x1024 recommended)
2. Use tools like [IconGenerator](https://icongenerator.net/) for batch conversion
3. Or use command line tools like ImageMagick

## Note

The current configuration includes placeholder paths for icons. The build will work without them but the application will use default system icons.
