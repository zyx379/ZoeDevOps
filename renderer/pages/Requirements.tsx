import { useEffect, useMemo, useState } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { exportExcel } from '../utils/reportUtils';
import type { RequirementCompareRow, RequirementCompareServiceResult, RequirementStatus } from '../electron';

const SAMPLE_INPUT = `收费前端 release-1.168.14
医嘱后端 release-1.168.25
门诊前端 release-1.168.13
医嘱前端 release-1.168.22
药剂前端 release-1.168.17
收费后端 release-1.168.41`;

const STATUS_FILTER_OPTIONS: Array<RequirementStatus | '全部'> = ['全部', '已通过', '未通过', '审核中', '未标注'];
const STATUS_EDIT_OPTIONS: RequirementStatus[] = ['已通过', '未通过', '审核中', '未标注'];

function formatDateTime(value: string): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function statusClass(status: RequirementStatus): string {
  switch (status) {
    case '已通过':
      return 'bg-green-50 text-green-700 border-green-200';
    case '未通过':
      return 'bg-red-50 text-red-700 border-red-200';
    case '审核中':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    default:
      return 'bg-gray-50 text-gray-600 border-gray-200';
  }
}

function ServiceSummary({ services }: { services: RequirementCompareServiceResult[] }) {
  if (services.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {services.map((service) => (
        <div
          key={`${service.serviceName}-${service.targetVersion}`}
          className={`rounded-lg border bg-white p-3 shadow-sm ${
            service.error ? 'border-red-200' : 'border-gray-200'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium text-gray-900">{service.serviceName}</p>
              <p className="mt-1 text-xs text-gray-500">
                线上 {service.onlineVersion || '-'} → 预发 {service.targetVersion}
              </p>
              {service.compareFromRef && service.compareToRef && !service.error && (
                <p className="mt-1 text-xs text-gray-400">
                  Git ref：{service.compareFromRef} → {service.compareToRef}
                </p>
              )}
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                service.error ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
              }`}
            >
              {service.error ? '失败' : `${service.commitCount} commits`}
            </span>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            仓库：{service.repositories.length ? service.repositories.join('，') : '-'}
          </p>
          {service.error && <p className="mt-2 text-xs text-red-600">{service.error}</p>}
        </div>
      ))}
    </div>
  );
}

export default function RequirementsPage() {
  const { activeProject, activeConfig, loadActiveProjectDetails } = useProjectStore();
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [rows, setRows] = useState<RequirementCompareRow[]>([]);
  const [services, setServices] = useState<RequirementCompareServiceResult[]>([]);
  const [authorFilter, setAuthorFilter] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<RequirementStatus | '全部'>('全部');

  useEffect(() => {
    loadActiveProjectDetails();
  }, [loadActiveProjectDetails]);

  const filteredRows = useMemo(() => {
    const author = authorFilter.trim().toLowerCase();
    const module = moduleFilter.trim().toLowerCase();
    return rows.filter((row) => {
      const authorMatched = !author || row.author.toLowerCase().includes(author);
      const moduleMatched = !module || row.modules.join(',').toLowerCase().includes(module);
      const statusMatched = statusFilter === '全部' || row.status === statusFilter;
      return authorMatched && moduleMatched && statusMatched;
    });
  }, [rows, authorFilter, moduleFilter, statusFilter]);

  const handleCompare = async () => {
    if (!activeProject?.id) {
      setMessage('请先在项目管理中选择一个项目');
      return;
    }
    if (!inputText.trim()) {
      setMessage('请输入服务和预发布版本');
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      const result = await window.electronAPI.requirements.compareVersions({
        projectId: activeProject.id,
        inputText,
      });
      setRows(result.rows || []);
      setServices(result.services || []);
      setMessage(result.message || (result.success ? '比对完成' : '比对失败'));
    } catch (error) {
      setRows([]);
      setServices([]);
      setMessage((error as Error).message || '比对失败');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = (rowId: string, status: RequirementStatus) => {
    setRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, status } : row)));
  };

  const handleExport = async () => {
    if (filteredRows.length === 0) return;
    await exportExcel(
      ['提交人', '需求标题', '模块', '最后提交时间', '状态', '服务', 'Commit'],
      filteredRows.map((row) => [
        row.author,
        row.title,
        row.modules.join('，'),
        formatDateTime(row.lastCommittedAt),
        row.status,
        row.services.join('，'),
        row.commitIds.join('，'),
      ]),
      '需求版本比对结果'
    );
  };

  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">需求管理</h1>
              <p className="mt-1 text-sm text-gray-500">
                输入服务和预发布版本，自动读取线上版本，仅汇总预发布相对线上新增的提交。
              </p>
              <div className="mt-2 text-xs text-gray-500">
                当前项目：{activeProject ? activeProject.name : <span className="text-red-500">未选择</span>}
                <span className="mx-2">|</span>
                Version Path：{activeConfig?.apiVersionPath || <span className="text-amber-600">未配置</span>}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setInputText(SAMPLE_INPUT)}
                className="rounded border px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                填入示例
              </button>
              <button
                type="button"
                onClick={handleCompare}
                disabled={loading}
                className="rounded bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
              >
                {loading ? '比对中...' : '开始比对'}
              </button>
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">服务与预发布版本</label>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              rows={8}
              placeholder="每行一个服务：收费前端 release-1.168.14"
              className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
              <p>线上版本接口 Token 与智能分析一致，从项目管理中的 Redis 配置自动获取（前缀 ONELINK:TOKEN:）。</p>
              <p>需配置 API Base URL、Version Path、Redis，以及代码仓库 / GitLab Token。</p>
            </div>
            {message && (
              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                {message}
              </div>
            )}
          </div>
        </div>

        <ServiceSummary services={services} />

        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b p-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">比对结果</h2>
              <p className="mt-1 text-xs text-gray-500">
                共 {rows.length} 条，当前筛选 {filteredRows.length} 条
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                value={authorFilter}
                onChange={(e) => setAuthorFilter(e.target.value)}
                placeholder="筛选提交人"
                className="rounded border px-3 py-1.5 text-sm"
              />
              <input
                value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
                placeholder="筛选模块"
                className="rounded border px-3 py-1.5 text-sm"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as RequirementStatus | '全部')}
                className="rounded border px-3 py-1.5 text-sm"
              >
                {STATUS_FILTER_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleExport}
                disabled={filteredRows.length === 0}
                className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                导出 Excel
              </button>
            </div>
          </div>

          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium">提交人</th>
                  <th className="min-w-[320px] px-4 py-3 text-left font-medium">需求标题</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium">模块</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium">最后提交时间</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium">状态</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium">GitLab</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                      暂无结果
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.id} className="border-t hover:bg-gray-50">
                      <td className="whitespace-nowrap px-4 py-3 text-gray-700">{row.author || '-'}</td>
                      <td className="px-4 py-3 text-gray-900">
                        <div className="font-medium">{row.title}</div>
                        <div className="mt-1 text-xs text-gray-400">服务：{row.services.join('，')}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-700">{row.modules.join('，')}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                        {formatDateTime(row.lastCommittedAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <select
                          value={row.status}
                          onChange={(e) => handleStatusChange(row.id, e.target.value as RequirementStatus)}
                          className={`rounded border px-2 py-1 text-xs ${statusClass(row.status)}`}
                        >
                          {STATUS_EDIT_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {row.commitUrl ? (
                          <button
                            type="button"
                            onClick={() => window.open(row.commitUrl, '_blank')}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            查看 commit
                          </button>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
