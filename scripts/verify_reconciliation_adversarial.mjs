// scripts/verify_reconciliation_adversarial.mjs
// Adversarial Empirical Verification of GitHub Issue Reconciliation for KOSMO
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function loadEnv() {
  const envPath = path.join(rootDir, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.substring(0, eqIdx).trim();
        const value = trimmed.substring(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}

loadEnv();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const REPO = 'Dramaniako/KOSMO-landing-page';

if (!GITHUB_TOKEN) {
  console.error('❌ Error: GITHUB_TOKEN is required in .env or environment.');
  process.exit(1);
}

const targetIssues = [
  6, 9, 12, 13, 14, 15, 16, 23, 25, 26, 27, 28,
  32, 33, 34, 35, 36, 38, 39, 40, 41, 42, 43, 44,
  45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56,
  57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68,
  69, 70, 71, 72, 73, 74
];
const targetPRs = [37];
const allTargetNumbers = [...targetIssues, ...targetPRs];

async function apiCall(endpoint) {
  const url = endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'adversarial-challenger-node'
    }
  });

  const rateLimit = {
    limit: res.headers.get('x-ratelimit-limit'),
    remaining: res.headers.get('x-ratelimit-remaining'),
    reset: res.headers.get('x-ratelimit-reset'),
    used: res.headers.get('x-ratelimit-used'),
    resource: res.headers.get('x-ratelimit-resource')
  };

  if (!res.ok) {
    const errBody = await res.text();
    return { ok: false, status: res.status, error: errBody, rateLimit };
  }

  const data = await res.json();
  return { ok: true, status: res.status, data, rateLimit, headers: res.headers };
}

// Pre-load all local git commits
const localGitCommits = new Set();
try {
  const gitLogOut = execSync('git log --format="%h %H"', { encoding: 'utf8', cwd: rootDir });
  for (const line of gitLogOut.split('\n')) {
    const parts = line.trim().split(' ');
    if (parts[0]) localGitCommits.add(parts[0]);
    if (parts[1]) localGitCommits.add(parts[1]);
  }
} catch (e) {
  console.warn('Warning: Could not pre-load git log:', e.message);
}

async function runAdversarialVerification() {
  console.log('🔍 Starting Empirical Adversarial Check of GitHub Reconciliation...');
  const results = {
    timestamp: new Date().toISOString(),
    repo: REPO,
    totalTargetIssues: targetIssues.length,
    totalTargetPRs: targetPRs.length,
    totalTargets: allTargetNumbers.length,
    openIssuesCount: null,
    openIssuesList: [],
    closedTargetsCount: 0,
    missingTargets: [],
    unclosedTargets: [],
    issuesWithoutComments: [],
    commentQualityIssues: [],
    commitVerificationIssues: [],
    fileVerificationIssues: [],
    verifiedItems: [],
    rateLimitStatus: {},
    passedAllChecks: true
  };

  // 1. Check Rate Limit
  console.log('1️⃣ Checking GitHub API Rate Limit...');
  const rlRes = await apiCall('/rate_limit');
  if (rlRes.ok) {
    results.rateLimitStatus = rlRes.data.resources.core;
    console.log(`   Core Rate Limit: ${results.rateLimitStatus.remaining}/${results.rateLimitStatus.limit} remaining (Resets at ${new Date(results.rateLimitStatus.reset * 1000).toISOString()})`);
  }

  // 2. Fetch all open issues/PRs
  console.log('2️⃣ Checking for any OPEN issues/PRs across repository...');
  let openPage = 1;
  let allOpen = [];
  while (true) {
    const res = await apiCall(`/repos/${REPO}/issues?state=open&per_page=100&page=${openPage}`);
    if (!res.ok) {
      console.error('Failed to fetch open issues:', res.error);
      break;
    }
    allOpen = allOpen.concat(res.data);
    if (res.data.length < 100) break;
    openPage++;
  }
  results.openIssuesCount = allOpen.length;
  results.openIssuesList = allOpen.map(i => ({ number: i.number, title: i.title, isPR: !!i.pull_request }));
  console.log(`   Open items count: ${allOpen.length}`);
  if (allOpen.length > 0) {
    results.passedAllChecks = false;
    console.error('   ❌ Found OPEN items:', results.openIssuesList);
  } else {
    console.log('   ✅ Backlog confirmed 0 open items.');
  }

  // 3. Fetch all closed issues and PRs (paginated)
  console.log('3️⃣ Querying all issues/PRs (state=all) to cross-reference targets...');
  let page = 1;
  let allItemsMap = new Map();
  while (true) {
    const res = await apiCall(`/repos/${REPO}/issues?state=all&per_page=100&page=${page}`);
    if (!res.ok) {
      console.error(`Failed to fetch page ${page}:`, res.error);
      break;
    }
    for (const item of res.data) {
      allItemsMap.set(item.number, item);
    }
    if (res.data.length < 100) break;
    page++;
  }
  console.log(`   Total items fetched from repo (issues + PRs): ${allItemsMap.size}`);

  // 4. Verify each target item
  console.log('4️⃣ Verifying each of the 55 target items (#6-#74, PR #37)...');
  for (const num of allTargetNumbers) {
    const item = allItemsMap.get(num);
    if (!item) {
      results.missingTargets.push(num);
      results.passedAllChecks = false;
      console.error(`   ❌ Item #${num} NOT FOUND on GitHub.`);
      continue;
    }

    if (item.state !== 'closed') {
      results.unclosedTargets.push({ number: num, state: item.state, title: item.title });
      results.passedAllChecks = false;
      console.error(`   ❌ Item #${num} is NOT closed (state: ${item.state})`);
    } else {
      results.closedTargetsCount++;
    }
  }
  console.log(`   Closed target items verified: ${results.closedTargetsCount}/${allTargetNumbers.length}`);

  // 5. Verify Comments on each target item
  console.log('5️⃣ Inspecting Comments for every target item...');
  for (let i = 0; i < allTargetNumbers.length; i++) {
    const num = allTargetNumbers[i];
    const commentsRes = await apiCall(`/repos/${REPO}/issues/${num}/comments`);
    if (!commentsRes.ok) {
      results.commentQualityIssues.push({ number: num, error: `Failed to fetch comments: ${commentsRes.error}` });
      results.passedAllChecks = false;
      continue;
    }

    const comments = commentsRes.data;
    if (!comments || comments.length === 0) {
      results.issuesWithoutComments.push(num);
      results.passedAllChecks = false;
      console.error(`   ❌ Item #${num} has NO comments.`);
      continue;
    }

    // Find the reconciliation audit comment
    const auditComment = comments.find(c =>
      c.body.includes('KOSMO Platform Audit & Issue Resolution Attestation') ||
      c.body.includes('Resolution Status') ||
      c.body.includes('Architectural Implementation')
    ) || comments[comments.length - 1];

    const body = auditComment.body;

    // Check for placeholder text / patterns
    const placeholderPatterns = [
      /\bTODO\b/i,
      /\bTBD\b/i,
      /\bFIXME\b/i,
      /\[placeholder\]/i,
      /\[TBD\]/i,
      /\[insert\s+[^\]]+\]/i,
      /\bundefined\b/
    ];

    const matchedPlaceholders = [];
    for (const pat of placeholderPatterns) {
      if (pat.test(body)) {
        matchedPlaceholders.push(pat.toString());
      }
    }

    // Check for empty markdown sections
    const emptySectionMatch = body.match(/###\s+[^\n]+\n\s*\n(?=###|---|$)/g);
    if (emptySectionMatch) {
      results.commentQualityIssues.push({
        number: num,
        issue: `Empty markdown section found: ${emptySectionMatch.join(', ')}`
      });
      results.passedAllChecks = false;
    }

    if (matchedPlaceholders.length > 0) {
      results.commentQualityIssues.push({
        number: num,
        issue: `Placeholder patterns detected: ${matchedPlaceholders.join(', ')}`
      });
      results.passedAllChecks = false;
    }

    // Check broken links / markdown URL syntax
    const mdLinks = [...body.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];
    for (const link of mdLinks) {
      const url = link[2];
      if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('#')) {
        results.commentQualityIssues.push({
          number: num,
          issue: `Invalid URL protocol in link: [${link[1]}](${url})`
        });
        results.passedAllChecks = false;
      }
    }

    // Extract Git commit hashes mentioned in comment and verify in local git
    const commitMatches = [...body.matchAll(/`([0-9a-f]{7,40})`/g)].map(m => m[1]);
    for (const hash of commitMatches) {
      const found = localGitCommits.has(hash) || [...localGitCommits].some(c => c.startsWith(hash));
      if (!found) {
        results.commitVerificationIssues.push({
          number: num,
          commit: hash,
          error: `Commit ${hash} not found in local git history`
        });
      }
    }

    // Extract file paths mentioned in comment and verify existence in repo
    const fileMatches = [...body.matchAll(/`(backend\/[a-zA-Z0-9_\-\.\/]+|frontend\/[a-zA-Z0-9_\-\.\/]+|tests\/[a-zA-Z0-9_\-\.\/]+)`/g)].map(m => m[1]);
    for (let fpath of fileMatches) {
      const cleanPath = fpath.split(' ')[0].replace(/:\d+(:\d+)?$/, '').replace(/\([^\)]+\)$/, '');
      const fullPath = path.join(rootDir, cleanPath);
      if (!fs.existsSync(fullPath)) {
        results.fileVerificationIssues.push({
          number: num,
          file: cleanPath,
          error: `Referenced file ${cleanPath} does not exist in repository`
        });
      }
    }

    results.verifiedItems.push({
      number: num,
      title: allItemsMap.get(num)?.title || 'Unknown',
      state: allItemsMap.get(num)?.state || 'Unknown',
      commentId: auditComment.id,
      commentUrl: auditComment.html_url,
      commentLength: body.length
    });

    if ((i + 1) % 10 === 0 || i === allTargetNumbers.length - 1) {
      console.log(`   Audited comments: ${i + 1}/${allTargetNumbers.length}`);
    }

    await new Promise(r => setTimeout(r, 60));
  }

  // 6. Summary Output
  console.log('\n================ VERIFICATION SUMMARY ================');
  console.log(`Repository: ${REPO}`);
  console.log(`Open Issues: ${results.openIssuesCount} (Expected: 0)`);
  console.log(`Target Items Closed: ${results.closedTargetsCount}/${allTargetNumbers.length}`);
  console.log(`Missing Targets: ${results.missingTargets.length}`);
  console.log(`Unclosed Targets: ${results.unclosedTargets.length}`);
  console.log(`Items without comments: ${results.issuesWithoutComments.length}`);
  console.log(`Comment Quality Issues: ${results.commentQualityIssues.length}`);
  console.log(`Commit Verification Warnings: ${results.commitVerificationIssues.length}`);
  console.log(`File Verification Warnings: ${results.fileVerificationIssues.length}`);
  console.log(`Overall Pass: ${results.passedAllChecks ? '✅ YES (APPROVE)' : '❌ NO (REJECT)'}`);
  console.log('======================================================\n');

  // Save audit output to file
  const outPath = path.join(rootDir, '.agents/challenger_reconcile_1/adversarial_verification_results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`Detailed verification results saved to ${outPath}`);

  return results;
}

runAdversarialVerification().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
