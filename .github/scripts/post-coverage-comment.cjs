'use strict';

const fs = require('fs');

const MARKER = '<!-- coverage-report -->';
const SUMMARY_PATH = 'coverage/coverage-summary.json';
const API_VERSION = '2022-11-28';

function formatCoverage(item) {
  return `${item.pct}% (${item.covered}/${item.total})`;
}

function buildBody(summary) {
  return [
    MARKER,
    '## Coverage report',
    '| Metric | Coverage |',
    '| --- | --- |',
    `| Lines | ${formatCoverage(summary.lines)} |`,
    `| Statements | ${formatCoverage(summary.statements)} |`,
    `| Functions | ${formatCoverage(summary.functions)} |`,
    `| Branches | ${formatCoverage(summary.branches)} |`
  ].join('\n');
}

function getRepo() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo || !repo.includes('/')) {
    throw new Error('GITHUB_REPOSITORY is missing or invalid.');
  }
  const [owner, name] = repo.split('/');
  return { owner, repo: name };
}

function getPullRequestNumber() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !fs.existsSync(eventPath)) {
    throw new Error('GITHUB_EVENT_PATH is missing or invalid.');
  }
  const payload = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  return payload.pull_request && payload.pull_request.number;
}

async function githubRequest(path, options = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN is not set.');
  }
  const response = await fetch(`https://api.github.com${path}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': API_VERSION,
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API error (${response.status}): ${text}`);
  }
  return response.status === 204 ? null : response.json();
}

async function run() {
  if (!fs.existsSync(SUMMARY_PATH)) {
    throw new Error(`Coverage summary not found at ${SUMMARY_PATH}`);
  }

  const prNumber = getPullRequestNumber();
  if (!prNumber) {
    throw new Error('No pull request number found in event payload.');
  }

  const summary = JSON.parse(fs.readFileSync(SUMMARY_PATH, 'utf8')).total;
  const body = buildBody(summary);
  const { owner, repo } = getRepo();

  const comments = await githubRequest(
    `/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100`
  );

  const existing = comments.find(
    (comment) => comment.body && comment.body.includes(MARKER)
  );

  if (existing) {
    await githubRequest(`/repos/${owner}/${repo}/issues/comments/${existing.id}`, {
      method: 'PATCH',
      body: { body }
    });
    return;
  }

  await githubRequest(`/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
    method: 'POST',
    body: { body }
  });
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
