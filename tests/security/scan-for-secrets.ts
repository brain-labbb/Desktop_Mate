/**
 * Secret Scanner Script
 * Scans source code for potential secrets and API keys
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

/** Secret pattern definitions */
const SECRET_PATTERNS = [
  {
    name: 'OpenAI API Key',
    pattern: /sk-[a-zA-Z0-9]{20,}/g,
    severity: 'CRITICAL'
  },
  {
    name: 'Anthropic API Key',
    pattern: /sk-ant-[a-zA-Z0-9]{20,}/g,
    severity: 'CRITICAL'
  },
  {
    name: 'AWS Access Key',
    pattern: /AKIA[0-9A-Z]{16}/g,
    severity: 'CRITICAL'
  },
  {
    name: 'AWS Secret Key',
    pattern: /(?<![A-Z0-9])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g,
    severity: 'CRITICAL'
  },
  {
    name: 'GitHub Token',
    pattern: /ghp_[a-zA-Z0-9]{36}/g,
    severity: 'CRITICAL'
  },
  {
    name: 'GitHub OAuth',
    pattern: /gho_[a-zA-Z0-9]{36}/g,
    severity: 'CRITICAL'
  },
  {
    name: 'GitHub App Token',
    pattern: /ghu_[a-zA-Z0-9]{36}/g,
    severity: 'CRITICAL'
  },
  {
    name: 'Slack Token',
    pattern: /xox[baprs]-[a-zA-Z0-9-]{10,}/g,
    severity: 'HIGH'
  },
  {
    name: 'Private Key',
    pattern: /-----BEGIN [A-Z]+ PRIVATE KEY-----/g,
    severity: 'CRITICAL'
  },
  {
    name: 'Password in URL',
    pattern: /:\/[\/\w]+:[^@\s]+@/g,
    severity: 'HIGH'
  },
  {
    name: 'Bearer Token',
    pattern: /Bearer\s+[a-zA-Z0-9]{20,}/g,
    severity: 'MEDIUM'
  },
  {
    name: 'API Key (generic)',
    pattern: /api[_-]?key\s*[:=]\s*['"]?[a-zA-Z0-9]{20,}['"]?/gi,
    severity: 'MEDIUM'
  },
  {
    name: 'Secret (generic)',
    pattern: /secret\s*[:=]\s*['"]?[a-zA-Z0-9]{20,}['"]?/gi,
    severity: 'MEDIUM'
  },
  {
    name: 'Token (generic)',
    pattern: /token\s*[:=]\s*['"]?[a-zA-Z0-9]{20,}['"]?/gi,
    severity: 'MEDIUM'
  }
];

/** File extensions to scan */
const SCAN_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.env', '.yml', '.yaml'];

/** Directories to ignore */
const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', 'coverage', '.next', 'out'];

/** Scan result */
interface ScanResult {
  file: string;
  line: number;
  pattern: string;
  match: string;
  severity: string;
}

/** Recursively scan directory */
function scanDirectory(dir: string, results: ScanResult[]): void {
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      if (IGNORE_DIRS.includes(entry)) {
        continue;
      }
      scanDirectory(fullPath, results);
    } else if (stat.isFile()) {
      const ext = extname(entry);
      if (SCAN_EXTENSIONS.includes(ext)) {
        scanFile(fullPath, results);
      }
    }
  }
}

/** Scan single file */
function scanFile(filePath: string, results: ScanResult[]): void {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      for (const secretPattern of SECRET_PATTERNS) {
        const matches = line.matchAll(secretPattern.pattern);
        for (const match of matches) {
          results.push({
            file: filePath,
            line: lineNumber,
            pattern: secretPattern.name,
            match: match[0],
            severity: secretPattern.severity
          });
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning file ${filePath}:`, error);
  }
}

/** Main scan function */
function main() {
  const args = process.argv.slice(2);
  const targetDir = args[0] || process.cwd();

  console.log(`\n🔍 Scanning for secrets in: ${targetDir}`);
  console.log(`📁 Ignoring directories: ${IGNORE_DIRS.join(', ')}\n`);

  const results: ScanResult[] = [];
  scanDirectory(targetDir, results);

  // Sort results by severity
  results.sort((a, b) => {
    const severityOrder = { 'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2 };
    return severityOrder[a.severity as keyof typeof severityOrder] - severityOrder[b.severity as keyof typeof severityOrder];
  });

  // Print results
  if (results.length === 0) {
    console.log('✅ No secrets found!');
  } else {
    console.log(`⚠️  Found ${results.length} potential secret(s):\n`);

    for (const result of results) {
      const severityIcon = result.severity === 'CRITICAL' ? '🔴' : result.severity === 'HIGH' ? '🟠' : '🟡';
      console.log(`${severityIcon} ${result.pattern} (${result.severity})`);
      console.log(`   File: ${result.file}:${result.line}`);
      console.log(`   Match: ${result.match.substring(0, 50)}${result.match.length > 50 ? '...' : ''}\n`);
    }

    // Exit with error code if secrets found
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { scanDirectory, scanFile, SECRET_PATTERNS };
