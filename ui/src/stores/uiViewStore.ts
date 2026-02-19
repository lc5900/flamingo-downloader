import { useState } from 'react'
import type { SectionKey, TaskSortKey } from '../types'

export function useUiViewStore() {
  const [section, setSection] = useState<SectionKey>('downloading')
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sortBy, setSortBy] = useState<TaskSortKey>('updated_desc')

  return {
    section,
    setSection,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    categoryFilter,
    setCategoryFilter,
    sortBy,
    setSortBy,
  }
}
