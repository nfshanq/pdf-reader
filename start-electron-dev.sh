#!/bin/bash

# PDF处理器 Electron 开发模式启动脚本

echo "🚀 启动 PDF处理器 Electron 开发模式"
echo ""

# 检查Vite服务器是否运行
echo "📡 检查Vite开发服务器状态..."
if curl -s http://localhost:5173 > /dev/null; then
    echo "✅ Vite开发服务器正在运行 (http://localhost:5173)"
else
    echo "❌ Vite开发服务器未运行，正在启动..."
    npm run dev &
    VITE_PID=$!
    echo "⏳ 等待Vite服务器启动..."
    sleep 3
    
    # 再次检查
    if curl -s http://localhost:5173 > /dev/null; then
        echo "✅ Vite开发服务器已启动"
    else
        echo "❌ 无法启动Vite服务器，请检查端口5173是否被占用"
        exit 1
    fi
fi

echo ""
echo "🔧 编译Electron主进程..."
npm run build:main

if [ $? -eq 0 ]; then
    echo "✅ 编译完成"
else
    echo "❌ 编译失败"
    exit 1
fi

echo ""
echo "⚡ 启动Electron应用..."
echo "   - 环境: 开发模式"
echo "   - 前端: http://localhost:5173"
echo "   - 开发者工具: 自动打开"
echo ""

# 设置开发环境变量并启动Electron
ELECTRON_IS_DEV=true NODE_ENV=development npx electron .
