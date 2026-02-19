import { useEffect, useState } from 'react'
import type { SectionKey, TableLayout, TableLayoutStore } from '../types'

const TABLE_LAYOUT_KEY = 'flamingo.table_layout.v1'
const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  progress: 180,
  speed: 105,
  eta: 88,
  status: 180,
  actions: 180,
  size: 120,
  completed_at: 180,
}
const DEFAULT_TABLE_LAYOUT: TableLayoutStore = {
  downloading: {
    columnWidths: { ...DEFAULT_COLUMN_WIDTHS },
    columnOrder: ['name', 'progress', 'speed', 'eta', 'status', 'actions'],
    hiddenColumns: [],
    density: 'small',
  },
  downloaded: {
    columnWidths: { ...DEFAULT_COLUMN_WIDTHS },
    columnOrder: ['name', 'size', 'completed_at', 'actions'],
    hiddenColumns: [],
    density: 'small',
  },
}

export function defaultLayoutFor(section: SectionKey): TableLayout {
  const d = DEFAULT_TABLE_LAYOUT[section]
  return {
    columnWidths: { ...d.columnWidths },
    columnOrder: [...d.columnOrder],
    hiddenColumns: [...d.hiddenColumns],
    density: d.density,
  }
}

function sanitizeLayout(section: SectionKey, raw: unknown): TableLayout {
  const base = defaultLayoutFor(section)
  if (!raw || typeof raw !== 'object') return base
  const obj = raw as Partial<TableLayout>
  const widths = { ...base.columnWidths, ...(obj.columnWidths || {}) }
  const allowed = new Set(base.columnOrder)
  const order = Array.isArray(obj.columnOrder)
    ? obj.columnOrder.filter((k): k is string => typeof k === 'string' && allowed.has(k))
    : []
  const mergedOrder = [...order, ...base.columnOrder.filter((k) => !order.includes(k))]
  const hiddenColumns = Array.isArray(obj.hiddenColumns)
    ? obj.hiddenColumns.filter((k): k is string => typeof k === 'string' && allowed.has(k))
    : []
  const density =
    obj.density === 'middle' || obj.density === 'large' || obj.density === 'small'
      ? obj.density
      : base.density
  return {
    columnWidths: widths,
    columnOrder: mergedOrder,
    hiddenColumns,
    density,
  }
}

function loadTableLayoutStore(): TableLayoutStore {
  try {
    const raw = localStorage.getItem(TABLE_LAYOUT_KEY)
    if (!raw) {
      return {
        downloading: defaultLayoutFor('downloading'),
        downloaded: defaultLayoutFor('downloaded'),
      }
    }
    const parsed = JSON.parse(raw) as Partial<TableLayoutStore>
    return {
      downloading: sanitizeLayout('downloading', parsed?.downloading),
      downloaded: sanitizeLayout('downloaded', parsed?.downloaded),
    }
  } catch {
    return {
      downloading: defaultLayoutFor('downloading'),
      downloaded: defaultLayoutFor('downloaded'),
    }
  }
}

export function useTableLayout() {
  const [tableLayouts, setTableLayouts] = useState<TableLayoutStore>(() => loadTableLayoutStore())

  useEffect(() => {
    localStorage.setItem(TABLE_LAYOUT_KEY, JSON.stringify(tableLayouts))
  }, [tableLayouts])

  return {
    tableLayouts,
    setTableLayouts,
  }
}
