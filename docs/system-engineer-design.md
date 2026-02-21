# 系统工程师技术设计文档

## 概述

本文档描述 Desktop Mate 项目中系统工程师负责的核心模块技术设计。

---

## 1. Rust 文件索引器 (SYS-1)

### 1.1 设计目标

| 指标 | 目标值 | 备注 |
|------|--------|------|
| 索引速度 | 10万文件 < 5秒 | 在 MacBook Pro M1 上测试 |
| 内存占用 | < 200MB | 峰值内存 |
| 并行度 | 自动检测CPU核心数 | 使用 rayon |
| 最大深度 | 3层 | 可配置 |

### 1.2 技术栈

```toml
[dependencies]
ignore = "0.4"
rayon = "1.8"
napi = { version = "2.0", features = ["async"] }
napi-derive = "2.0"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
```

### 1.3 数据结构设计

```rust
#[derive(Serialize, Deserialize, Debug)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<u64>,
    pub file_type: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct IndexOptions {
    pub max_depth: Option<usize>,
    pub max_file_size: Option<u64>,
    pub follow_links: bool,
    pub respect_gitignore: bool,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct IndexResult {
    pub files: Vec<FileNode>,
    pub total_count: usize,
    pub total_size: u64,
    pub duration_ms: u64,
}
```

### 1.4 核心算法

```rust
use ignore::{Walk, WalkBuilder};
use rayon::prelude::*;
use std::time::Instant;

pub fn index_directory(path: &str, options: IndexOptions) -> Result<IndexResult> {
    let start = Instant::now();

    let mut walker = WalkBuilder::new(path);

    if options.respect_gitignore {
        walker.git_ignore(true);
        walker.git_ignore_rules(true);
    }

    if let Some(depth) = options.max_depth {
        walker.max_depth(depth);
    }

    if !options.follow_links {
        walker.follow_links(false);
    }

    let files: Vec<FileNode> = walker
        .build_parallel()
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let metadata = entry.metadata().ok()?;

            // 过滤大文件
            if let Some(max_size) = options.max_file_size {
                if metadata.len() > max_size && !metadata.is_dir() {
                    return None;
                }
            }

            // 过滤二进制文件（简单扩展名检测）
            let path = entry.path();
            if let Some(ext) = path.extension() {
                let ext = ext.to_string_lossy().to_lowercase();
                if matches!(ext.as_str(), "exe" | "dll" | "so" | "dylib" | "bin") {
                    return None;
                }
            }

            Some(FileNode {
                name: entry.file_name().to_string_lossy().into(),
                path: path.to_string_lossy().into(),
                is_dir: metadata.is_dir(),
                size: metadata.len(),
                modified: metadata.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs()),
                file_type: path.extension().map(|e| e.to_string_lossy().into()),
            })
        })
        .collect();

    let duration = start.elapsed();
    let total_size = files.iter().map(|f| f.size).sum();
    let total_count = files.len();

    Ok(IndexResult {
        files,
        total_count,
        total_size,
        duration_ms: duration.as_millis() as u64,
    })
}
```

### 1.5 FFI 绑定 (napi-rs)

```rust
use napi_derive::napi;

#[napi]
pub fn index_directory_sync(path: String, options: Option<IndexOptions>) -> Result<IndexResult> {
    let opts = options.unwrap_or_default();
    index_directory(&path, opts)
}

#[napi]
pub async fn index_directory_async(path: String, options: Option<IndexOptions>) -> Result<IndexResult> {
    let opts = options.unwrap_or_default();
    tokio::task::spawn_blocking(move || {
        index_directory(&path, opts)
    }).await?
}
```

### 1.6 Node.js 集成

```typescript
import { indexDirectorySync, indexDirectoryAsync } from './native/file-indexer';

interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified?: number;
  fileType?: string;
}

interface IndexOptions {
  maxDepth?: number;
  maxFileSize?: number;
  followLinks?: boolean;
  respectGitignore?: boolean;
}

interface IndexResult {
  files: FileNode[];
  totalCount: number;
  totalSize: number;
  durationMs: number;
}

// 同步调用
const result = indexDirectorySync('/path/to/dir', {
  maxDepth: 3,
  maxFileSize: 10 * 1024 * 1024, // 10MB
  respectGitignore: true,
});

// 异步调用
const resultAsync = await indexDirectoryAsync('/path/to/dir');
```

---

## 2. Docker 沙箱执行器 (F-03)

### 2.1 设计目标

| 指标 | 目标值 | 备注 |
|------|--------|------|
| 首次启动 | < 3秒 | 包含镜像拉取 |
| 热启动 | < 500ms | 容器复用 |
| 资源限制 | 1GB RAM, 2 CPU | 默认配置 |
| 网络隔离 | 默认禁用 | 可选启用 |

### 2.2 技术栈

```json
{
  "dependencies": {
    "dockerode": "^4.0.0",
    "tar-stream": "^3.1.7"
  }
}
```

### 2.3 基础镜像设计

**Dockerfile (Python 3.11)**

```dockerfile
FROM python:3.11-slim

# 安装常用包
RUN pip install --no-cache-dir \
    pandas \
    numpy \
    matplotlib \
    openpyxl \
    python-pptx \
    python-docx \
    requests

# 设置工作目录
WORKDIR /workspace

# 安全配置
RUN useradd -m -u 1000 agent && \
    chown -R agent:agent /workspace

USER agent

# 默认网络隔离
--network=none
```

**Dockerfile (Node.js 20)**

```dockerfile
FROM node:20-slim

# 安装常用包
RUN npm install -g \
    @types/node \
    typescript

# 设置工作目录
WORKDIR /workspace

# 安全配置
RUN useradd -m -u 1000 agent && \
    chown -R agent:agent /workspace

USER agent
```

### 2.4 核心模块设计

```typescript
import Docker from 'dockerode';

interface SandboxConfig {
  image: string;
  memory: number; // MB
  cpu: number;
  network: boolean;
  timeout: number; // ms
}

interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}

class SandboxExecutor {
  private docker: Docker;
  private containerPool: Map<string, Docker.Container>;

  constructor() {
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
    this.containerPool = new Map();
  }

  async executeCode(
    code: string,
    language: 'python' | 'nodejs',
    config: Partial<SandboxConfig> = {}
  ): Promise<ExecutionResult> {
    const finalConfig: SandboxConfig = {
      image: language === 'python' ? 'desktop-mate-python:latest' : 'desktop-mate-nodejs:latest',
      memory: 1024,
      cpu: 2,
      network: false,
      timeout: 30000,
      ...config
    };

    // 检查容器池中是否有可用容器
    const container = await this.getOrCreateContainer(finalConfig);

    // 执行代码
    const exec = await container.exec({
      Cmd: this.getCommand(language, code),
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ Detach: false });
    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        exec.stop().catch(() => {});
        reject(new Error('Execution timeout'));
      }, finalConfig.timeout);

      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', async () => {
        clearTimeout(timeout);
        const info = await exec.inspect();
        resolve({
          stdout: chunks.toString('utf-8'),
          stderr: '',
          exitCode: info.ExitCode || 0,
          duration: 0,
        });
      });
    });
  }

  private getCommand(language: string, code: string): string[] {
    if (language === 'python') {
      return ['python', '-c', code];
    } else {
      return ['node', '-e', code];
    }
  }

  private async getOrCreateContainer(config: SandboxConfig): Promise<Docker.Container> {
    const poolKey = `${config.image}-${config.memory}-${config.cpu}`;

    if (this.containerPool.has(poolKey)) {
      return this.containerPool.get(poolKey)!;
    }

    const container = await this.docker.createContainer({
      Image: config.image,
      Memory: config.memory * 1024 * 1024,
      CpuQuota: config.cpu * 100000,
      NetworkDisabled: !config.network,
      HostConfig: {
        AutoRemove: false,
      },
    });

    await container.start();
    this.containerPool.set(poolKey, container);

    return container;
  }

  async cleanup(): Promise<void> {
    for (const [key, container] of this.containerPool) {
      await container.remove({ force: true });
      this.containerPool.delete(key);
    }
  }
}
```

### 2.5 安全限制

| 限制类型 | 实现方式 | 目的 |
|---------|---------|------|
| 文件系统隔离 | 容器内无挂载卷 | 防止访问宿主机 |
| 网络隔离 | `--network=none` | 防止数据泄露 |
| 资源限制 | `--memory`, `--cpu-quota` | 防止资源耗尽 |
| 运行时限制 | 超时自动终止 | 防止无限循环 |
| 用户隔离 | 非 root 用户运行 | 防止权限提升 |

### 2.6 危险函数黑名单

```typescript
const DANGEROUS_PATTERNS = [
  /\beval\s*\(/,
  /\bexec\s*\(/,
  /\b__import__\s*\(\s*['"]os['"]/,
  /\bsubprocess\.\w+(?!allowed_subprocess)/,
  /\bfs\.rm\s*\(/,
  /\bfs\.unlink\s*\(/,
  /\brimraf\s*\(/,
];

function validateCode(code: string): { safe: boolean; reason?: string } {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      return {
        safe: false,
        reason: `Dangerous function detected: ${pattern.source}`,
      };
    }
  }
  return { safe: true };
}
```

---

## 3. CI/CD 流水线

### 3.1 GitHub Actions 工作流

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
        node-version: [18.x, 20.x]

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install dependencies
        run: |
          npm ci
          npm run build:native

      - name: Run linter
        run: npm run lint

      - name: Run tests
        run: npm run test -- --coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info

  security-scan:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Run npm audit
        run: npm audit --audit-level=moderate

      - name: Run Snyk security scan
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}

  build:
    needs: [test, security-scan]
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20.x

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install dependencies
        run: |
          npm ci
          npm run build:native

      - name: Build application
        run: npm run build

      - name: Package application
        run: npm run package

      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: desktop-mate-${{ matrix.os }}
          path: dist/*
```

### 3.2 自动化发布流程

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ${{ matrix.os }}

    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
        include:
          - os: macos-latest
            artifact_name: Desktop-Mate.dmg
          - os: windows-latest
            artifact_name: Desktop-Mate-setup.exe
          - os: ubuntu-latest
            artifact_name: Desktop-Mate.AppImage

    steps:
      - uses: actions/checkout@v4

      - name: Build and package
        run: |
          npm ci
          npm run build:native
          npm run build
          npm run package

      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: ${{ matrix.artifact_name }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## 4. 性能基准测试

### 4.1 测试场景

| 场景 | 文件数 | 目录深度 | 平均文件大小 | 预期时间 |
|------|--------|----------|--------------|----------|
| 小型项目 | 1,000 | 2-3 | 50KB | < 500ms |
| 中型项目 | 10,000 | 3-4 | 100KB | < 2s |
| 大型项目 | 100,000 | 4-5 | 200KB | < 5s |

### 4.2 基准测试代码

```rust
#[cfg(test)]
mod benchmarks {
    use super::*;
    use std::time::Instant;

    #[test]
    fn benchmark_index_10k_files() {
        let path = "/test/data/10k-files";
        let options = IndexOptions {
            max_depth: Some(3),
            ..Default::default()
        };

        let start = Instant::now();
        let result = index_directory(path, options).unwrap();
        let duration = start.elapsed();

        assert_eq!(result.total_count, 10_000);
        assert!(duration.as_secs() < 2);
    }

    #[test]
    fn benchmark_index_100k_files() {
        let path = "/test/data/100k-files";
        let options = IndexOptions {
            max_depth: Some(3),
            ..Default::default()
        };

        let start = Instant::now();
        let result = index_directory(path, options).unwrap();
        let duration = start.elapsed();

        assert_eq!(result.total_count, 100_000);
        assert!(duration.as_secs() < 5);
    }
}
```

---

## 5. 环境配置脚本

### 5.1 Windows (setup.ps1)

```powershell
# Setup script for Windows developers

Write-Host "Setting up Desktop Mate development environment..." -ForegroundColor Green

# Check prerequisites
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

$rustc = Get-Command rustc -ErrorAction SilentlyContinue
$node = Get-Command node -ErrorAction SilentlyContinue
$docker = Get-Command docker -ErrorAction SilentlyContinue

if (-not $rustc) {
    Write-Host "Rust not found. Installing..." -ForegroundColor Red
    winget install Rustlang.Rust.MSVC
}

if (-not $node) {
    Write-Host "Node.js not found. Installing..." -ForegroundColor Red
    winget install OpenJS.NodeJS.LTS
}

if (-not $docker) {
    Write-Host "Docker not found. Please install Docker Desktop manually." -ForegroundColor Red
    exit 1
}

# Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm ci

# Build native modules
Write-Host "Building native modules..." -ForegroundColor Yellow
npm run build:native

# Build Docker images
Write-Host "Building Docker images..." -ForegroundColor Yellow
docker build -t desktop-mate-python:latest -f docker/Dockerfile.python .
docker build -t desktop-mate-nodejs:latest -f docker/Dockerfile.nodejs .

Write-Host "Setup complete!" -ForegroundColor Green
Write-Host "Run 'npm run dev' to start development server."
```

### 5.2 macOS/Linux (setup.sh)

```bash
#!/bin/bash
# Setup script for macOS/Linux developers

echo "Setting up Desktop Mate development environment..."

# Check prerequisites
command -v rustc >/dev/null 2>&1 || {
    echo "Rust not found. Installing..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
    source $HOME/.cargo/env
}

command -v node >/dev/null 2>&1 || {
    echo "Node.js not found. Installing..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install node
    else
        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
}

command -v docker >/dev/null 2>&1 || {
    echo "Docker not found. Please install Docker manually."
    exit 1
}

# Install dependencies
echo "Installing dependencies..."
npm ci

# Build native modules
echo "Building native modules..."
npm run build:native

# Build Docker images
echo "Building Docker images..."
docker build -t desktop-mate-python:latest -f docker/Dockerfile.python .
docker build -t desktop-mate-nodejs:latest -f docker/Dockerfile.nodejs .

echo "Setup complete!"
echo "Run 'npm run dev' to start development server."
```

---

## 6. 技术风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| Rust FFI 兼容性问题 | 中 | 高 | 使用成熟的 napi-rs，充分测试跨平台 |
| Docker 环境差异 | 中 | 中 | 提供统一的基础镜像，文档化环境要求 |
| 文件索引性能不达标 | 低 | 高 | 早期基准测试，预留优化时间 |
| 沙箱逃逸漏洞 | 低 | 高 | 定期安全审计，使用成熟容器技术 |

---

## 7. 验收标准清单

### SYS-1: Rust 文件索引器

- [ ] 10万文件索引 < 5秒
- [ ] 内存占用 < 200MB
- [ ] 通过 napi-rs FFI 调用
- [ ] 正确识别 .gitignore 规则
- [ ] 过滤大文件 (>10MB)
- [ ] 单元测试覆盖率 > 80%

### Docker 沙箱

- [ ] 代码在隔离环境执行
- [ ] 沙箱启动 < 3秒 (首次), < 500ms (热启动)
- [ ] 无法逃逸沙箱 (渗透测试)
- [ ] 资源限制生效 (1GB RAM, 2 CPU)
- [ ] 网络隔离默认启用
- [ ] 危险函数黑名单检测

### CI/CD 流水线

- [ ] PR 触发自动构建
- [ ] 生成安装包 (.dmg/.exe/.AppImage)
- [ ] 测试覆盖率 > 80%
- [ ] 安全扫描通过
- [ ] 跨平台构建 (macOS/Windows/Linux)

---

**文档版本**: v1.0
**作者**: System Engineer
**日期**: 2026-02-13
