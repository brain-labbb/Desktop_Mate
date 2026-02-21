# Desktop Mate

An open-source, self-hostable desktop AI Agent that brings the power of AI directly to your local workspace. 
While Claude cowork is optimized for macOS and typically requires WSL for Windows users, this project offers native Windows support, eliminating the need for a Linux environment or extra setup.

## Features

- **Easy Windows Install**: Runs natively on Windows without needing WSL or Linux.
- **Minimalist Design**: A clean, distraction-free layout with a warm, cream-paper texture.
- **File System API** (F-01): Workspace mounting with .gitignore support
- **Permission Management** (F-17): 5-level permission grading with Guardian
- **LLM Integration**: Support for OpenAI/Claude/Ollama with streaming responses
- **Secure API Key Storage**: Using system keychain (keytar)

## Tech Stack

- **Frontend**: Electron + React + TailwindCSS
- **Backend**: Node.js 20+
- **AI**: LangChain.js + OpenAI/Claude API
- **Security**: Docker Sandbox + Guardian permission system
- **Storage**: SQLite + LevelDB

## Project Structure

```
src/
├── main/              # Electron main process
│   ├── services/       # Core services
│   │   ├── file-system.ts    # File system operations
│   │   ├── guardian.ts        # Permission manager
│   │   └── llm.ts            # LLM integration
│   ├── ipc/            # IPC handlers
│   └── index.ts        # Main entry point
├── renderer/          # React UI (to be implemented)
└── shared/            # Shared types and utilities
    └── types/         # TypeScript definitions
```

## Installation

### Prerequisites

- Node.js 20+
- npm or yarn

### Setup

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

## API Reference

### File System Service

```typescript
import { createFileSystemService } from './src/main/services/file-system';

const fs = createFileSystemService({
  workspaceRoot: '/path/to/workspace',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  useGitIgnore: true
});

// Read file
const content = await fs.read('src/index.ts');

// List directory
const files = await fs.list('.');

// Get tree summary
const summary = await fs.getTreeSummary();
```

### Guardian Permission Manager

```typescript
import { Guardian, PermissionLevel } from './src/main/services/guardian';

const guardian = new Guardian('user_id');

// Request permission
const approved = await guardian.requestPermission({
  level: PermissionLevel.EDIT,
  action: 'write_file',
  target: 'src/index.ts'
});

// Get audit log
const logs = guardian.getAuditLog();
```

### LLM Service

```typescript
import { createLLMService, APIKeyManager } from './src/main/services/llm';

// Store API key
await APIKeyManager.storeKey('openai', 'sk-...');

// Create service
const llm = await createLLMService({
  provider: 'openai',
  model: 'gpt-4o',
  temperature: 0.7
});

// Generate
const response = await llm.generate([
  { role: 'user', content: 'Hello, Desktop Mate!' }
]);

// Stream
for await (const chunk of llm.generateStream(messages)) {
  console.log(chunk);
}
```

## License

MIT

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.
