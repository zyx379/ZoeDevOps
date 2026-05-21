import { useEffect, useRef, useState, useCallback } from 'react';
import * as echarts from 'echarts';
import { useReportStore, ReportMessage, ReportRecord } from '../stores/reportStore';
import { useProjectStore } from '../stores/projectStore';
import {
  extractSqlFromMarkdown,
  extractTitleFromMarkdown,
  extractReportAction,
  inferChartType,
  buildEChartsOption,
  groupHistoryByTime,
  exportCsv,
  exportExcel,
  copyToClipboard,
  ChartType,
} from '../utils/reportUtils';
import {
  ReportAttachmentKind,
  reportAttachmentAccept,
  detectReportAttachmentKind,
  attachmentKindLabel,
  attachmentKindIcon,
  defaultPromptForAttachmentOnly,
  readFileAsBase64,
} from '../utils/reportAttachment';

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1 text-gray-500 text-sm">
      思考中
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

function formatMessageTime(msg: ReportMessage): string {
  const ts =
    msg.timestamp ??
    (() => {
      const m = msg.id.match(/msg_(\d+)/);
      return m ? Number(m[1]) : Date.now();
    })();
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function SendIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function splitAssistantContent(content: string): { codeBlocks: string[]; prose: string } {
  const codeBlocks: string[] = [];
  const closed = content.match(/```[\s\S]*?```/g) || [];
  for (const block of closed) {
    if (!block.toLowerCase().startsWith('```report-action')) codeBlocks.push(block);
  }
  let prose = content.replace(/```[\s\S]*?```/g, '');
  const openSql = content.match(/```sql[\s\S]*$/i);
  if (openSql && !codeBlocks.includes(openSql[0])) {
    codeBlocks.push(openSql[0]);
    prose = prose.replace(/```sql[\s\S]*$/i, '');
  }
  return { codeBlocks, prose: prose.trim() };
}

function CollapsibleAssistantContent({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const { codeBlocks, prose } = splitAssistantContent(content);
  const shouldCollapse = prose.length > 500;

  if (!shouldCollapse) {
    return <MarkdownContent content={content} />;
  }

  const preview = prose.slice(0, 200);
  return (
    <div>
      {codeBlocks.map((block, i) => (
        <MarkdownContent key={`code-${i}`} content={block} />
      ))}
      {expanded ? (
        <>
          {prose ? <p className="text-sm text-gray-800 whitespace-pre-wrap">{prose}</p> : null}
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="mt-2 text-xs text-blue-600 hover:text-blue-800"
          >
            收起 ▲
          </button>
        </>
      ) : (
        <>
          {prose ? <p className="text-sm text-gray-800 whitespace-pre-wrap">{preview}…</p> : null}
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-2 text-xs text-blue-600 hover:text-blue-800"
          >
            展开全部 ▼
          </button>
        </>
      )}
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  const parts = content.split(/(```[\s\S]*?```)/g);
  return (
    <div className="text-sm text-gray-800 space-y-1">
      {parts.map((part, i) => {
        const codeMatch = part.match(/```(\w*)\s*([\s\S]*?)```/);
        if (codeMatch) {
          const lang = codeMatch[1];
          const code = codeMatch[2].trim();
          if (lang === 'report-action') return null;
          return (
            <pre key={i} className="bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto text-xs my-2">
              <code>{code}</code>
            </pre>
          );
        }
        return (
          <div
            key={i}
            className="whitespace-pre-wrap"
            dangerouslySetInnerHTML={{
              __html: part
                .replace(/^# (.+)$/gm, '<h3 class="font-semibold text-base mb-1">$1</h3>')
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'),
            }}
          />
        );
      })}
    </div>
  );
}

function EChartPanel({
  chartType,
  title,
  columns,
  rows,
}: {
  chartType: ChartType;
  title: string;
  columns: string[];
  rows: any[][];
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || chartType === 'table') return;
    const option = buildEChartsOption(chartType, title, columns, rows);
    if (!option) return;
    const chart = echarts.init(ref.current);
    chart.setOption(option);
    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.dispose();
    };
  }, [chartType, title, columns, rows]);

  if (chartType === 'table') return null;
  return <div ref={ref} className="w-full h-72 mt-3 bg-white rounded border border-gray-200" />;
}

function ResultTable({ columns, rows }: { columns: string[]; rows: any[][] }) {
  return (
    <div className="overflow-auto max-h-64 mt-2 border rounded">
      <table className="min-w-full text-xs">
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            {columns.map((c) => (
              <th key={c} className="px-2 py-1 text-left font-medium text-gray-700 border-b">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 100).map((row, ri) => (
            <tr key={ri} className="hover:bg-gray-50">
              {row.map((cell, ci) => (
                <td key={ci} className="px-2 py-1 border-b text-gray-600 whitespace-nowrap">
                  {cell == null ? '-' : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 100 && (
        <p className="text-xs text-gray-500 p-2">仅展示前 100 行</p>
      )}
    </div>
  );
}

const CHART_TYPES: { id: ChartType; label: string }[] = [
  { id: 'line', label: '折线图' },
  { id: 'bar', label: '柱状图' },
  { id: 'pie', label: '饼图' },
  { id: 'table', label: '表格' },
];

export default function ReportPage() {
  const { activeProject, activeDataSource } = useProjectStore();
  const store = useReportStore();
  const {
    messages,
    isGenerating,
    formDescription,
    sessionKey,
    currentSql,
    currentTitle,
    currentChartType,
    currentQueryResult,
    leftPanelTab,
    searchKeyword,
    reportRecords,
    setFormDescription,
    setIsGenerating,
    addMessage,
    removeMessagePair,
    replaceAssistantMessage,
    setCurrentSql,
    setCurrentTitle,
    setCurrentChartType,
    setCurrentQueryResult,
    setLeftPanelTab,
    setSearchKeyword,
    setReportRecords,
    newSession,
    loadFromRecord,
    setCurrentRecordId,
  } = store;

  const [templates, setTemplates] = useState<any[]>([]);
  const [relationships, setRelationships] = useState<any[]>([]);
  const [tableHeat, setTableHeat] = useState<any[]>([]);
  const [tableCandidates, setTableCandidates] = useState<any[]>([]);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [tableSearch, setTableSearch] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(currentTitle);
  const [attachedFile, setAttachedFile] = useState<{
    name: string;
    base64: string;
    kind: ReportAttachmentKind;
  } | null>(null);
  const [parsingAttachment, setParsingAttachment] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateNameInput, setTemplateNameInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chartExportRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /** 当前正在流式输出的助手消息 id，用于按 id 更新避免竞态乱序 */
  const streamingAssistantIdRef = useRef<string | null>(null);

  const projectId = activeProject?.id;
  const dataSourceId = activeDataSource?.id;
  const dbType = activeDataSource?.type;

  const loadSidebarData = useCallback(async () => {
    if (!projectId || !window.electronAPI?.report) return;
    const [history, tpls] = await Promise.all([
      window.electronAPI.report.getHistory(projectId),
      window.electronAPI.report.getTemplates(projectId),
    ]);
    setReportRecords(history);
    setTemplates(tpls);
    if (dataSourceId) {
      const [rels, heat, schema] = await Promise.all([
        window.electronAPI.report.getRelationships(dataSourceId),
        window.electronAPI.report.getTableHeat(dataSourceId),
        window.electronAPI.getSchemaFromCache(dataSourceId),
      ]);
      setRelationships(rels);
      setTableHeat(heat);
      setTableCandidates(schema || []);
    } else {
      setRelationships([]);
      setTableHeat([]);
      setTableCandidates([]);
      setSelectedTables([]);
    }
  }, [projectId, dataSourceId, setReportRecords]);

  useEffect(() => {
    loadSidebarData();
  }, [loadSidebarData]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  useEffect(() => {
    setTitleInput(currentTitle);
  }, [currentTitle]);

  useEffect(() => {
    if (!window.electronAPI?.report) return;
    return window.electronAPI.report.onStreamChunk(({ sessionKey: sk, content }) => {
      if (sk !== sessionKey) return;
      const assistantId = streamingAssistantIdRef.current;
      if (!assistantId) return;
      replaceAssistantMessage(assistantId, content);
    });
  }, [sessionKey, replaceAssistantMessage]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  };

  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = 22;
    const minH = lineHeight * 2 + 16;
    const maxH = lineHeight * 6 + 16;
    const next = Math.min(Math.max(el.scrollHeight, minH), maxH);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden';
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [formDescription, adjustTextareaHeight]);

  const lastAssistantId = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i].id;
    }
    return null;
  })();

  const markAssistantAborted = (assistantId: string) => {
    const current = useReportStore.getState().messages.find((m) => m.id === assistantId)?.content?.trim() || '';
    if (current.endsWith('（已中止）')) return;
    replaceAssistantMessage(assistantId, current ? `${current}\n\n（已中止）` : '（已中止）');
  };

  const handleAbortGeneration = () => {
    if (!isGenerating) return;
    void window.electronAPI.report.abortGeneration(sessionKey).catch(() => {});
    setIsGenerating(false);
    if (lastAssistantId) {
      markAssistantAborted(lastAssistantId);
    }
  };

  const runAssistantForUserText = async (
    userContent: string,
    assistantId: string,
    contextSql?: string | null
  ) => {
    if (!projectId || !dataSourceId || !dbType) return;

    try {
      const result = await window.electronAPI.report.sendMessage({
        sessionKey,
        projectId,
        dataSourceId,
        dbType,
        message: userContent,
        selectedTables,
        contextSql: contextSql || undefined,
      });

      if (!result.success) {
        if (result.cancelled) {
          markAssistantAborted(assistantId);
          return;
        }
        replaceAssistantMessage(assistantId, `❌ ${result.message}`);
        return;
      }

      const content = result.content || '';
      replaceAssistantMessage(assistantId, content || 'AI未返回有效内容，请重试');

      const action = extractReportAction(content);
      if (action?.action === 'chart_only' && action.chartType && currentQueryResult) {
        setCurrentChartType(action.chartType as ChartType);
        return;
      }

      const sql = extractSqlFromMarkdown(content);
      if (sql) {
        setCurrentSql(sql);
        setCurrentTitle(extractTitleFromMarkdown(content));
      }
    } catch (e) {
      replaceAssistantMessage(assistantId, `❌ ${(e as Error).message}`);
    }
  };

  const saveCurrentReport = async () => {
    if (!projectId || !dataSourceId) return;
    const id = store.currentRecordId || `report_${Date.now()}`;
    await window.electronAPI.report.saveHistory({
      id,
      projectId,
      dataSourceId,
      title: currentTitle,
      description: messages.find((m) => m.role === 'user')?.content || '',
      sql: currentSql || '',
      queryResult: JSON.stringify(currentQueryResult),
      chartType: currentChartType,
      chartConfig: '{}',
      messages: JSON.stringify(messages),
    });
    setCurrentRecordId(id);
    await loadSidebarData();
  };

  const buildUserContentWithAttachment = async (
    text: string,
    file: { name: string; base64: string; kind: ReportAttachmentKind }
  ): Promise<string | null> => {
    const parsed = await window.electronAPI.report.parseAttachment(
      file.kind,
      file.base64,
      file.name
    );
    if (!parsed.success) {
      showToast(parsed.message || '附件解析失败');
      return null;
    }
    const base = text.trim() || defaultPromptForAttachmentOnly(file.kind);
    return parsed.promptBlock ? `${base}\n\n${parsed.promptBlock}` : base;
  };

  const attachFile = async (file: File) => {
    const kind = detectReportAttachmentKind(file.name);
    if (!kind) {
      showToast('仅支持 Excel、txt/csv、图片（png/jpg 等）');
      return;
    }
    try {
      const base64 = await readFileAsBase64(file);
      setAttachedFile({ name: file.name, base64, kind });
    } catch {
      showToast('读取文件失败');
    }
  };

  const handleSend = async () => {
    const text = formDescription.trim();
    if ((!text && !attachedFile) || isGenerating || parsingAttachment) return;
    if (!projectId || !dataSourceId || !dbType) {
      alert('请先在项目管理中选择项目并配置数据源');
      return;
    }

    let userContent = text;
    const fileToParse = attachedFile;
    if (fileToParse) {
      setParsingAttachment(true);
      try {
        const merged = await buildUserContentWithAttachment(text, fileToParse);
        if (!merged) return;
        userContent = merged;
        setAttachedFile(null);
      } finally {
        setParsingAttachment(false);
      }
    } else if (!userContent) {
      return;
    }

    setFormDescription('');
    const sqlContext = currentSql;
    if (sqlContext) {
      setCurrentSql(null);
      setCurrentQueryResult(null);
    }
    const now = Date.now();
    const userMsg: ReportMessage = {
      id: `msg_${now}`,
      role: 'user',
      content: userContent,
      timestamp: now,
    };
    const assistantId = `msg_${now}_ai`;
    addMessage(userMsg);
    addMessage({ id: assistantId, role: 'assistant', content: '', timestamp: now });
    streamingAssistantIdRef.current = assistantId;
    setIsGenerating(true);

    try {
      await runAssistantForUserText(userContent, assistantId, sqlContext);
    } finally {
      streamingAssistantIdRef.current = null;
      setIsGenerating(false);
      textareaRef.current?.focus();
    }
  };

  const handleRegenerate = async (assistantId: string) => {
    const idx = messages.findIndex((m) => m.id === assistantId);
    if (idx <= 0) return;
    const userMsg = messages[idx - 1];
    if (userMsg.role !== 'user') return;

    replaceAssistantMessage(assistantId, '');
    const sqlContext = currentSql;
    if (sqlContext) {
      setCurrentSql(null);
      setCurrentQueryResult(null);
    }
    streamingAssistantIdRef.current = assistantId;
    setIsGenerating(true);
    try {
      await runAssistantForUserText(userMsg.content, assistantId, sqlContext);
    } finally {
      streamingAssistantIdRef.current = null;
      setIsGenerating(false);
      textareaRef.current?.focus();
    }
  };

  const handleCopyAssistant = async (msg: ReportMessage) => {
    const text = msg.content.replace(/```[\s\S]*?```/g, '').trim() || msg.content;
    await copyToClipboard(text);
    setCopiedId(msg.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExecuteSql = async (sql?: string) => {
    const toRun = sql || currentSql;
    if (!toRun || !projectId || !dataSourceId || !dbType) return;

    setIsGenerating(true);
    try {
      const result = await window.electronAPI.report.executeQuery({
        sessionKey,
        projectId,
        dataSourceId,
        dbType,
        sql: toRun,
      });

      if (!result.success) {
        alert(`执行失败：${result.message}`);
        return;
      }

      const qr = {
        columns: result.columns || [],
        rows: result.rows || [],
        rowCount: result.rowCount || 0,
        executionTime: result.executionTime || 0,
      };
      setCurrentQueryResult(qr);
      const chart = inferChartType(qr.columns, qr.rows);
      setCurrentChartType(chart);

      if (qr.rowCount === 0) {
        addMessage({
          id: `msg_${Date.now()}`,
          role: 'assistant',
          content: '查询结果为空，建议扩大时间范围或检查筛选条件。',
          isConfirm: true,
        });
      }

      await saveCurrentReport();
      await loadSidebarData();
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRerun = () => {
    if (currentSql) handleExecuteSql(currentSql);
  };

  const onFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) void attachFile(file);
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void attachFile(file);
    e.target.value = '';
  };

  const filteredHistory = reportRecords.filter(
    (r) =>
      !searchKeyword ||
      r.title.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      r.description.toLowerCase().includes(searchKeyword.toLowerCase())
  );
  const grouped = groupHistoryByTime(filteredHistory);
  const heatByTable = new Map(tableHeat.map((h) => [String(h.tableName).toUpperCase(), h]));
  const filteredTables = tableCandidates
    .filter((table) => {
      const keyword = tableSearch.trim().toLowerCase();
      if (!keyword) return true;
      return (
        String(table.tableName || '').toLowerCase().includes(keyword) ||
        String(table.comments || '').toLowerCase().includes(keyword)
      );
    })
    .sort((a, b) => {
      const ah = heatByTable.get(String(a.tableName).toUpperCase());
      const bh = heatByTable.get(String(b.tableName).toUpperCase());
      const as = (ah?.queryCount || 0) + (ah?.reportCount || 0) * 3 + (ah?.manualWeight || 0);
      const bs = (bh?.queryCount || 0) + (bh?.reportCount || 0) * 3 + (bh?.manualWeight || 0);
      return bs - as;
    });
  const toggleSelectedTable = (tableName: string) => {
    setSelectedTables((prev) =>
      prev.includes(tableName) ? prev.filter((t) => t !== tableName) : [...prev, tableName]
    );
  };

  if (!window.electronAPI?.report) {
    return <div className="p-8 text-gray-500">报表模块未加载</div>;
  }

  return (
    <div className="flex flex-1 h-full overflow-hidden bg-gray-50">
      {toast && (
        <div className="fixed top-16 right-4 z-50 bg-gray-800 text-white text-sm px-3 py-2 rounded shadow">
          {toast}
        </div>
      )}

      {/* 左侧面板 */}
      <aside className="w-80 border-r bg-white flex flex-col shrink-0">
        <div className="flex border-b">
          {(['history', 'templates', 'relationships', 'tables'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setLeftPanelTab(tab)}
              className={`flex-1 py-2 text-xs font-medium ${
                leftPanelTab === tab ? 'text-blue-600 border-b-2 border-blue-500' : 'text-gray-500'
              }`}
            >
              {tab === 'history' ? '📋 历史' : tab === 'templates' ? '📁 模板' : tab === 'relationships' ? '🔗 关系' : '🔥 表'}
            </button>
          ))}
        </div>

        {leftPanelTab === 'history' && (
          <div className="flex-1 flex flex-col overflow-hidden p-2">
            <input
              placeholder="搜索标题..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="mb-2 px-2 py-1 text-sm border rounded"
            />
            <button
              onClick={newSession}
              className="mb-2 text-xs bg-blue-500 text-white py-1.5 rounded hover:bg-blue-600"
            >
              + 新建报表
            </button>
            <div className="flex-1 overflow-y-auto space-y-3">
              {Object.entries(grouped).map(([label, items]) =>
                items.length > 0 ? (
                  <div key={label}>
                    <p className="text-xs text-gray-400 font-medium mb-1">{label}</p>
                    {items.map((r: ReportRecord) => (
                      <div
                        key={r.id}
                        onClick={() => loadFromRecord(r)}
                        className={`p-2 rounded cursor-pointer text-sm mb-1 ${
                          store.currentRecordId === r.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
                        }`}
                      >
                        <p className="font-medium truncate">{r.title}</p>
                        <p className="text-xs text-gray-400 truncate">{(r.sql || '').slice(0, 50)}</p>
                      </div>
                    ))}
                  </div>
                ) : null
              )}
            </div>
          </div>
        )}

        {leftPanelTab === 'templates' && (
          <div className="flex-1 overflow-y-auto p-2 text-sm">
            {templates.length === 0 ? (
              <p className="text-gray-400 text-center py-4">暂无模板</p>
            ) : (
              templates.map((t) => (
                <div key={t.id} className="p-2 border rounded mb-2 hover:bg-gray-50">
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-gray-500">{t.description}</p>
                  <button
                    className="text-xs text-blue-600 mt-1"
                    onClick={() => {
                      setCurrentSql(t.sqlTemplate);
                      setCurrentChartType(t.chartType || 'bar');
                    }}
                  >
                    应用
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {leftPanelTab === 'relationships' && (
          <div className="flex-1 overflow-y-auto p-2 text-xs">
            <div className="flex justify-between mb-2">
              <span className="text-gray-500">
                已验证({relationships.filter((r) => r.isValid === 1).length}) / 待验证(
                {relationships.filter((r) => r.isValid !== 1).length})
              </span>
              {dataSourceId && (
                <button
                  className="text-red-500"
                  onClick={async () => {
                    if (confirm('清空所有表关系？')) {
                      await window.electronAPI.report.clearRelationships(dataSourceId);
                      loadSidebarData();
                    }
                  }}
                >
                  清空
                </button>
              )}
            </div>
            {relationships.map((r) => (
              <div
                key={r.id}
                className={`p-2 mb-1 rounded border ${
                  r.isValid === 1 ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'
                }`}
              >
                <p>
                  {r.leftTable}.{r.leftColumn} → {r.rightTable}.{r.rightColumn}
                </p>
                <p className="text-gray-400">{r.joinType}</p>
                <button
                  className="text-red-500 mt-1"
                  onClick={async () => {
                    await window.electronAPI.report.deleteRelationship(r.id);
                    loadSidebarData();
                  }}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}

        {leftPanelTab === 'tables' && (
          <div className="flex-1 flex flex-col overflow-hidden p-2 text-xs">
            <div className="mb-2 rounded border border-amber-200 bg-amber-50 p-2 text-amber-800">
              已选 {selectedTables.length} 张表；选择后本次报表会优先且仅使用这些表。
            </div>
            <input
              placeholder="搜索表名/备注..."
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              className="mb-2 px-2 py-1 text-sm border rounded"
            />
            <div className="mb-2 flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedTables([])}
                className="flex-1 rounded border px-2 py-1 hover:bg-gray-50"
              >
                清空选择
              </button>
              {dataSourceId && (
                <button
                  type="button"
                  onClick={async () => {
                    if (confirm('清空当前数据源的表热度？')) {
                      await window.electronAPI.report.clearTableHeat(dataSourceId);
                      await loadSidebarData();
                    }
                  }}
                  className="flex-1 rounded border border-red-200 px-2 py-1 text-red-600 hover:bg-red-50"
                >
                  清空热度
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto space-y-1">
              {filteredTables.length === 0 ? (
                <p className="py-4 text-center text-gray-400">暂无表结构，请先在数据查询中加载表结构</p>
              ) : (
                filteredTables.map((table) => {
                  const heat = heatByTable.get(String(table.tableName).toUpperCase());
                  const score = (heat?.queryCount || 0) + (heat?.reportCount || 0) * 3 + (heat?.manualWeight || 0);
                  const checked = selectedTables.includes(table.tableName);
                  return (
                    <label
                      key={table.tableName}
                      className={`block cursor-pointer rounded border p-2 ${
                        checked ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelectedTable(table.tableName)}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-mono text-[11px] text-gray-800" title={table.tableName}>
                            {table.tableName}
                          </p>
                          {table.comments && <p className="truncate text-gray-400">{table.comments}</p>}
                          <p className="mt-1 text-gray-400">
                            热度 {score} · 查询 {heat?.queryCount || 0} · 报表 {heat?.reportCount || 0}
                          </p>
                        </div>
                        {heat?.id && (
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.preventDefault();
                              await window.electronAPI.report.deleteTableHeat(heat.id);
                              await loadSidebarData();
                            }}
                            className="text-red-500 hover:text-red-700"
                            title="删除热度"
                          >
                            删除
                          </button>
                        )}
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        )}
      </aside>

      {/* 右侧对话区 */}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-400 mt-20">
              <p className="text-lg mb-2">👋 你好！我是AI报表助手</p>
              <p className="text-sm">告诉我你想查询什么数据</p>
              {!dataSourceId && (
                <p className="text-amber-600 text-sm mt-4">请先在项目管理中配置数据源，并在数据查询中加载表结构</p>
              )}
            </div>
          )}

          {messages.map((msg) => {
            const isLastAssistant = msg.role === 'assistant' && msg.id === lastAssistantId;
            const showThinking = isLastAssistant && isGenerating && !msg.content.trim();

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-blue-500 text-white'
                      : msg.isConfirm
                        ? 'bg-amber-50 border border-amber-200 text-gray-800'
                        : 'bg-white border border-gray-200 shadow-sm'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  ) : showThinking ? (
                    <ThinkingDots />
                  ) : !msg.content.trim() ? (
                    <p className="text-sm text-gray-500">AI未返回有效内容，请重试</p>
                  ) : (
                    <CollapsibleAssistantContent content={msg.content} />
                  )}

                  {msg.role === 'assistant' && !showThinking && msg.content.trim() && (
                    <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-2 text-xs text-gray-500">
                      <button
                        type="button"
                        onClick={() => handleCopyAssistant(msg)}
                        className="inline-flex items-center gap-1 hover:text-blue-600"
                      >
                        {copiedId === msg.id ? '已复制 ✓' : '📋 复制'}
                      </button>
                      {isLastAssistant && !isGenerating && (
                        <button
                          type="button"
                          onClick={() => handleRegenerate(msg.id)}
                          className="inline-flex items-center gap-1 hover:text-blue-600"
                        >
                          🔄 重新生成
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeMessagePair(msg.id)}
                        className="inline-flex items-center gap-1 hover:text-red-600"
                      >
                        🗑️ 删除
                      </button>
                    </div>
                  )}
                </div>
                <span className="mt-1 px-1 text-[10px] text-gray-400">{formatMessageTime(msg)}</span>
              </div>
            );
          })}

          {currentSql && (
            <div className="bg-white border rounded-lg p-4 shadow-sm">
              {editingTitle ? (
                <input
                  className="font-semibold border-b w-full mb-2"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onBlur={() => {
                    setCurrentTitle(titleInput);
                    setEditingTitle(false);
                    saveCurrentReport();
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  autoFocus
                />
              ) : (
                <h3
                  className="font-semibold text-gray-800 mb-2 cursor-pointer"
                  onDoubleClick={() => setEditingTitle(true)}
                  title="双击编辑标题"
                >
                  {currentTitle}
                </h3>
              )}
              <pre className="bg-slate-900 text-green-400 p-3 rounded text-xs overflow-x-auto">{currentSql}</pre>
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  onClick={() => handleExecuteSql()}
                  disabled={isGenerating}
                  className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 disabled:opacity-50"
                >
                  执行查询
                </button>
                <button
                  onClick={async () => {
                    await copyToClipboard(currentSql);
                    showToast('SQL 已复制');
                  }}
                  className="px-3 py-1.5 border text-sm rounded hover:bg-gray-50"
                >
                  复制 SQL
                </button>
                <button onClick={handleRerun} className="px-3 py-1.5 border text-sm rounded hover:bg-gray-50">
                  重跑
                </button>
              </div>
            </div>
          )}

          {currentQueryResult && (
            <div className="bg-white border rounded-lg p-4 shadow-sm" ref={chartExportRef}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500">
                  {currentQueryResult.rowCount} 行 · {currentQueryResult.executionTime}ms
                </span>
                <div className="flex gap-1">
                  {CHART_TYPES.map((ct) => (
                    <button
                      key={ct.id}
                      onClick={() => setCurrentChartType(ct.id)}
                      className={`px-2 py-0.5 text-xs rounded ${
                        currentChartType === ct.id ? 'bg-blue-500 text-white' : 'bg-gray-100'
                      }`}
                    >
                      {ct.label}
                    </button>
                  ))}
                </div>
              </div>
              <EChartPanel
                chartType={currentChartType}
                title={currentTitle}
                columns={currentQueryResult.columns}
                rows={currentQueryResult.rows}
              />
              <ResultTable columns={currentQueryResult.columns} rows={currentQueryResult.rows} />
              <div className="flex gap-2 mt-3">
                <button
                  className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
                  onClick={() => exportCsv(currentQueryResult.columns, currentQueryResult.rows, currentTitle)}
                >
                  导出 CSV
                </button>
                <button
                  className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
                  onClick={() => exportExcel(currentQueryResult.columns, currentQueryResult.rows, currentTitle)}
                >
                  导出 Excel
                </button>
                <button
                  className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
                  onClick={async () => {
                    const el = chartExportRef.current?.querySelector('canvas')?.parentElement;
                    if (!el) return;
                    const chart = echarts.getInstanceByDom(el as HTMLElement);
                    if (!chart) return;
                    const url = chart.getDataURL({ type: 'png', pixelRatio: 2 });
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${currentTitle}.png`;
                    a.click();
                  }}
                >
                  导出图片
                </button>
                {savingTemplate ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      className="px-2 py-1 text-sm border rounded w-40"
                      placeholder="模板名称"
                      value={templateNameInput}
                      onChange={(e) => setTemplateNameInput(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          const name = templateNameInput.trim();
                          if (!name || !projectId || !dataSourceId) {
                            setSavingTemplate(false);
                            return;
                          }
                          await window.electronAPI.report.saveTemplate({
                            projectId,
                            dataSourceId,
                            name,
                            description: '',
                            sqlTemplate: currentSql || '',
                            parameters: '[]',
                            chartType: currentChartType,
                          });
                          setSavingTemplate(false);
                          setTemplateNameInput('');
                          loadSidebarData();
                          showToast('模板已保存');
                        } else if (e.key === 'Escape') {
                          setSavingTemplate(false);
                          setTemplateNameInput('');
                        }
                      }}
                    />
                    <button
                      className="px-2 py-1 text-sm border rounded hover:bg-gray-50"
                      onClick={async () => {
                        const name = templateNameInput.trim();
                        if (!name || !projectId || !dataSourceId) {
                          setSavingTemplate(false);
                          return;
                        }
                        await window.electronAPI.report.saveTemplate({
                          projectId,
                          dataSourceId,
                          name,
                          description: '',
                          sqlTemplate: currentSql || '',
                          parameters: '[]',
                          chartType: currentChartType,
                        });
                        setSavingTemplate(false);
                        setTemplateNameInput('');
                        loadSidebarData();
                        showToast('模板已保存');
                      }}
                    >
                      确认
                    </button>
                    <button
                      className="px-2 py-1 text-sm border rounded hover:bg-gray-50"
                      onClick={() => {
                        setSavingTemplate(false);
                        setTemplateNameInput('');
                      }}
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
                    onClick={() => {
                      setSavingTemplate(true);
                      setTemplateNameInput('');
                    }}
                  >
                    保存为模板
                  </button>
                )}
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* 输入区 */}
        <div
          className="border-t bg-white p-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onFileDrop}
        >
          {attachedFile && (
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs text-blue-700">
              <span>
                {attachmentKindIcon(attachedFile.kind)} {attachmentKindLabel(attachedFile.kind)} ·{' '}
                {attachedFile.name}
              </span>
              <button
                type="button"
                onClick={() => setAttachedFile(null)}
                className="text-blue-400 hover:text-blue-700"
                aria-label="移除附件"
              >
                ×
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept={reportAttachmentAccept()}
            onChange={onFileInputChange}
          />
          <div className="flex gap-2 items-end">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isGenerating || parsingAttachment}
              className="px-2 py-2 text-gray-500 hover:text-blue-600 self-end border rounded-lg hover:border-blue-300 disabled:opacity-40"
              title="添加 Excel、文本或图片附件"
              aria-label="添加附件"
            >
              📎
            </button>
            <div className="relative flex-1">
              <textarea
                ref={textareaRef}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="描述报表需求；可拖拽或点击 📎 添加 Excel、txt、图片"
                rows={2}
                className="w-full border rounded-lg px-3 py-2 pr-8 pb-5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <div
                className={`pointer-events-none absolute bottom-1 right-2 text-[10px] ${
                  formDescription.length > 2000 ? 'text-red-500' : 'text-gray-400'
                }`}
              >
                {formDescription.length}/2000
              </div>
            </div>
            {formDescription.trim() && !isGenerating && (
              <button
                type="button"
                onClick={() => setFormDescription('')}
                className="px-2 py-2 text-gray-400 hover:text-gray-600 self-end"
                aria-label="清空"
              >
                ×
              </button>
            )}
            {isGenerating ? (
              <button
                type="button"
                onClick={handleAbortGeneration}
                className="inline-flex items-center gap-1.5 self-end rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-all hover:bg-red-100"
              >
                中止
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={(!formDescription.trim() && !attachedFile) || parsingAttachment}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all self-end disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 disabled:opacity-40 disabled:shadow-none bg-blue-500 text-white hover:bg-blue-600 hover:shadow-md"
              >
                {parsingAttachment ? (
                  <>
                    <SpinnerIcon />
                    解析附件...
                  </>
                ) : (
                  <>
                    发送
                    <SendIcon />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
