import { ApiClient } from '../api-client';
import { GITLAB_CONFIG } from '../agent/config';
import {
  CodeRepositoryRecord,
  getCodeRepositoriesByProjectId,
  getGlobalConfig,
  getProjectConfig,
  inferBranchFromTag,
} from '../database/sqlite';
import { getFirstTokenFromRedis, RedisConfig } from '../redis';

export type RequirementStatus = '已通过' | '未通过' | '审核中' | '未标注';

export interface RequirementCompareRequest {
  projectId: string;
  inputText: string;
}

export interface RequirementCompareRow {
  id: string;
  author: string;
  title: string;
  modules: string[];
  services: string[];
  lastCommittedAt: string;
  status: RequirementStatus;
  commitUrl?: string;
  commitIds: string[];
}

export interface RequirementCompareServiceResult {
  serviceName: string;
  targetVersion: string;
  onlineVersion?: string;
  compareFromRef?: string;
  compareToRef?: string;
  repositories: string[];
  commitCount: number;
  error?: string;
}

export interface RequirementCompareResult {
  success: boolean;
  rows: RequirementCompareRow[];
  services: RequirementCompareServiceResult[];
  message?: string;
}

interface ParsedRequirementLine {
  serviceName: string;
  targetVersion: string;
}

interface GitLabCommit {
  id: string;
  short_id?: string;
  title?: string;
  message?: string;
  author_name?: string;
  committed_date?: string;
  created_at?: string;
  web_url?: string;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function parseRequirementInput(inputText: string): ParsedRequirementLine[] {
  const lines = inputText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line, index) => {
    const match = line.match(/^(.+?)\s+(release-[\w.-]+)$/i);
    if (!match) {
      throw new Error(`第 ${index + 1} 行格式不正确，请使用“服务名 release-版本号”`);
    }
    return {
      serviceName: match[1].trim(),
      targetVersion: match[2].trim(),
    };
  });
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

function matchesRepository(repo: CodeRepositoryRecord, serviceName: string): boolean {
  const service = normalizeText(serviceName);
  const repoName = normalizeText(repo.name);
  if (service.includes(repoName) || repoName.includes(service)) {
    return true;
  }

  return repo.servicePatterns
    .split(',')
    .map((pattern) => normalizeText(pattern.trim()))
    .filter(Boolean)
    .some((pattern) => service.includes(pattern) || pattern.includes(service));
}

function matchRepositories(projectId: string, serviceName: string): CodeRepositoryRecord[] {
  const repositories = getCodeRepositoriesByProjectId(projectId);
  return repositories.filter((repo) => matchesRepository(repo, serviceName));
}

function extractProjectPath(repoUrl: string, baseUrl: string): string {
  let projectPath = repoUrl.trim().replace(/\.git$/, '');
  const normalizedBase = stripTrailingSlash(baseUrl);

  if (projectPath.startsWith(normalizedBase)) {
    projectPath = projectPath.slice(normalizedBase.length);
  } else if (/^https?:\/\//i.test(projectPath)) {
    const url = new URL(projectPath);
    projectPath = url.pathname;
  }

  return projectPath.replace(/^\/+/, '');
}

function buildGitLabApiUrl(baseUrl: string, repoUrl: string, fromRef: string, toRef: string): string {
  const projectPath = extractProjectPath(repoUrl, baseUrl);
  const encodedProjectPath = encodeURIComponent(projectPath);
  const url = new URL(`${stripTrailingSlash(baseUrl)}/api/v4/projects/${encodedProjectPath}/repository/compare`);
  url.searchParams.set('from', fromRef);
  url.searchParams.set('to', toRef);
  url.searchParams.set('straight', 'false');
  url.searchParams.set('per_page', '100');
  return url.toString();
}

function firstMessageLine(commit: GitLabCommit): string {
  const text = commit.title || commit.message || commit.short_id || commit.id;
  return String(text).split(/\r?\n/)[0].trim();
}

export function extractRequirementStatus(message: string): RequirementStatus {
  const upper = message.toUpperCase();
  if (upper.includes('[PASSED]')) return '已通过';
  if (upper.includes('[FAILED]')) return '未通过';
  if (upper.includes('[REVIEWING]')) return '审核中';
  return '未标注';
}

function mergeStatus(current: RequirementStatus, next: RequirementStatus): RequirementStatus {
  if (current === next) return current;
  if (current === '未标注') return next;
  if (next === '未标注') return current;
  if (current === '未通过' || next === '未通过') return '未通过';
  if (current === '审核中' || next === '审核中') return '审核中';
  return '已通过';
}

function getCommitTime(commit: GitLabCommit): string {
  return commit.committed_date || commit.created_at || '';
}

function compareIsoDesc(a: string, b: string): number {
  return new Date(b || 0).getTime() - new Date(a || 0).getTime();
}

/** 解析 ref 时优先精确版本号，再回退推断分支 */
export function resolveCompareRefCandidates(version: string): string[] {
  const branch = inferBranchFromTag(version);
  if (branch === version) return [version];
  return [version, branch];
}

async function fetchRefTipSha(
  repo: CodeRepositoryRecord,
  ref: string,
  baseUrl: string,
  token: string
): Promise<string | null> {
  const projectPath = extractProjectPath(repo.repositoryUrl, baseUrl);
  const encodedProjectPath = encodeURIComponent(projectPath);
  const url = new URL(
    `${stripTrailingSlash(baseUrl)}/api/v4/projects/${encodedProjectPath}/repository/commits`
  );
  url.searchParams.set('ref_name', ref);
  url.searchParams.set('per_page', '1');

  const resp = await fetch(url.toString(), {
    headers: { 'PRIVATE-TOKEN': token },
  });
  if (!resp.ok) return null;

  const commits = (await resp.json()) as GitLabCommit[];
  return commits[0]?.id || null;
}

async function resolveVersionToSha(
  repo: CodeRepositoryRecord,
  version: string,
  baseUrl: string,
  token: string
): Promise<{ sha: string; refLabel: string } | null> {
  for (const ref of resolveCompareRefCandidates(version)) {
    const sha = await fetchRefTipSha(repo, ref, baseUrl, token);
    if (sha) return { sha, refLabel: ref };
  }
  return null;
}

function isGitLabRefNotFound(status: number, body: string): boolean {
  return status === 404 && /ref not found/i.test(body);
}

async function fetchCompareCommitsOnce(
  repo: CodeRepositoryRecord,
  fromRef: string,
  toRef: string,
  baseUrl: string,
  token: string
): Promise<GitLabCommit[]> {
  const url = buildGitLabApiUrl(baseUrl, repo.repositoryUrl, fromRef, toRef);
  const resp = await fetch(url, {
    headers: {
      'PRIVATE-TOKEN': token,
    },
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    const err = new Error(`GitLab compare 失败：${resp.status} ${resp.statusText}${text ? ` - ${text}` : ''}`);
    (err as Error & { status?: number; body?: string }).status = resp.status;
    (err as Error & { status?: number; body?: string }).body = text;
    throw err;
  }

  const data = (await resp.json()) as { commits?: GitLabCommit[] };
  return Array.isArray(data.commits) ? data.commits : [];
}

async function fetchCompareCommits(
  repo: CodeRepositoryRecord,
  onlineVersion: string,
  targetVersion: string,
  baseUrl: string,
  globalToken: string
): Promise<{ commits: GitLabCommit[]; fromRef: string; toRef: string }> {
  const token = repo.gitLabToken || globalToken;
  if (!token) {
    throw new Error('GitLab Token 未配置，请在全局配置或仓库配置中设置');
  }

  const onlineResolved = await resolveVersionToSha(repo, onlineVersion, baseUrl, token);
  const targetResolved = await resolveVersionToSha(repo, targetVersion, baseUrl, token);
  if (!onlineResolved) {
    throw new Error(`无法解析线上版本 ${onlineVersion} 对应的 Git 提交`);
  }
  if (!targetResolved) {
    throw new Error(`无法解析预发布版本 ${targetVersion} 对应的 Git 提交`);
  }

  const fromRef = `${onlineResolved.refLabel}@${onlineResolved.sha.slice(0, 8)}`;
  const toRef = `${targetResolved.refLabel}@${targetResolved.sha.slice(0, 8)}`;

  try {
    const commits = await fetchCompareCommitsOnce(
      repo,
      onlineResolved.sha,
      targetResolved.sha,
      baseUrl,
      token
    );
    return { commits, fromRef, toRef };
  } catch (error) {
    const err = error as Error & { status?: number; body?: string };
    if (isGitLabRefNotFound(err.status || 0, err.body || err.message)) {
      throw new Error(
        `GitLab compare 失败：预发布相对线上无新增提交，或 ref 无效（${fromRef} → ${toRef}）`
      );
    }
    throw err;
  }
}

function findOnlineVersion(
  serviceName: string,
  versions: Array<{ name: string; version: string }>
): string | undefined {
  const service = normalizeText(serviceName);
  const matched = versions.find((item) => {
    const name = normalizeText(item.name || '');
    return Boolean(item.version) && (service.includes(name) || name.includes(service));
  });
  return matched?.version;
}

async function resolveApiTokenFromRedis(projectId: string): Promise<string> {
  const config = getProjectConfig(projectId);
  if (!config?.redisHost || !config.redisPort) {
    throw new Error('请先在项目管理中配置 Redis Host 和 Port，用于获取线上版本接口 Token');
  }

  const redisConfig: RedisConfig = {
    host: config.redisHost,
    port: config.redisPort,
    password: config.redisPassword || undefined,
    db: config.redisDb || undefined,
  };
  const token = await getFirstTokenFromRedis(redisConfig);
  if (!token) {
    throw new Error('未从 Redis 获取到 Token，请检查 Redis 配置或 Token 前缀');
  }
  return token;
}

async function loadOnlineVersions(projectId: string) {
  const config = getProjectConfig(projectId);
  if (!config?.apiBaseUrl || !config.apiVersionPath) {
    throw new Error('请先在项目管理中配置 API Base URL 和 Version Path');
  }

  const apiToken = await resolveApiTokenFromRedis(projectId);
  const client = new ApiClient({
    baseUrl: config.apiBaseUrl,
    versionPath: config.apiVersionPath,
    authType: 'custom',
    customHeaderName: 'onelinkToken',
  });
  client.setToken(apiToken);

  return client.getModuleVersions();
}

export async function compareRequirementVersions(
  request: RequirementCompareRequest
): Promise<RequirementCompareResult> {
  const parsed = parseRequirementInput(request.inputText);
  const onlineVersions = await loadOnlineVersions(request.projectId);
  const globalConfig = getGlobalConfig();
  const baseUrl = globalConfig?.gitLabBaseUrl || GITLAB_CONFIG.baseUrl;
  const globalToken = globalConfig?.gitLabToken || GITLAB_CONFIG.token;

  const rowMap = new Map<string, RequirementCompareRow>();
  const serviceResults: RequirementCompareServiceResult[] = [];

  for (const item of parsed) {
    const serviceResult: RequirementCompareServiceResult = {
      serviceName: item.serviceName,
      targetVersion: item.targetVersion,
      repositories: [],
      commitCount: 0,
    };

    try {
      const onlineVersion = findOnlineVersion(item.serviceName, onlineVersions);
      serviceResult.onlineVersion = onlineVersion;
      if (!onlineVersion) {
        throw new Error(`未找到 ${item.serviceName} 的线上版本`);
      }

      const repositories = matchRepositories(request.projectId, item.serviceName);
      serviceResult.repositories = repositories.map((repo) => repo.name);
      if (repositories.length === 0) {
        throw new Error(`未找到与 ${item.serviceName} 匹配的代码仓库`);
      }

      for (const repo of repositories) {
        const { commits, fromRef, toRef } = await fetchCompareCommits(
          repo,
          onlineVersion,
          item.targetVersion,
          baseUrl,
          globalToken
        );
        if (!serviceResult.compareFromRef) {
          serviceResult.compareFromRef = fromRef;
          serviceResult.compareToRef = toRef;
        }
        serviceResult.commitCount += commits.length;

        for (const commit of commits) {
          const title = firstMessageLine(commit);
          const key = commit.id || `${repo.name}:${title}:${getCommitTime(commit)}`;
          const status = extractRequirementStatus(commit.message || title);
          const committedAt = getCommitTime(commit);
          const existing = rowMap.get(key);

          if (existing) {
            if (!existing.modules.includes(repo.name)) existing.modules.push(repo.name);
            if (!existing.services.includes(item.serviceName)) existing.services.push(item.serviceName);
            existing.status = mergeStatus(existing.status, status);
            if (compareIsoDesc(existing.lastCommittedAt, committedAt) > 0) {
              existing.lastCommittedAt = committedAt;
            }
            continue;
          }

          rowMap.set(key, {
            id: key,
            author: commit.author_name || '-',
            title,
            modules: [repo.name],
            services: [item.serviceName],
            lastCommittedAt: committedAt,
            status,
            commitUrl: commit.web_url,
            commitIds: [commit.short_id || commit.id].filter(Boolean),
          });
        }
      }
    } catch (error) {
      serviceResult.error = (error as Error).message;
    }

    serviceResults.push(serviceResult);
  }

  const rows = [...rowMap.values()].sort((a, b) => compareIsoDesc(a.lastCommittedAt, b.lastCommittedAt));
  return {
    success: serviceResults.every((item) => !item.error),
    rows,
    services: serviceResults,
    message: serviceResults.some((item) => item.error) ? '部分服务比对失败，请查看服务明细' : undefined,
  };
}
