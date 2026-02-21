import { useEffect, useState } from 'react'
import type { SectionKey, TableLayout, TableLayoutStore } from '../types'

const TABLE_LAYOUT_KEY = 'flamingo.table_layout.v4'
const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  progress: 108,
  speed: 92,
  eta: 78,
  status: 80,
  actions: 144,
  size: 110,
  completed_at: 156,
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
  const mergedWidths = { ...base.columnWidths, ...(obj.columnWidths || {}) }
  const widthCaps: Record<string, [number, number]> = {
    progress: [88, 180],
    speed: [76, 140],
    eta: [68, 120],
    status: [70, 96],
    actions: [120, 200],
    size: [90, 150],
    completed_at: [120, 220],
  }
  const widths = Object.fromEntries(
    Object.entries(mergedWidths).map(([key, value]) => {
      const [min, max] = widthCaps[key] || [80, 260]
      const n = Number(value)
      const safe = Number.isFinite(n) ? Math.floor(n) : base.columnWidths[key] || min
      return [key, Math.max(min, Math.min(max, safe))]
    }),
  )
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
