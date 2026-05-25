/**
 * 支持 Skill 的配置文件
 * 替代原有的 config.ts，支持动态加载 Skill
 */

import { loadSkill, selectSkillForScenario, buildSystemPromptWithExamples, LoadedSkill } from './skill-loader.js';
import { TOOL_DEFINITIONS as STATIC_TOOL_DEFINITIONS } from './config.js';

// 默认使用 his-troubleshooting Skill
let currentSkill: LoadedSkill | null = null;

/**
 * 初始化 Skill
 */
export function initializeSkill(skillName?: string, scenario?: string): boolean {
  let targetSkill = skillName;

  // 如果没有指定 Skill，根据场景自动选择
  if (!targetSkill && scenario) {
    targetSkill = selectSkillForScenario(scenario) ?? undefined;
  }

  // 默认使用 his-troubleshooting
  if (!targetSkill) {
    targetSkill = 'his-troubleshooting';
  }

  const skill = loadSkill(targetSkill);
  if (skill) {
    currentSkill = skill;
    console.log(`[Skill] Loaded: ${skill.config.name} v${skill.config.version}`);
    return true;
  }

  console.warn(`[Skill] Failed to load: ${targetSkill}`);
  return false;
}

/**
 * 获取当前 Skill
 */
export function getCurrentSkill(): LoadedSkill | null {
  return currentSkill;
}

/**
 * 获取 System Prompt
 */
export function getSystemPrompt(includeExamples: boolean = true): string {
  if (currentSkill) {
    return buildSystemPromptWithExamples(currentSkill, includeExamples);
  }

  // 回退到静态配置
  return STATIC_SYSTEM_PROMPT;
}

/**
 * 获取工具定义
 */
export function getToolDefinitions(): any[] {
  if (currentSkill) {
    return currentSkill.toolDefinitions.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  // 回退到静态配置
  return STATIC_TOOL_DEFINITIONS;
}

/**
 * 获取可用的 Skill 列表
 */
export function getAvailableSkills(): string[] {
  const { listAvailableSkills } = require('./skill-loader.js');
  return listAvailableSkills();
}

/**
 * 切换 Skill
 */
export function switchSkill(skillName: string): boolean {
  return initializeSkill(skillName);
}

// 静态配置作为回退
const STATIC_SYSTEM_PROMPT = `你是 HIS（医院信息系统）智能运维诊断助手，目标是帮助运维人员快速定位问题根因并给出可执行修复建议。

## 核心原则
1. 所有结论必须来自证据：日志、代码、SQL 执行记录、业务数据验证四类证据优先级最高。
2. 不要只根据异常名猜测根因；如果缺关键证据，要明确说明缺什么、已查到什么。
3. 输出要短而准：先给一句话根因，再给证据链，最后给修复步骤。

## 标准排查链路
1. Trace 日志：先看 HTTP，再看 RPC/Feign、SQL、参数、控制台日志，识别真实报错服务和异常 span。
2. 代码定位：根据 Controller/Service/DAO/Mapper 方法名或堆栈，使用 get_code 精确搜索，不要整文件泛读。
3. SQL 还原：发现 DAO/Mapper 方法后，必须优先 query_sql_log(traceId, sqlId)，确认真实 SQL、入参、耗时和异常。
4. 数据验证：SQL 指向数据异常时，用 query_business_data 执行只读 SELECT 验证。
5. 结论：把"现象 -> 证据 -> 根因 -> 修复"串起来。

## 常见 HIS 案例
- ORA-01427 / 单行子查询返回多行：不要只说 SQL 错误，要指出哪个子查询或业务编码可能不唯一，并建议加唯一约束、改 join/聚合或修复脏数据。
- BadSqlGrammarException：先查 sqlId 的实际 SQL 和绑定参数，再结合 Mapper 代码判断字段、表名、动态条件或数据库方言问题。
- Feign/Dubbo 下游失败：HTTP 网关日志不是最终服务，必须沿 RPC/Feign 日志找到 CLIENT -> SERVER 的真实下游服务。
- 参数/开关类问题：从 param/normal 日志中找 BizParam、配置项、操作人和版本信息，避免把配置问题误判成代码 bug。

## 输出格式
1. 一句话结论，不超过 30 字。
2. 关键证据，列出 3-6 条，包含日志类型、服务、方法、SQL ID 或表名。
3. 根因解释，说明为什么这些证据能支持结论。
4. 修复建议，不超过 3 条，尽量具体到代码、SQL、配置或数据处理。`;

// 导出原有配置以保持兼容性
export { DEEPSEEK_CONFIG, GITLAB_CONFIG } from './config.js';
