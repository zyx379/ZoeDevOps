import type { MutableRefObject, ReactNode } from 'react';
import type { TableColumn, TableInfo } from '../stores/dataSourceStore';

export interface QueryConditionRow {
  id: string;
  columnName: string;
  operator: string;
  value: string;
  joinWithPrevious?: 'AND' | 'OR';
}

export interface SortCondition {
  id?: string;
  columnName: string;
  order: 'ASC' | 'DESC';
}

interface TableConditionsModalsProps {
  table: { tableName: string; tableInfo: TableInfo };
  showQuery: boolean;
  showSort: boolean;
  onCloseQuery: () => void;
  onCloseSort: () => void;
  queryConditions: QueryConditionRow[];
  sortConditions: SortCondition[];
  showColumnNamesInChinese: boolean;
  getColumnDisplayName: (column: TableColumn) => string;
  getUsedColumns: (table: TableInfo) => TableColumn[];
  queryFieldFilter: string;
  sortFieldFilter: string;
  queryDropdownOpen: boolean;
  sortDropdownOpen: boolean;
  onQueryFieldFilterChange: (v: string) => void;
  onSortFieldFilterChange: (v: string) => void;
  onQueryDropdownOpen: (open: boolean) => void;
  onSortDropdownOpen: (open: boolean) => void;
  onAddQueryCondition: (columnName: string) => void;
  onAddSortCondition: (columnName: string) => void;
  onRemoveQueryCondition: (index: number) => void;
  onRemoveSortCondition: (index: number) => void;
  onUpdateQueryCondition: (index: number, field: 'operator' | 'value', value: string) => void;
  onUpdateConditionJoin: (index: number, join: 'AND' | 'OR') => void;
  onToggleSortOrder: (index: number) => void;
  onReorderSortConditions: (from: number, to: number) => void;
  onSaveTemplate: () => void;
  valueInputRef: MutableRefObject<Record<string, HTMLInputElement | null>>;
}

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
  wide,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className={`relative z-50 flex max-h-[90vh] w-full flex-col rounded-lg bg-white shadow-xl ${
          wide ? 'max-w-3xl' : 'max-w-lg'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-200 p-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-700">{title}</h3>
            {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 hover:bg-slate-100">
            <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        <div className="flex justify-end border-t border-slate-200 p-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}

export function TableConditionsModals(props: TableConditionsModalsProps) {
  const {
    table,
    showQuery,
    showSort,
    onCloseQuery,
    onCloseSort,
    queryConditions,
    sortConditions,
    showColumnNamesInChinese,
    getColumnDisplayName,
    getUsedColumns,
    queryFieldFilter,
    sortFieldFilter,
    queryDropdownOpen,
    sortDropdownOpen,
    onQueryFieldFilterChange,
    onSortFieldFilterChange,
    onQueryDropdownOpen,
    onSortDropdownOpen,
    onAddQueryCondition,
    onAddSortCondition,
    onRemoveQueryCondition,
    onRemoveSortCondition,
    onUpdateQueryCondition,
    onUpdateConditionJoin,
    onToggleSortOrder,
    onReorderSortConditions,
    onSaveTemplate,
    valueInputRef,
  } = props;

  const tableName = table.tableName;
  const usedColumns = getUsedColumns(table.tableInfo);

  const fieldPicker = (
    filter: string,
    dropdownOpen: boolean,
    onFilterChange: (v: string) => void,
    onDropdownOpen: (open: boolean) => void,
    onAdd: (col: string) => void,
    role: string
  ) => (
    <div className="relative">
      <input
        type="text"
        placeholder="+ 添加字段"
        value={filter}
        onChange={(e) => onFilterChange(e.target.value)}
        className="w-36 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        onFocus={() => onDropdownOpen(true)}
        onBlur={() => {
          setTimeout(() => {
            onDropdownOpen(false);
            onFilterChange('');
          }, 200);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const val = e.currentTarget.value.trim();
            if (val) {
              const valid = usedColumns.map((c) => c.columnName);
              const match = valid.find((c) => c.toLowerCase() === val.toLowerCase());
              if (match) onAdd(match);
            }
          }
        }}
        data-table={tableName}
        role={role}
      />
      {dropdownOpen && (
        <div className="absolute left-0 top-full z-[60] mt-1 max-h-48 min-w-[10rem] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {usedColumns
            .filter((col) => {
              const ft = filter.toLowerCase();
              return (
                !ft ||
                col.columnName.toLowerCase().includes(ft) ||
                getColumnDisplayName(col).toLowerCase().includes(ft)
              );
            })
            .map((col) => (
              <div
                key={col.columnName}
                className="cursor-pointer px-3 py-1.5 text-xs hover:bg-blue-50"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onAdd(col.columnName);
                }}
              >
                <span className="font-mono">{col.columnName}</span>
                <span className="ml-1 text-slate-400">{getColumnDisplayName(col)}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      {showQuery && (
        <ModalShell
          title="查询条件"
          subtitle="自上而下组合；AND / OR 表示与上一条完整条件的关系"
          onClose={onCloseQuery}
          wide
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {queryConditions.length > 0 && (
              <button
                type="button"
                onClick={onSaveTemplate}
                className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"
              >
                保存为模板
              </button>
            )}
            {usedColumns.length > 0 &&
              fieldPicker(
                queryFieldFilter,
                queryDropdownOpen,
                onQueryFieldFilterChange,
                onQueryDropdownOpen,
                onAddQueryCondition,
                'query-input'
              )}
          </div>
          {queryConditions.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">暂无条件，使用「添加字段」从已标记列中选择</p>
          ) : (
            queryConditions.map((condition, index) => {
              const column = table.tableInfo.columns.find((c) => c.columnName === condition.columnName);
              const join = condition.joinWithPrevious ?? 'AND';
              return (
                <div key={condition.id} className={index > 0 ? 'mt-1' : ''}>
                  {index > 0 && (
                    <div className="flex justify-center py-2">
                      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
                        <button
                          type="button"
                          onClick={() => onUpdateConditionJoin(index, 'AND')}
                          className={`rounded-md px-3 py-1 text-[11px] font-semibold ${
                            join === 'AND' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          AND
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateConditionJoin(index, 'OR')}
                          className={`rounded-md px-3 py-1 text-[11px] font-semibold ${
                            join === 'OR' ? 'bg-amber-600 text-white' : 'text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          OR
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="flex max-w-full flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-2 shadow-sm">
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-slate-100 text-[11px] font-bold text-slate-600">
                      {index + 1}
                    </span>
                    <div className="min-w-0 max-w-[12rem] flex-shrink-0">
                      <div className="truncate font-mono text-[11px] text-slate-900">{condition.columnName}</div>
                      {showColumnNamesInChinese && column?.comments ? (
                        <div className="truncate text-[10px] text-slate-400">{column.comments}</div>
                      ) : null}
                    </div>
                    <select
                      value={condition.operator}
                      onChange={(e) => onUpdateQueryCondition(index, 'operator', e.target.value)}
                      className="rounded border border-slate-200 bg-white py-1 pl-1 pr-6 text-xs"
                    >
                      <option value="=">=</option>
                      <option value="!=">!=</option>
                      <option value=">">&gt;</option>
                      <option value=">=">&gt;=</option>
                      <option value="<">&lt;</option>
                      <option value="<=">&lt;=</option>
                      <option value="LIKE">LIKE</option>
                      <option value="IN">IN</option>
                      <option value="IS NULL">NULL</option>
                      <option value="IS NOT NULL">NOT NULL</option>
                    </select>
                    {condition.operator !== 'IS NULL' && condition.operator !== 'IS NOT NULL' && (
                      <input
                        ref={(el) => {
                          valueInputRef.current[`${tableName}-${condition.id}`] = el;
                        }}
                        type="text"
                        value={condition.value}
                        onChange={(e) => onUpdateQueryCondition(index, 'value', e.target.value)}
                        placeholder="值"
                        className="min-w-[6rem] flex-1 rounded border border-transparent bg-slate-50 px-2 py-1 text-xs focus:border-blue-400 focus:bg-white focus:outline-none"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => onRemoveQueryCondition(index)}
                      className="ml-auto text-red-500 hover:text-red-700"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </ModalShell>
      )}

      {showSort && (
        <ModalShell
          title="排序条件"
          subtitle="拖拽 ⋮⋮ 调整顺序；点击箭头切换升序 / 降序"
          onClose={onCloseSort}
        >
          <div className="mb-3">
            {usedColumns.length > 0 &&
              fieldPicker(
                sortFieldFilter,
                sortDropdownOpen,
                onSortFieldFilterChange,
                onSortDropdownOpen,
                onAddSortCondition,
                'sort-input'
              )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {sortConditions.map((sort, index) => {
              const column = table.tableInfo.columns.find((c) => c.columnName === sort.columnName);
              const sortKey = sort.id || `sort-${sort.columnName}-${index}`;
              return (
                <div
                  key={sortKey}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('application/x-sort-index', String(index));
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = parseInt(e.dataTransfer.getData('application/x-sort-index'), 10);
                    if (!Number.isNaN(from)) onReorderSortConditions(from, index);
                  }}
                  className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2 text-xs shadow-sm"
                >
                  <span className="cursor-grab px-1 text-slate-400" aria-hidden>
                    ⋮⋮
                  </span>
                  <span className="max-w-[10rem] truncate font-mono text-[11px]">
                    {column ? getColumnDisplayName(column) : sort.columnName}
                  </span>
                  <button
                    type="button"
                    onClick={() => onToggleSortOrder(index)}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-sm"
                  >
                    {sort.order === 'ASC' ? '↑' : '↓'}
                  </button>
                  <button type="button" onClick={() => onRemoveSortCondition(index)} className="text-slate-400 hover:text-red-600">
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </ModalShell>
      )}
    </>
  );
}
