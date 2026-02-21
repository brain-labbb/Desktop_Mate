# Desktop Mate 项目结构设计

## 目录结构

```
desktop-mate/
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
├── docs/
│   ├── prd.md
│   ├── system-engineer-design.md
│   ├── project-structure.md
│   └── api.md
├── docker/
│   ├── Dockerfile.python
│   ├── Dockerfile.nodejs
│   └── docker-compose.dev.yml
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── index.ts
│   │   ├── ipc/
│   │   │   ├── handlers.ts
│   │   │   └── channels.ts
│   │   ├── services/
│   │   │   ├── FileService.ts
│   │   │   ├── LLMService.ts
│   │   │   └── SandboxService.ts
│   │   └── preload/
│   │       └── index.ts
│   ├── renderer/                # React 渲染进程
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── Chat/
│   │   │   ├── FileTree/
│   │   │   ├── DiffViewer/
│   │   │   └── TaskPanel/
│   │   ├── hooks/
│   │   ├── store/
│   │   └── styles/
│   └── rust/                   # Rust 原生模块
│       ├── Cargo.toml
│       ├── src/
│       │   ├── lib.rs
│       │   ├── file_indexer.rs
│       │   └── utils.rs
│       └── build.rs
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── electron.vite.config.ts
└── README.md
```

## 核心文件说明

### 系统工程师负责模块

#### `src/rust/file_indexer.rs`
- **功能**: 高性能文件索引
- **技术**: Rust + ignore crate + rayon
- **接口**: napi-rs FFI

#### `src/main/services/SandboxService.ts`
- **功能**: Docker 沙箱执行器
- **技术**: Node.js + dockerode
- **安全**: 资源限制 + 网络隔离

#### `docker/Dockerfile.python`
- **功能**: Python 执行环境
- **包含**: pandas, numpy, openpyxl 等

#### `docker/Dockerfile.nodejs`
- **功能**: Node.js 执行环境
- **包含**: TypeScript, 常用 npm 包

#### `.github/workflows/ci.yml`
- **功能**: CI/CD 流水线
- **包含**: 测试、构建、安全扫描

## 配置文件

### `package.json`
```json
{
  "name": "desktop-mate",
  "version": "0.1.0",
  "main": "dist/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "build:native": "cd src/rust && napi build --platform --release",
    "test": "vitest",
    "lint": "eslint .",
    "package": "electron-builder",
    "postinstall": "npm run build:native"
  },
  "dependencies": {
    "dockerode": "^4.0.0",
    "ignore": "^0.4.0"
  },
  "devDependencies": {
    "@napi-rs/cli": "^2.18.0",
    "@types/node": "^20.11.0",
    "electron": "^28.0.0",
    "electron-builder": "^24.9.0",
    "electron-vite": "^2.0.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0",
    "vitest": "^1.1.0"
  }
}
```

### `src/rust/Cargo.toml`
```toml
[package]
name = "desktop-mate-native"
version = "0.1.0"
edition = "2021"
crate-type = ["cdylib"]

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
napi = { version = "2.0", features = ["async"] }
napi-derive = "2.0"
ignore = "0.4"
rayon = "1.8"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

[build-dependencies]
napi-build = "2.0"
```

## 开发工作流

### 1. 环境配置
```bash
# Windows
.\scripts\setup.ps1

# macOS/Linux
./scripts/setup.sh
```

### 2. 启动开发服务器
```bash
npm run dev
```

### 3. 构建原生模块
```bash
npm run build:native
```

### 4. 运行测试
```bash
npm test
```

### 5. 打包应用
```bash
npm run package
```

## 技术决策记录 (ADR)

### ADR-001: 选择 Rust 实现文件索引器
- **决策**: 使用 Rust 而非 C++ 或 Go
- **理由**:
  - napi-rs 提供 TypeScript 友好的 FFI
  - 内存安全保证
  - rayon 提供简单的并行 API
  - 编译为动态库，无需额外运行时
- **替代方案**: C++ (node-addon-api), Go (golang-webassembly)

### ADR-002: 选择 Docker 而非 WASM 沙箱
- **决策**: 使用 Docker 作为代码执行沙箱
- **理由**:
  - 成熟的容器技术
  - 完整的系统隔离
  - 资源限制支持完善
  - 企业环境普遍采用
- **替代方案**: WASM (安全但功能受限), gVisor (更安全但复杂度高)

### ADR-003: 选择 GitHub Actions 而非 GitLab CI
- **决策**: 使用 GitHub Actions
- **理由**:
  - GitHub 原生集成
  - 丰富的 Actions 生态
  - 免费额度充足
  - 团队熟悉度高
- **替代方案**: GitLab CI, CircleCI, Travis CI

## 性能目标

| 模块 | 指标 | 目标值 | 测试方法 |
|------|------|--------|----------|
| 文件索引器 | 索引速度 | 10万文件 < 5s | 基准测试 |
| 文件索引器 | 内存占用 | < 200MB | 性能分析 |
| 沙箱执行器 | 首次启动 | < 3s | 计时测试 |
| 沙箱执行器 | 热启动 | < 500ms | 计时测试 |
| CI/CD | 构建时间 | < 10min | 流水线监控 |

## 安全考虑

### 文件索引器
- 过滤敏感文件路径
- 尊重 .gitignore 和系统目录
- 限制递归深度

### 沙箱执行器
- 网络默认隔离
- 资源限制强制执行
- 危险函数黑名单
- 超时保护

### CI/CD
- Secret 管理
- 依赖审计
- 静态代码分析
- 签名验证

---

**文档版本**: v1.0
**作者**: System Engineer
**日期**: 2026-02-13
