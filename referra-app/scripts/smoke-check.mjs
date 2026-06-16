import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

const requiredFiles = [
  'app.yaml',
  'databricks.yml',
  'package.json',
  'server/server.ts',
  'client/src/App.tsx',
  'client/src/pages/genie/GeniePage.tsx',
  'config/queries/nfhs_district_health_indicators.sql',
];

const requiredText = [
  {
    file: 'databricks.yml',
    snippets: [
      'name: referra-app',
      'host: https://dbc-4745c1e0-06b0.cloud.databricks.com',
      'genie_space_id: 01f16999d12a176991615aabc8dc1d8c',
      'warehouse_id: ff45ecc135192f6f',
      'lakebase_branch: projects/referra-districts/branches/production',
    ],
  },
  {
    file: 'app.yaml',
    snippets: ['valueFrom: genie-space', 'valueFrom: sql-warehouse', 'valueFrom: postgres'],
  },
  {
    file: 'client/src/App.tsx',
    snippets: ['Referra', 'Ask Referra', 'Find care', 'NFHS Data', 'Usage'],
  },
  {
    file: 'server/server.ts',
    snippets: ['createApp({', 'genie({', 'lakebase()', 'analytics()', '/api/clinic-recommendations'],
  },
];

function fail(message) {
  console.error(`Smoke check failed: ${message}`);
  process.exitCode = 1;
}

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) {
    fail(`missing ${file}`);
  }
}

for (const { file, snippets } of requiredText) {
  const content = readFileSync(join(root, file), 'utf8');
  for (const snippet of snippets) {
    if (!content.includes(snippet)) {
      fail(`${file} does not contain expected text: ${snippet}`);
    }
  }
}

const sourceMapPath = join(root, 'client/src/data/india-adm1-boundaries.json');
if (existsSync(sourceMapPath)) {
  const size = statSync(sourceMapPath).size;
  const maxDatabricksAppFileSize = 10 * 1024 * 1024;
  if (size > maxDatabricksAppFileSize) {
    fail('client/src/data/india-adm1-boundaries.json exceeds the 10 MB Databricks Apps file limit');
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log('Smoke check passed.');
