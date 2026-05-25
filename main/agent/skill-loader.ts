/**
 * Skill 加载器
 * 支持动态加载不同场景的 Skill
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { ToolDefinition } from './types.js';

export interface SkillConfig {
  name: string;
  description: string;
  version: string;
  author: string;
  tags: string[];
  tools: string[];
  promptFile: string;
  examplesDir?: string;
  mcpServer?: {
    name: string;
    command: string;
    args: string[];
  };
}

export interface LoadedSkill {
  config: SkillConfig;
  systemPrompt: string;
  examples: SkillExample[];
  toolDefinitions: ToolDefinition[];
}

export interface SkillExample {
  name: string;
  title: string;
  content: string;
}

const SKILLS_DIR = resolve(process.cwd(), '.trae/skills');

/**
 * 列出所有可用的 Skill
 */
export function listAvailableSkills(): string[] {
  try {
    if (!existsSync(SKILLS_DIR)) {
      console.warn(`Skills directory not found: ${SKILLS_DIR}`);
      return [];
    }

    const entries = readdirSync(SKILLS_DIR, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  } catch (error) {
    console.error('Error listing skills:', error);
    return [];
  }
}

/**
 * 加载指定 Skill
 */
export function loadSkill(skillName: string): LoadedSkill | null {
  try {
    const skillPath = join(SKILLS_DIR, skillName);
    
    if (!existsSync(skillPath)) {
      console.error(`Skill not found: ${skillName}`);
      return null;
    }

    // 读取 skill.json
    const skillJsonPath = join(skillPath, 'skill.json');
    if (!existsSync(skillJsonPath)) {
      console.error(`skill.json not found for: ${skillName}`);
      return null;
    }

    const skillConfig: SkillConfig = JSON.parse(
      readFileSync(skillJsonPath, 'utf-8')
    );

    // 读取 prompt.md
    const promptPath = join(skillPath, skillConfig.promptFile);
    let systemPrompt = '';
    if (existsSync(promptPath)) {
      systemPrompt = readFileSync(promptPath, 'utf-8');
    }

    // 替换 {{tools}} 占位符
    systemPrompt = injectToolDefinitions(systemPrompt, skillConfig.tools);

    // 加载案例
    const examples: SkillExample[] = [];
    if (skillConfig.examplesDir) {
      const examplesPath = join(skillPath, skillConfig.examplesDir);
      if (existsSync(examplesPath)) {
        const exampleFiles = readdirSync(examplesPath)
          .filter(f => f.endsWith('.md'));
        
        for (const file of exampleFiles) {
          const content = readFileSync(join(examplesPath, file), 'utf-8');
          const name = file.replace('.md', '');
          const title = extractTitle(content) || name;
          examples.push({ name, title, content });
        }
      }
    }

    // 获取工具定义
    const toolDefinitions = getToolDefinitionsForSkill(skillConfig.tools);

    return {
      config: skillConfig,
      systemPrompt,
      examples,
      toolDefinitions,
    };
  } catch (error) {
    console.error(`Error loading skill ${skillName}:`, error);
    return null;
  }
}

/**
 * 根据场景自动选择合适的 Skill
 */
export function selectSkillForScenario(scenario: string): string | null {
  const skills = listAvailableSkills();
  
  // 场景关键词匹配
  const scenarioKeywords: Record<string, string[]> = {
    'his-troubleshooting': ['故障', '排查', '日志', '错误', '异常', 'ORA-', 'timeout', '超时', 'trace'],
    'ai-report': ['报表', '统计', '分析', '图表', '查询', 'SQL生成'],
    'version-compare': ['版本', '对比', '比较', 'diff', '升级'],
  };

  const lowerScenario = scenario.toLowerCase();

  for (const skillName of skills) {
    const keywords = scenarioKeywords[skillName];
    if (keywords) {
      const matched = keywords.some(keyword => 
        lowerScenario.includes(keyword.toLowerCase())
      );
      if (matched) {
        return skillName;
      }
    }
  }

  // 默认返回 his-troubleshooting
  return skills.includes('his-troubleshooting') ? 'his-troubleshooting' : null;
}

/**
 * 将工具定义注入到 Prompt 中
 */
function injectToolDefinitions(prompt: string, toolNames: string[]): string {
  const allTools = getAllToolDefinitions();
  const skillTools = allTools.filter(t => toolNames.includes(t.name));
  
  const toolsDescription = skillTools.map(tool => {
    const params = Object.entries(tool.parameters.properties || {})
      .map(([name, schema]: [string, any]) => {
        const required = tool.parameters.required?.includes(name);
        return `  - ${name}${required ? ' (required)' : ''}: ${schema.description}`;
      })
      .join('\n');
    
    return `- **${tool.name}**: ${tool.description}\n${params}`;
  }).join('\n\n');

  return prompt.replace('{{tools}}', toolsDescription);
}

/**
 * 获取所有工具定义
 */
function getAllToolDefinitions(): ToolDefinition[] {
  // 从 config.ts 导入或重新定义
  return [
    {
      name: 'query_log',
      description: '查询 HTTP 错误日志，根据 traceId 获取请求链路中的错误信息',
      parameters: {
        type: 'object',
        properties: {
          traceId: { type: 'string', description: 'Trace ID，用于追踪请求链路' },
          serviceName: { type: 'string', description: '可选的服务名过滤' },
        },
        required: ['traceId'],
      },
    },
    {
      name: 'query_sql_log',
      description: '查询 SQL 执行日志，获取 DAO/Mapper 方法的实际执行 SQL、参数和耗时',
      parameters: {
        type: 'object',
        properties: {
          traceId: { type: 'string', description: 'Trace ID' },
          sqlId: { type: 'string', description: 'SQL ID / DAO 方法名，如 UserMapper.selectById' },
        },
        required: ['traceId'],
      },
    },
    {
      name: 'query_rpc_log',
      description: '查询 RPC/Feign 调用链日志，定位下游服务调用',
      parameters: {
        type: 'object',
        properties: {
          traceId: { type: 'string', description: 'Trace ID' },
          serviceName: { type: 'string', description: '可选的服务名过滤' },
          keyword: { type: 'string', description: '可选的关键词搜索' },
        },
        required: ['traceId'],
      },
    },
    {
      name: 'query_param_log',
      description: '查询业务参数日志，获取请求参数、配置项等信息',
      parameters: {
        type: 'object',
        properties: {
          traceId: { type: 'string', description: 'Trace ID' },
          serviceName: { type: 'string', description: '可选的服务名过滤' },
          keyword: { type: 'string', description: '可选的关键词搜索' },
        },
        required: ['traceId'],
      },
    },
    {
      name: 'query_normal_log',
      description: '查询控制台/普通应用日志',
      parameters: {
        type: 'object',
        properties: {
          traceId: { type: 'string', description: 'Trace ID' },
          serviceName: { type: 'string', description: '可选的服务名过滤' },
          keyword: { type: 'string', description: '可选的关键词搜索' },
          logLevel: { type: 'array', items: { type: 'string' }, description: '日志级别过滤，如 ["ERROR", "WARN"]' },
        },
        required: ['traceId'],
      },
    },
    {
      name: 'query_business_data',
      description: '执行只读 SQL 查询验证业务数据（仅支持 SELECT）',
      parameters: {
        type: 'object',
        properties: {
          sql: { type: 'string', description: 'SQL 查询语句（仅 SELECT）' },
          description: { type: 'string', description: '查询目的描述' },
          dataSourceId: { type: 'string', description: '数据源 ID（可选）' },
        },
        required: ['sql', 'description'],
      },
    },
    {
      name: 'get_table_schema',
      description: '查询数据库表结构信息',
      parameters: {
        type: 'object',
        properties: {
          tableNamePattern: { type: 'string', description: '表名或表名模式，如 PATIENT_INFO 或 PATIENT_%' },
        },
        required: ['tableNamePattern'],
      },
    },
    {
      name: 'get_code',
      description: '从 GitLab 获取代码',
      parameters: {
        type: 'object',
        properties: {
          serviceName: { type: 'string', description: '服务名' },
          filePath: { type: 'string', description: '文件路径' },
          searchPattern: { type: 'string', description: '搜索模式' },
          branch: { type: 'string', description: 'Git 分支' },
          tag: { type: 'string', description: 'Git 标签' },
        },
      },
    },
  ];
}

/**
 * 获取 Skill 需要的工具定义
 */
function getToolDefinitionsForSkill(toolNames: string[]): ToolDefinition[] {
  const allTools = getAllToolDefinitions();
  return allTools.filter(t => toolNames.includes(t.name));
}

/**
 * 从 Markdown 内容中提取标题
 */
function extractTitle(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

/**
 * 构建带案例的 System Prompt
 */
export function buildSystemPromptWithExamples(
  skill: LoadedSkill,
  includeExamples: boolean = true
): string {
  let prompt = skill.systemPrompt;

  if (includeExamples && skill.examples.length > 0) {
    prompt += '\n\n## 参考案例\n\n';
    skill.examples.forEach((example, index) => {
      prompt += `${index + 1}. **${example.title}**\n`;
      // 只显示案例的前 500 字符作为提示
      const preview = example.content.slice(0, 500);
      prompt += preview + (example.content.length > 500 ? '...' : '') + '\n\n';
    });
  }

  return prompt;
}
