import type React from 'react'
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Tabs,
  Typography,
  Upload,
} from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import type { FormInstance } from 'antd'
import type { AddFormValues, DownloadRule, TaskOptionPreset } from '../../types'

export interface AddDownloadDialogProps {
  t: (k: string) => string
  addOpen: boolean
  setAddOpen: (v: boolean) => void
  addType: 'url' | 'magnet' | 'torrent'
  setAddType: (v: 'url' | 'magnet' | 'torrent') => void
  onAddUrl: () => void
  addSubmitting: boolean
  addForm: FormInstance<AddFormValues>
  urlValidationStatus: '' | 'success' | 'warning' | 'error' | 'validating'
  setAddUrl: (v: string) => void
  suggestAndSetSaveDir: (type: 'http' | 'magnet' | 'torrent', v: string | null) => Promise<void>
  addMatchedRule: DownloadRule | null
  setAddMatchedRule: (v: DownloadRule | null) => void
  addTorrentFile: File | null
  setAddTorrentFile: (v: File | null) => void
  presetOptionsForCurrentType: TaskOptionPreset[]
  onSaveCurrentPreset: () => void
  onApplySelectedPreset: () => void
  onExportPresets: () => void
  onImportPresets: () => void
  onOpenCandidateReview: () => void
  onOpenPageScanReview: () => void
  candidateReviewLoading: boolean
}

export const AddDownloadDialog: React.FC<AddDownloadDialogProps> = ({
  t,
  addOpen,
  setAddOpen,
  addType,
  setAddType,
  onAddUrl,
  addSubmitting,
  addForm,
  urlValidationStatus,
  setAddUrl,
  suggestAndSetSaveDir,
  addMatchedRule,
  setAddMatchedRule,
  addTorrentFile,
  setAddTorrentFile,
  presetOptionsForCurrentType,
  onSaveCurrentPreset,
  onApplySelectedPreset,
  onExportPresets,
  onImportPresets,
  onOpenCandidateReview,
  onOpenPageScanReview,
  candidateReviewLoading,
}) => {
  const advancedFields = (
    <>
      <div className="add-section-title">{t('taskPresets')}</div>
      <div className="add-preset-row">
        <Form.Item name="preset_selected" label={t('presetSelect')}>
          <Select
            allowClear
            options={presetOptionsForCurrentType.map((preset) => ({
              label: preset.name,
              value: preset.name,
            }))}
          />
        </Form.Item>
        <Form.Item name="preset_name" label={t('presetName')}>
          <Input placeholder="default-http" />
        </Form.Item>
      </div>
      <Space wrap className="add-compact-actions">
        <Button size="small" onClick={onSaveCurrentPreset}>
          {t('savePreset')}
        </Button>
        <Button size="small" onClick={onApplySelectedPreset}>
          {t('applyPreset')}
        </Button>
        <Button size="small" onClick={onImportPresets}>
          {t('importPresets')}
        </Button>
        <Button size="small" onClick={onExportPresets}>
          {t('exportPresets')}
        </Button>
      </Space>

      <div className="add-section-title">{t('addAdvanced')}</div>
      <div className="add-advanced-grid">
        <Form.Item name="out" label={t('outName')}>
          <Input placeholder="example.zip" />
        </Form.Item>
        <Form.Item name="category" label={t('categoryFilter')}>
          <Input placeholder={t('setCategory')} />
        </Form.Item>
        {addType === 'url' && (
          <Form.Item name="merge_format" label={t('mergeOutputFormat')}>
            <Select
              options={[
                { label: 'MP4', value: 'mp4' },
                { label: 'MKV', value: 'mkv' },
                { label: 'MOV', value: 'mov' },
                { label: 'WEBM', value: 'webm' },
              ]}
            />
          </Form.Item>
        )}
        <Form.Item name="max_download_limit" label={t('maxDownloadLimit')}>
          <Input placeholder="0 / 2M / 10M" />
        </Form.Item>
        <Form.Item name="max_upload_limit" label={t('taskMaxUploadLimit')}>
          <Input placeholder="0 / 1M / 5M" />
        </Form.Item>
        <Form.Item name="max_connection_per_server" label={t('taskMaxConn')}>
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="split" label={t('taskSplit')}>
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>
        {(addType === 'magnet' || addType === 'torrent') && (
          <Form.Item name="seed_ratio" label={t('seedRatio')}>
            <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
          </Form.Item>
        )}
        {(addType === 'magnet' || addType === 'torrent') && (
          <Form.Item name="seed_time" label={t('seedTime')}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        )}
        <Form.Item name="checksum_algorithm" label={t('checksumAlgorithm')}>
          <Select
            allowClear
            options={[
              { label: 'SHA-256', value: 'sha256' },
              { label: 'SHA-1', value: 'sha1' },
              { label: 'MD5', value: 'md5' },
            ]}
          />
        </Form.Item>
        <Form.Item name="checksum_value" label={t('checksumExpected')}>
          <Input placeholder="e3b0c44298fc..." />
        </Form.Item>
      </div>
      <Form.Item name="user_agent" label={t('userAgent')}>
        <Input placeholder="Mozilla/5.0 ..." />
      </Form.Item>
      <Form.Item name="referer" label={t('referer')}>
        <Input placeholder="https://example.com" />
      </Form.Item>
      <Form.Item name="cookie" label={t('cookie')}>
        <Input placeholder="SESSION=xxx; token=yyy" />
      </Form.Item>
      <Form.Item name="headers_text" label={t('extraHeaders')} style={{ marginBottom: 4 }}>
        <Input.TextArea rows={3} placeholder={t('extraHeadersPlaceholder')} />
      </Form.Item>
    </>
  )

  return (
    <Modal
      title={addType === 'url' ? t('addUrlTitle') : addType === 'magnet' ? t('addMagnetTitle') : t('addTorrentTitle')}
      open={addOpen}
      onCancel={() => setAddOpen(false)}
      onOk={onAddUrl}
      okText={t('add')}
      cancelText={t('cancel')}
      confirmLoading={addSubmitting}
      className="add-modal"
      rootClassName="add-modal-root"
      style={{ top: 24 }}
      styles={{
        body: {
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          maxHeight: 'calc(100vh - 200px)',
          overflowY: 'auto',
        },
      }}
      width={1080}
      destroyOnClose
    >
      <div className="add-modal-scroll-content">
        <Form form={addForm} layout="vertical" onFinish={onAddUrl}>
          <Tabs
            activeKey={addType}
            onChange={(key) => setAddType(key as 'url' | 'magnet' | 'torrent')}
            items={[
              { key: 'url', label: t('tabUrl') },
              { key: 'magnet', label: t('tabMagnet') },
              { key: 'torrent', label: t('tabTorrent') },
            ]}
          />
          <div className="add-modal-grid">
            <section className="add-primary-panel">
              {addType === 'url' && (
                <Form.Item
                  name="url"
                  label={t('url')}
                  required
                  validateStatus={urlValidationStatus}
                  hasFeedback
                >
                  <Input.TextArea
                    id="add-url-input"
                    rows={8}
                    placeholder="https://..."
                    showCount
                    maxLength={5000}
                    onChange={async (e) => {
                      setAddUrl(e.target.value)
                      try {
                        await suggestAndSetSaveDir('http', e.target.value || null)
                      } catch {
                        setAddMatchedRule(null)
                      }
                    }}
                  />
                </Form.Item>
              )}
              {addType === 'magnet' && (
                <Form.Item name="magnet" label={t('magnet')} required>
                  <Input.TextArea
                    id="add-magnet-input"
                    rows={8}
                    placeholder="magnet:?xt=urn:btih:..."
                    onChange={async (e) => {
                      try {
                        await suggestAndSetSaveDir('magnet', e.target.value || null)
                      } catch {
                        setAddMatchedRule(null)
                      }
                    }}
                  />
                </Form.Item>
              )}
              {addType === 'torrent' && (
                <Form.Item label={t('torrentFile')} required help={!addTorrentFile ? t('torrentRequired') : undefined}>
                  <Upload.Dragger
                    maxCount={1}
                    className="torrent-dropzone"
                    beforeUpload={(file) => {
                      setAddTorrentFile(file as File)
                      suggestAndSetSaveDir('torrent', file.name).catch(() => {
                        setAddMatchedRule(null)
                      })
                      return false
                    }}
                    onRemove={() => {
                      setAddTorrentFile(null)
                    }}
                  >
                    <p className="ant-upload-drag-icon">
                      <InboxOutlined />
                    </p>
                    <p className="ant-upload-text">{t('dropHint')}</p>
                    <p className="ant-upload-hint">{t('selectFile')}</p>
                  </Upload.Dragger>
                </Form.Item>
              )}
              <Form.Item name="save_dir" label={t('saveDirOptional')}>
                <Input placeholder="/path/to/downloads" />
              </Form.Item>
              <Typography.Text type="secondary" className="matched-rule-text">
                {t('matchedRule')}:{' '}
                {addMatchedRule
                  ? `${addMatchedRule.matcher}=${addMatchedRule.pattern} -> ${addMatchedRule.save_dir}`
                  : t('noMatchedRule')}
              </Typography.Text>
              {addType === 'url' && (
                <Space wrap className="add-compact-actions">
                  <Button onClick={onOpenCandidateReview} loading={candidateReviewLoading}>
                    {t('parseCandidates')}
                  </Button>
                  <Button onClick={onOpenPageScanReview} loading={candidateReviewLoading}>
                    {t('scanPageResources')}
                  </Button>
                </Space>
              )}
            </section>
            <aside className="add-advanced-panel">
              {advancedFields}
            </aside>
          </div>
        </Form>
      </div>
    </Modal>
  )
}

