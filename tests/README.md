# Desktop Mate Test Suite

This directory contains all tests for the Desktop Mate project.

## Directory Structure

```
tests/
├── unit/               # Unit tests
│   └── services/        # Service unit tests
│       ├── file-system.test.ts
│       ├── guardian.test.ts
│       └── llm.test.ts
├── integration/         # Integration tests
├── e2e/               # End-to-end tests (Playwright)
├── security/           # Security tests
│   ├── sandbox-escape.test.ts
│   └── api-key-leakage.test.ts
├── mocks/             # Mock data and utilities
│   ├── fs.mock.ts
│   └── llm.mock.ts
├── setup.ts           # Test setup file
└── README.md         # This file
```

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm test -- --watch
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Run Tests with UI
```bash
npm run test:ui
```

### Run Specific Test File
```bash
npm test -- file-system.test.ts
```

### Run Security Tests Only
```bash
npm test -- security
```

## Test Coverage Targets

- Statements: 80%
- Branches: 75%
- Functions: 80%
- Lines: 80%

## Writing Tests

### Unit Tests

Unit tests should be fast, isolated, and test individual functions/classes.

```typescript
import { describe, it, expect } from 'vitest';
import { MyService } from '../../src/main/services/my-service';

describe('MyService', () => {
  it('should do something', () => {
    const service = new MyService();
    expect(service.doSomething()).toBe('expected result');
  });
});
```

### Integration Tests

Integration tests should test how multiple modules work together.

```typescript
import { describe, it, expect } from 'vitest';
import { FileSystemService } from '../../src/main/services/file-system';
import { Guardian } from '../../src/main/services/guardian';

describe('File System + Guardian Integration', () => {
  it('should require permission for file writes', async () => {
    // Test interaction between services
  });
});
```

### Security Tests

Security tests should verify that security measures are in place.

```typescript
import { describe, it, expect } from 'vitest';

describe('Security: File Access Control', () => {
  it('should block access to sensitive files', () => {
    // Test security constraints
  });
});
```

## Mock Data

Mock data is located in the `tests/mocks/` directory.

### Using Mocks

```typescript
import { mockFileSystem, getMockFileContent } from '../mocks/fs.mock';

// Initialize mock file system
initMockFileSystem();

// Get mock file content
const content = getMockFileContent('package.json');
```

## CI/CD Integration

Tests run automatically on:
- Every pull request
- Every push to main branch
- Before releases

## Test Guidelines

1. **Keep tests fast**: Unit tests should run in milliseconds
2. **Keep tests isolated**: Each test should be independent
3. **Use descriptive names**: Test names should describe what is being tested
4. **Test edge cases**: Don't just test the happy path
5. **Mock external dependencies**: Don't make real API calls in unit tests
6. **Clean up after tests**: Use `afterEach` to clean up resources

## Security Testing

Security tests verify:
- Sandbox escape prevention
- API key leakage prevention
- File access control
- Network access control
- Dangerous function blocking

## Troubleshooting

### Tests are timing out

Increase timeout in test:

```typescript
it('slow test', async () => {
  // ...
}, 30000); // 30 second timeout
```

### Tests are failing in CI but not locally

Check:
1. Node version mismatch
2. Environment variables
3. File paths (use path.join for cross-platform)

### Coverage is low

Run with coverage report:

```bash
npm run test:coverage
```

Check the HTML report in `coverage/index.html`.
