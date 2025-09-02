# GitHub Actions 环境变量配置完整指南

## 1. 在工作流文件中直接设置 ✅ (我们已经使用)

```yaml
# 在步骤级别设置
- name: Build Electron app
  run: npm run electron:build
  env:
    CSC_IDENTITY_AUTO_DISCOVERY: false
    CSC_LINK: ""
    CSC_KEY_PASSWORD: ""
    NODE_ENV: production

# 在作业级别设置
jobs:
  build:
    runs-on: ubuntu-latest
    env:
      NODE_ENV: production
      DEBUG: false
    steps:
      - name: Build
        run: npm run build

# 在工作流级别设置
name: Build App
env:
  NODE_ENV: production

jobs:
  build:
    # ...
```

## 2. 使用 GitHub Secrets（敏感信息） 🔐

### 2.1 添加 Secrets 的步骤：

1. **进入仓库设置**：

   - 在 GitHub 仓库页面点击 "Settings" 标签
   - 在左侧菜单找到 "Secrets and variables"
   - 点击 "Actions"

2. **添加新的 Secret**：

   - 点击 "New repository secret"
   - 输入 Secret 名称（如：`APPLE_ID`）
   - 输入 Secret 值
   - 点击 "Add secret"

3. **在工作流中使用**：

```yaml
- name: Build and Sign
  run: npm run electron:build
  env:
    APPLE_ID: ${{ secrets.APPLE_ID }}
    APPLE_ID_PASSWORD: ${{ secrets.APPLE_ID_PASSWORD }}
    CSC_LINK: ${{ secrets.CSC_LINK }}
    CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
```

### 2.2 常用的 Secrets：

```yaml
# 代码签名相关
CSC_LINK: ${{ secrets.CSC_LINK }} # Windows证书
CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }} # 证书密码
APPLE_ID: ${{ secrets.APPLE_ID }} # Apple ID
APPLE_ID_PASSWORD: ${{ secrets.APPLE_ID_PASSWORD }} # App专用密码

# API密钥
GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} # 自动提供
NPM_TOKEN: ${{ secrets.NPM_TOKEN }} # NPM发布
```

## 3. 使用 GitHub Variables（非敏感信息） 📝

### 3.1 添加 Variables 的步骤：

1. **进入仓库设置**：

   - Settings → Secrets and variables → Actions
   - 点击 "Variables" 标签

2. **添加新 Variable**：

   - 点击 "New repository variable"
   - 输入名称和值
   - 点击 "Add variable"

3. **在工作流中使用**：

```yaml
- name: Build
  run: npm run build
  env:
    APP_VERSION: ${{ vars.APP_VERSION }}
    BUILD_ENVIRONMENT: ${{ vars.BUILD_ENVIRONMENT }}
```

## 4. 动态环境变量 🔄

```yaml
- name: Set dynamic environment
  run: |
    echo "BUILD_DATE=$(date)" >> $GITHUB_ENV
    echo "COMMIT_SHA=${GITHUB_SHA:0:7}" >> $GITHUB_ENV

- name: Use dynamic vars
  run: |
    echo "Built on: $BUILD_DATE"
    echo "Commit: $COMMIT_SHA"
```

## 5. 条件环境变量 🔀

```yaml
- name: Set environment based on branch
  run: |
    if [ "${{ github.ref }}" == "refs/heads/main" ]; then
      echo "NODE_ENV=production" >> $GITHUB_ENV
    else
      echo "NODE_ENV=development" >> $GITHUB_ENV
    fi
```

## 6. 平台特定环境变量 🖥️

```yaml
- name: Set platform-specific vars (Unix)
  if: runner.os != 'Windows'
  run: echo "SHELL_TYPE=bash" >> $GITHUB_ENV

- name: Set platform-specific vars (Windows)
  if: runner.os == 'Windows'
  run: echo "SHELL_TYPE=powershell" >> $env:GITHUB_ENV
```

## 7. 我们项目的完整配置示例 🚀

当前配置 (已实现):

```yaml
- name: Build Electron app
  run: npm run electron:build
  env:
    # 禁用代码签名
    CSC_IDENTITY_AUTO_DISCOVERY: false
    CSC_LINK: ""
    CSC_KEY_PASSWORD: ""
    # 跳过公证
    APPLE_ID: ""
    APPLE_ID_PASSWORD: ""
```

如果需要代码签名 (未来可选):

```yaml
- name: Build Electron app
  run: npm run electron:build
  env:
    # 启用代码签名
    CSC_IDENTITY_AUTO_DISCOVERY: true
    CSC_LINK: ${{ secrets.CSC_LINK }}
    CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
    # Apple公证
    APPLE_ID: ${{ secrets.APPLE_ID }}
    APPLE_ID_PASSWORD: ${{ secrets.APPLE_ID_PASSWORD }}
    APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
```

## 8. 环境变量的优先级 📊

1. **步骤级别** (最高优先级)
2. **作业级别**
3. **工作流级别**
4. **仓库默认环境变量**
5. **GitHub 默认环境变量** (最低优先级)

## 9. 调试环境变量 🐛

```yaml
- name: Debug environment
  run: |
    echo "Node version: $NODE_VERSION"
    echo "Runner OS: ${{ runner.os }}"
    echo "GitHub ref: ${{ github.ref }}"
    env | grep -E "(CSC|APPLE)" || true
```

## 10. 安全注意事项 🔒

- ✅ **DO**: 使用 Secrets 存储敏感信息
- ✅ **DO**: 使用 Variables 存储公开配置
- ❌ **DON'T**: 在日志中打印敏感环境变量
- ❌ **DON'T**: 将密钥硬编码在工作流文件中

## 常用内置环境变量 🏗️

```yaml
${{ github.sha }}           # 提交SHA
${{ github.ref }}           # 分支或标签引用
${{ github.repository }}    # 仓库名称
${{ github.actor }}         # 触发者用户名
${{ runner.os }}            # 运行器操作系统
${{ runner.arch }}          # 运行器架构
```

## 🔧 GitHub Personal Access Token 错误解决方案

### 🚨 问题分析

错误信息：`GitHub Personal Access Token is not set, neither programmatically, nor using env "GH_TOKEN"`

这是因为 electron-builder 在 GitHub Actions 环境中检测到 CI，自动尝试发布到 GitHub Releases，但没有找到必要的 token。

### ✅ 解决方案选择

#### 方案 1: 禁用自动发布 (推荐)

需要在 `package.json` 的 `build` 配置中添加 `"publish": null`：

```json
{
  "build": {
    "appId": "com.pdfprocessor.app",
    "productName": "PDF图像处理器",
    "copyright": "Copyright © 2024",
    "artifactName": "${productName}-${version}-${arch}.${ext}",
    "directories": {
      "output": "dist-electron"
    },
    "files": ["dist/**/*", "node_modules/**/*"],
    "publish": null, // ← 添加这一行
    "mac": {
      // ... 现有配置
    },
    "win": {
      // ... 现有配置
    }
  }
}
```

#### 方案 2: 设置 GitHub Token

在 `.github/workflows/build-electron.yml` 中添加：

```yaml
<code_block_to_apply_changes_from>
```

### 🎯 推荐使用方案 1 的原因

1. **简单直接** - 只需要一行配置
2. **避免意外发布** - 防止每次构建都创建 release
3. **更好的控制** - 我们已经有专门的 release 工作流

### 📋 修改步骤

请在你的 `package.json` 文件中，在 `build` 配置对象中添加 `"publish": null` 这一行，位置在 `files` 数组之后，`mac` 配置之前。

修改后重新运行构建命令应该就会成功了！🚀

### 🎉 当前构建状态

你的构建已经非常接近成功：

- ✅ Web 资源构建完成
- ✅ Electron 应用打包完成
- ✅ DMG 和 ZIP 文件已生成
- ❌ 只是在发布阶段遇到 token 问题

添加 `"publish": null` 后就完全解决了！
