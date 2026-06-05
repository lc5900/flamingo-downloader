import { useState, useCallback } from 'react'
import { Button, Card, Input, Select, Space, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { SearchOutlined, DownloadOutlined, ScanOutlined, FileTextOutlined } from '@ant-design/icons'
import * as api from '../api/client'
import type { LinkCandidate, LinkParseResult } from '../types'
import { fmtBytes } from '../utils/format'

type SizeFilter = 'all' | 'unknown' | 'lt100m' | '100m-1g' | 'ge1g'

interface MediaDiscoveryPageProps {
  t: (k: string) => string
  onCreateTasks: (urls: string[], saveDir: string, category: string) => Promise<void>
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

export const MediaDiscoveryPage: React.FC<MediaDiscoveryPageProps> = ({ t, onCreateTasks }) => {
  const [url, setUrl] = useState('')
  const [candidates, setCandidates] = useState<LinkCandidate[]>([])
  const [selectedUrls, setSelectedUrls] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState('all')
  const [domainFilter, setDomainFilter] = useState('all')
  const [sizeFilter, setSizeFilter] = useState<SizeFilter>('all')
  const [saveDir, setSaveDir] = useState('')
  const [category, setCategory] = useState('')

  const handleScanPage = useCallback(async () => {
    const trimmed = url.trim()
    if (!trimmed) return
    setLoading(true)
    try {
      const result = await api.call<LinkParseResult>('scan_page_resources', { pageUrl: trimmed })
      setCandidates(result.candidates || [])
      setSelectedUrls([])
      if (!result.candidates?.length) {
        message.info(t('candidateNoResults'))
      }
    } catch (err) {
      message.error(String(err))
    } finally {
      setLoading(false)
    }
  }, [url, t])

  const handleParseText = useCallback(async () => {
    const trimmed = url.trim()
    if (!trimmed) return
    setLoading(true)
    try {
      const result = await api.call<LinkParseResult>('parse_link_candidates', {
        input: { text: trimmed, source_kind: 'text' },
      })
      setCandidates(result.candidates || [])
      setSelectedUrls([])
      if (!result.candidates?.length) {
        message.info(t('candidateNoResults'))
      }
    } catch (err) {
      message.error(String(err))
    } finally {
      setLoading(false)
    }
  }, [url, t])

  const handleDownloadSelected = useCallback(async () => {
    if (selectedUrls.length === 0) return
    setCreating(true)
    try {
      await onCreateTasks(selectedUrls, saveDir, category)
      setSelectedUrls([])
    } catch (err) {
      message.error(String(err))
    } finally {
      setCreating(false)
    }
  }, [selectedUrls, saveDir, category, onCreateTasks])

  const normalizedQuery = query.trim().toLowerCase()
  const kindOptions = Array.from(new Set(candidates.map((item) => item.kind).filter(Boolean))).sort()
  const domainOptions = Array.from(new Set(candidates.map((item) => candidateDomain(item)).filter(Boolean))).sort()

  const filteredCandidates = candidates.filter((candidate) => {
    const domain = candidateDomain(candidate)
    const bucket = sizeBucket(candidate)
    if (kindFilter !== 'all' && candidate.kind !== kindFilter) return false
    if (domainFilter !== 'all' && domain !== domainFilter) return false
    if (sizeFilter !== 'all' && bucket !== sizeFilter) return false
    if (!normalizedQuery) return true
    const haystack = [candidate.url, candidate.final_url || '', candidate.filename_hint || '', candidate.content_type || '', domain].join(' ').toLowerCase()
    return haystack.includes(normalizedQuery)
  })

  const visibleUrlSet = new Set(filteredCandidates.map((item) => item.url))
  const selectedVisibleCount = selectedUrls.filter((url) => visibleUrlSet.has(url)).length

  const columns: ColumnsType<LinkCandidate> = [
    {
      title: t('colName'),
      dataIndex: 'filename_hint',
      width: 280,
      ellipsis: true,
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong ellipsis>{record.filename_hint || record.final_url || record.url}</Typography.Text>
          <Typography.Text type="secondary" ellipsis style={{ fontSize: 12 }}>{record.url}</Typography.Text>
        </Space>
      ),
    },
    {
      title: t('candidateType'),
      dataIndex: 'kind',
      width: 100,
      render: (value) => <Tag>{String(value || 'http').toUpperCase()}</Tag>,
    },
    {
      title: t('candidateDomain'),
      key: 'domain',
      width: 180,
      ellipsis: true,
      render: (_value, record) => candidateDomain(record) || t('candidateUnknownDomain'),
    },
    {
      title: t('candidateSizeGroup'),
      key: 'size',
      width: 130,
      render: (_value, record) => {
        const size = Number(record.content_length || 0)
        if (size > 0) return fmtBytes(size)
        return record.content_type || t('candidateUnknownSize')
      },
    },
    {
      title: t('candidateScore'),
      dataIndex: 'score',
      width: 80,
      sorter: (a, b) => a.score - b.score,
    },
    {
      title: t('candidateDuplicates'),
      dataIndex: 'duplicate_count',
      width: 90,
      render: (value) => Number(value || 0),
    },
  ]

  return (
    <div className="task-workspace">
      <Card className="main-card" title={t('mediaDiscoveryTitle')}>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t('mediaInputUrl')}
              onPressEnter={handleScanPage}
              style={{ flex: 1 }}
              prefix={<SearchOutlined />}
            />
            <Button type="primary" icon={<ScanOutlined />} onClick={handleScanPage} loading={loading}>
              {t('scanPage')}
            </Button>
            <Button icon={<FileTextOutlined />} onClick={handleParseText} loading={loading}>
              {t('parseText')}
            </Button>
          </Space.Compact>

          {candidates.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('candidateQueryPlaceholder')}
                  style={{ width: 260 }}
                  allowClear
                />
                <Select
                  value={kindFilter}
                  onChange={setKindFilter}
                  style={{ width: 140 }}
                  options={[
                    { label: t('filterAll'), value: 'all' },
                    ...kindOptions.map((v) => ({ label: v.toUpperCase(), value: v })),
                  ]}
                />
                <Select
                  value={domainFilter}
                  onChange={setDomainFilter}
                  style={{ width: 200 }}
                  showSearch
                  optionFilterProp="label"
                  options={[
                    { label: t('filterAll'), value: 'all' },
                    ...domainOptions.map((v) => ({ label: v, value: v })),
                  ]}
                />
                <Select
                  value={sizeFilter}
                  onChange={(v) => setSizeFilter(v)}
                  style={{ width: 150 }}
                  options={[
                    { label: t('filterAll'), value: 'all' },
                    { label: t('candidateUnknownSize'), value: 'unknown' },
                    { label: '< 100 MB', value: 'lt100m' },
                    { label: '100 MB - 1 GB', value: '100m-1g' },
                    { label: '>= 1 GB', value: 'ge1g' },
                  ]}
                />
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <Typography.Text type="secondary">
                  {t('selectedCount')}: {selectedUrls.length} / {candidates.length}
                </Typography.Text>
                <Typography.Text type="secondary">
                  {t('candidateSelectVisible')}: {selectedVisibleCount} / {filteredCandidates.length}
                </Typography.Text>
                <Button size="small" onClick={() => setSelectedUrls(filteredCandidates.map((item) => item.url))}>
                  {t('selectAll')}
                </Button>
                <Button size="small" onClick={() => setSelectedUrls([])}>
                  {t('selectNone')}
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    const visibleUrls = filteredCandidates.map((item) => item.url)
                    const visibleSet = new Set(visibleUrls)
                    const selectedSet = new Set(selectedUrls)
                    const hiddenSelected = selectedUrls.filter((u) => !visibleSet.has(u))
                    const nextVisible = visibleUrls.filter((u) => !selectedSet.has(u))
                    setSelectedUrls([...hiddenSelected, ...nextVisible])
                  }}
                >
                  {t('invertSelection')}
                </Button>
                <div style={{ flex: 1 }} />
                <Input
                  value={saveDir}
                  onChange={(e) => setSaveDir(e.target.value)}
                  placeholder={t('saveDirOptional')}
                  style={{ width: 220 }}
                  size="small"
                />
                <Input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder={t('setCategory')}
                  style={{ width: 150 }}
                  size="small"
                />
                <Button
                  type="primary"
                  icon={<DownloadOutlined />}
                  onClick={handleDownloadSelected}
                  loading={creating}
                  disabled={selectedUrls.length === 0}
                >
                  {t('downloadSelected')} ({selectedUrls.length})
                </Button>
              </div>

              <Table<LinkCandidate>
                size="small"
                rowKey="url"
                columns={columns}
                dataSource={filteredCandidates}
                pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `${total} items` }}
                locale={{ emptyText: t('candidateNoResults') }}
                rowSelection={{
                  selectedRowKeys: selectedUrls,
                  onChange: (keys) => setSelectedUrls(keys.map((k) => String(k))),
                }}
                scroll={{ y: 480 }}
              />
            </>
          )}

          {candidates.length === 0 && !loading && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--ant-color-text-tertiary)' }}>
              <ScanOutlined style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }} />
              <div>{t('noCandidates')}</div>
            </div>
          )}
        </Space>
      </Card>
    </div>
  )
}
