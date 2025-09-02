#!/bin/bash

# PDF处理工具开发环境启动脚本
# 自动启动前端和后端服务器

set -e  # 遇到错误时退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 打印带颜色的消息
print_message() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# 打印标题
print_title() {
    echo
    print_message $CYAN "======================================"
    print_message $CYAN "    PDF 图像处理工具 - 开发环境"
    print_message $CYAN "======================================"
    echo
}

# 检查依赖
check_dependencies() {
    print_message $BLUE "🔍 检查环境依赖..."
    
    # 检查 Node.js
    if ! command -v node &> /dev/null; then
        print_message $RED "❌ 错误: 未找到 Node.js，请先安装 Node.js (>=20.0.0)"
        exit 1
    fi
    
    local node_version=$(node -v | sed 's/v//')
    print_message $GREEN "✅ Node.js 版本: $node_version"
    
    # 检查 npm
    if ! command -v npm &> /dev/null; then
        print_message $RED "❌ 错误: 未找到 npm"
        exit 1
    fi
    
    local npm_version=$(npm -v)
    print_message $GREEN "✅ npm 版本: $npm_version"
    
    # 检查 node_modules
    if [ ! -d "node_modules" ]; then
        print_message $YELLOW "⚠️  未找到 node_modules，正在安装依赖..."
        npm install
    else
        print_message $GREEN "✅ 依赖已安装"
    fi
    
    echo
}

# 检查端口是否被占用
check_port() {
    local port=$1
    local service_name=$2
    
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        print_message $YELLOW "⚠️  端口 $port 已被占用 ($service_name)"
        print_message $YELLOW "   请先停止相关服务或更改端口配置"
        return 1
    else
        print_message $GREEN "✅ 端口 $port 可用 ($service_name)"
        return 0
    fi
}

# 检查所有端口
check_ports() {
    print_message $BLUE "🔍 检查端口占用情况..."
    
    local backend_port=3001
    local frontend_port=5173
    local ports_ok=true
    
    if ! check_port $backend_port "后端API服务器"; then
        ports_ok=false
    fi
    
    if ! check_port $frontend_port "前端开发服务器"; then
        ports_ok=false
    fi
    
    if [ "$ports_ok" = false ]; then
        print_message $RED "❌ 端口检查失败"
        read -p "是否强制启动？现有服务可能会被终止 (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_message $YELLOW "👋 已取消启动"
            exit 1
        fi
        
        # 尝试终止占用端口的进程
        print_message $YELLOW "🔄 尝试释放端口..."
        lsof -ti:$backend_port | xargs kill -9 2>/dev/null || true
        lsof -ti:$frontend_port | xargs kill -9 2>/dev/null || true
        sleep 2
    fi
    
    echo
}

# 启动后端服务器
start_backend() {
    print_message $PURPLE "🚀 启动后端 API 服务器..."
    print_message $CYAN "   端口: 3001"
    print_message $CYAN "   健康检查: http://localhost:3001/api/health"
    
    # 使用 nodemon 启动后端，在后台运行
    npm run server &
    BACKEND_PID=$!
    
    # 等待后端启动
    print_message $YELLOW "⏳ 等待后端服务启动..."
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
            print_message $GREEN "✅ 后端服务启动成功!"
            break
        fi
        
        sleep 1
        attempt=$((attempt + 1))
        printf "."
    done
    
    if [ $attempt -eq $max_attempts ]; then
        print_message $RED "❌ 后端服务启动超时"
        kill $BACKEND_PID 2>/dev/null || true
        exit 1
    fi
    
    echo
}

# 启动前端开发服务器
start_frontend() {
    print_message $PURPLE "🎨 启动前端开发服务器..."
    print_message $CYAN "   端口: 5173"
    print_message $CYAN "   应用地址: http://localhost:5173"
    
    # 启动前端开发服务器
    npm run dev &
    FRONTEND_PID=$!
    
    echo
}

# 清理函数
cleanup() {
    print_message $YELLOW "\n🛑 正在停止服务..."
    
    if [ -n "$BACKEND_PID" ]; then
        print_message $BLUE "   停止后端服务器 (PID: $BACKEND_PID)"
        kill $BACKEND_PID 2>/dev/null || true
    fi
    
    if [ -n "$FRONTEND_PID" ]; then
        print_message $BLUE "   停止前端服务器 (PID: $FRONTEND_PID)"
        kill $FRONTEND_PID 2>/dev/null || true
    fi
    
    # 确保端口被释放
    lsof -ti:3001 | xargs kill -9 2>/dev/null || true
    lsof -ti:5173 | xargs kill -9 2>/dev/null || true
    
    print_message $GREEN "✅ 所有服务已停止"
    print_message $CYAN "👋 感谢使用 PDF 图像处理工具!"
    exit 0
}

# 监控服务状态
monitor_services() {
    print_message $GREEN "🎉 开发环境启动成功!"
    echo
    print_message $CYAN "📊 服务状态："
    print_message $CYAN "   后端 API: http://localhost:3001/api/health"
    print_message $CYAN "   前端应用: http://localhost:5173"
    echo
    print_message $YELLOW "💡 使用提示："
    print_message $YELLOW "   - 前端会自动重载代码更改"
    print_message $YELLOW "   - 后端使用 nodemon 自动重启"
    print_message $YELLOW "   - 按 Ctrl+C 停止所有服务"
    echo
    print_message $BLUE "📱 正在监控服务状态..."
    echo
    
    # 每10秒检查一次服务状态
    while true; do
        sleep 10
        
        # 检查后端状态
        if ! kill -0 $BACKEND_PID 2>/dev/null; then
            print_message $RED "❌ 后端服务异常停止"
            cleanup
        fi
        
        # 检查前端状态
        if ! kill -0 $FRONTEND_PID 2>/dev/null; then
            print_message $RED "❌ 前端服务异常停止"
            cleanup
        fi
        
        # 静默输出，表示服务正常
        printf "."
    done
}

# 信号处理
trap cleanup SIGINT SIGTERM

# 主函数
main() {
    print_title
    check_dependencies
    check_ports
    start_backend
    start_frontend
    monitor_services
}

# 如果直接运行此脚本
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
