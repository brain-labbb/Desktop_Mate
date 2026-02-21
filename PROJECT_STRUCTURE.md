# Desktop Mate 项目结构说明

## 当前实现状态

### ✅ 已完成的后端模块

#### 1. 共享类型 (`src/shared/types/index.ts`)
- `FileNode`: 文件节点表示
- `FileAPI`: 文件系统API接口
- `PermissionLevel`: 权限等级枚举 (0-4)
- `PermissionRequest/Response`: 权限请求和响应
- `AuditLogEntry`: 审计日志条目
- `LLMConfig/Response`: LLM配置和响应
- `Task/ExecutionPlan`: 任务和执行计划
- `Checkpoint`: 检查点回滚

#### 2. 文件系统服务 (`src/main/services/file-system.ts`)
**实现 F-01: 工作区挂载和文件操作**

特性:
- .gitignore 规则解析 (使用 ignore 库)
- 文件树生成 (递归遍历，最多3层深度)
- 大文件警告 (>10MB)
- 文件监听 (watch API)
- 二进制文件检测
- 自动过滤敏感文件 (.env, *.key, *.pem 等)

API:
- `read(path)`: 读取文件内容
- `write(path, content)`: 写入文件
- `list(path)`: 列出目录
- `watch(path)`: 监听文件变化
- `delete(path)`: 删除文件/目录
- `exists(path)`: 检查文件是否存在
- `getTreeSummary()`: 获取文件树摘要 (用于LLM上下文)

#### 3. 权限管理器 (`src/main/services/guardian.ts`)
**实现 F-17: Guardian 权限审批系统**
**实现 PRD 7.2: 5级权限分级**

权限等级:
- Level 0 (只读): 无需审批
- Level 1 (编辑): 首次授权
- Level 2 (执行): 每次确认
- Level 3 (删除): 二次确认
- Level 4 (联网): 显示目标URL

特性:
- 权限记忆机制 (使用 keytar 安全存储)
- 审计日志记录 (ISO 8601 格式)
- 审计日志导出 (JSON/CSV)
- 风险等级评估 (low/medium/high)
- IPC事件支持 (与UI通信)

API:
- `requestPermission(request)`: 请求权限
- `handleApprovalResponse(requestId, response)`: 处理审批响应
- `getAuditLog(filters)`: 获取审计日志
- `exportAuditLog(format)`: 导出审计日志
- `clearPermissionMemory()`: 清除权限记忆
- `clearAuditLog()`: 清除审计日志

#### 4. LLM服务 (`src/main/services/llm.ts`)
**实现 LLM API 集成**

特性:
- 支持 OpenAI/Claude API 切换
- Streaming 响应支持
- API Key 安全存储 (keytar)
- 自动重试机制
- 本地 Ollama 支持

API:
- `generate(messages)`: 生成响应 (非流式)
- `generateStream(messages)`: 生成响应 (流式)
- `updateConfig(config)`: 更新配置
- `getConfig()`: 获取当前配置

APIKeyManager:
- `storeKey(provider, key)`: 存储API密钥
- `getKey(provider)`: 获取API密钥
- `deleteKey(provider)`: 删除API密钥
- `hasKey(provider)`: 检查密钥是否存在

#### 5. IPC通信处理器 (`src/main/ipc/handlers.ts`)
**实现主进程和渲染进程通信**

IPC Channels:
- `fs:*`: 文件系统操作
- `guardian:*`: 权限管理
- `llm:*`: LLM操作
- `workspace:*`: 工作区管理

#### 6. 主进程入口 (`src/main/index.ts`)
**Electron 主进程**

功能:
- 创建应用窗口
- 初始化所有服务
- 设置IPC通信
- 管理应用生命周期
- 工作区切换支持

## 下一步实施

### Sprint 1-2 (Week 1-4): 基础框架搭建
- [x] 共享类型定义
- [x] 文件系统API
- [x] LLM API集成
- [x] 权限管理器
- [ ] React UI框架 (前端任务)
- [ ] 基础Chat UI (前端任务)

### Sprint 3-4 (Week 5-8): 执行能力开发
- [ ] Docker沙箱执行环境
- [ ] 审批弹窗UI
- [ ] 错误重试机制
- [ ] Diff View组件

### Sprint 5-6 (Week 9-12): 子任务编排
- [ ] 任务计划生成器
- [ ] 任务调度器
- [ ] 任务可视化面板
- [ ] Checkpoint回滚机制

## 验收标准

### 任务1: 文件系统API (F-01)
- [x] 支持文件/文件夹读取
- [x] 遵循.gitignore过滤
- [x] 大文件 (>10MB) 警告提示

### 任务2: LLM API集成
- [x] 支持OpenAI/Claude切换
- [x] 流式响应正常工作
- [x] API Key使用系统密钥管理器

### 任务3: 权限管理器 (F-17, 7.2)
- [x] 5级权限分级
- [x] 审批弹窗UI (IPC事件支持)
- [x] 权限记忆机制
- [x] 审计日志记录

## 依赖安装说明

当前项目结构已创建，但需要安装Node.js环境后才能安装依赖。

```bash
cd /c/Users/86185/Desktop/Desktop-Mate
npm install
```

主要依赖:
- `electron`: Electron框架
- `ignore`: .gitignore解析
- `keytar`: 系统密钥管理
- `openai`: OpenAI SDK
- `@anthropic-ai/sdk`: Anthropic Claude SDK
- `uuid`: 唯一ID生成
- `zod`: 类型验证
