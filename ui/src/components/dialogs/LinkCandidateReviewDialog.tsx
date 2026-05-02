import type React from 'react'
import { Button, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { LinkCandidate } from '../../types'
import { fmtBytes } from '../../utils/format'

type SizeFilter = 'all' | 'unknown' | 'lt100m' | '100m-1g' | 'ge1g'

export interface LinkCandidateReviewDialogProps {
  t: (k: string) => string
  open: boolean
  loading: boolean
  creating: boolean
  mode: 'text' | 'page'
  candidates: LinkCandidate[]
  selectedUrls: string[]
  query: string
  kindFilter: string
  domainFilter: string
  sizeFilter: SizeFilter
  saveDir: string
  category: string
  setQuery: (value: string) => void
  setKindFilter: (value: string) => void
  setDomainFilter: (value: string) => void
  setSizeFilter: (value: SizeFilter) => void
  setSaveDir: (value: string) => void
  setCategory: (value: string) => void
  onSelectionChange: (urls: string[]) => void
  onConfirm: () => void
  onCancel: () => void
}

function candidateDomain(candidate: LinkCandidate): string {
  try {
    return new URL(candidate.final_url || candidate.url).hostname || ''
  } catch {
    return ''
  }
}

function sizeBucket(candidate: LinkCandidate): SizeFilter {
  const size = Number(candidate.content_length || 0)
  if (size <= 0) return 'unknown'
  if (size < 100 * 1024 * 1024) return 'lt100m'
  if (size < 1024 * 1024 * 1024) return '100m-1g'
  return 'ge1g'
}

export const LinkCandidateReviewDialog: React.FC<LinkCandidateReviewDialogProps> = ({
  t,
  open,
  loading,
  creating,
  mode,
  candidates,
  selectedUrls,
  query,
  kindFilter,
  domainFilter,
  sizeFilter,
  saveDir,
  category,
  setQuery,
  setKindFilter,
  setDomainFilter,
  setSizeFilter,
  setSaveDir,
  setCategory,
  onSelectionChange,
  onConfirm,
  onCancel,
}) => {
  const normalizedQuery = query.trim().toLowerCase()
  const kindOptions = Array.from(new Set(candidates.map((item) => item.kind).filter(Boolean))).sort()
  const domainOptions = Array.from(
    new Set(candidates.map((item) => candidateDomain(item)).filter(Boolean)),
  ).sort()

  const filteredCandidates = candidates.filter((candidate) => {
    const domain = candidateDomain(candidate)
    const bucket = sizeBucket(candidate)
    if (kindFilter !== 'all' && candidate.kind !== kindFilter) return false
    if (domainFilter !== 'all' && domain !== domainFilter) return false
    if (sizeFilter !== 'all' && bucket !== sizeFilter) return false
    if (!normalizedQuery) return true
    const haystack = [
      candidate.url,
      candidate.final_url || '',
      candidate.filename_hint || '',
      candidate.content_type || '',
      domain,
    ]
      .join(' ')
      .toLowerCase()
    return haystack.includes(normalizedQuery)
  })

  const visibleUrlSet = new Set(filteredCandidates.map((item) => item.url))
  const selectedVisibleCount = selectedUrls.filter((url) => visibleUrlSet.has(url)).length

  const columns: ColumnsType<LinkCandidate> = [
    {
      title: t('colName'),
      dataIndex: 'filename_hint',
      width: 240,
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong ellipsis>
            {record.filename_hint || record.final_url || record.url}
          </Typography.Text>
          <Typography.Text type="secondary" ellipsis>
            {record.url}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: t('candidateType'),
      dataIndex: 'kind',
      width: 110,
      render: (value) => <Tag>{String(value || 'http').toUpperCase()}</Tag>,
    },
    {
      title: t('candidateDomain'),
      key: 'domain',
      width: 180,
      render: (_value, record) => candidateDomain(record) || t('candidateUnknownDomain'),
    },
    {
      title: t('candidateSizeGroup'),
      key: 'size',
      width: 160,
      render: (_value, record) => {
        const size = Number(record.content_length || 0)
        if (size > 0) return fmtBytes(size)
        return record.content_type || t('candidateUnknownSize')
      },
    },
    {
      title: t('candidateScore'),
      dataIndex: 'score',
      width: 90,
    },
    {
      title: t('candidateDuplicates'),
      dataIndex: 'duplicate_count',
      width: 90,
      render: (value) => Number(value || 0),
    },
  ]

  return (
    <Modal
      title={mode === 'page' ? t('pageScanReviewTitle') : t('candidateReviewTitle')}
      open={open}
      onCancel={onCancel}
      onOk={onConfirm}
      okText={t('candidateCreateSelected')}
      okButtonProps={{ loading: creating, disabled: selectedUrls.length === 0 }}
      cancelText={t('cancel')}
      width={1120}
      destroyOnClose
    >
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        <div className="grid-2">
          <Input
            value={saveDir}
            onChange={(e) => setSaveDir(e.target.value)}
            placeholder={t('saveDirOptional')}
          />
          <Input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder={t('setCategory')}
          />
        </div>

        <div className="grid-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('candidateQueryPlaceholder')}
          />
          <Space wrap>
            <Select
              value={kindFilter}
              onChange={setKindFilter}
              style={{ width: 140 }}
              options={[
                { label: t('filterAll'), value: 'all' },
                ...kindOptions.map((value) => ({
                  label: value.toUpperCase(),
                  value,
                })),
              ]}
            />
            <Select
              value={domainFilter}
              onChange={setDomainFilter}
              style={{ width: 220 }}
              showSearch
              optionFilterProp="label"
              options={[
                { label: t('filterAll'), value: 'all' },
                ...domainOptions.map((value) => ({
                  label: value,
                  value,
                })),
              ]}
            />
            <Select
              value={sizeFilter}
              onChange={(value) => setSizeFilter(value)}
              style={{ width: 160 }}
              options={[
                { label: t('filterAll'), value: 'all' },
                { label: t('candidateUnknownSize'), value: 'unknown' },
                { label: '< 100 MB', value: 'lt100m' },
                { label: '100 MB - 1 GB', value: '100m-1g' },
                { label: '>= 1 GB', value: 'ge1g' },
              ]}
            />
          </Space>
        </div>

        <Space wrap>
          <Typography.Text type="secondary">
            {t('selectedCount')}: {selectedUrls.length} / {candidates.length}
          </Typography.Text>
          <Typography.Text type="secondary">
            {t('candidateSelectVisible')}: {selectedVisibleCount} / {filteredCandidates.length}
          </Typography.Text>
          <Button
            size="small"
            onClick={() => onSelectionChange(filteredCandidates.map((item) => item.url))}
          >
            {t('selectAll')}
          </Button>
          <Button size="small" onClick={() => onSelectionChange([])}>
            {t('selectNone')}
          </Button>
          <Button
            size="small"
            onClick={() => {
              const visibleUrls = filteredCandidates.map((item) => item.url)
              const visibleUrlSet = new Set(visibleUrls)
              const selected = new Set(selectedUrls)
              const hiddenSelected = selectedUrls.filter((url) => !visibleUrlSet.has(url))
              const nextVisible = visibleUrls.filter((url) => !selected.has(url))
              onSelectionChange([...hiddenSelected, ...nextVisible])
            }}
          >
            {t('invertSelection')}
          </Button>
        </Space>

        <Table<LinkCandidate>
          size="small"
          rowKey="url"
          loading={loading}
          columns={columns}
          dataSource={filteredCandidates}
          pagination={{ pageSize: 8, showSizeChanger: false }}
          locale={{ emptyText: t('candidateNoResults') }}
          rowSelection={{
            selectedRowKeys: selectedUrls,
            onChange: (keys) => onSelectionChange(keys.map((key) => String(key))),
          }}
          scroll={{ y: 420 }}
        />
      </Space>
    </Modal>
  )
}
