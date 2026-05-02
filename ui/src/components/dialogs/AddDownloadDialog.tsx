import type React from 'react'
import {
  Button,
  Collapse,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Typography,
  Upload,
} from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { FormInstance } from 'antd'
import type { AddFormValues, DownloadRule, TaskOptionPreset } from '../../types'

export interface AddDownloadDialogProps {
  t: (k: string) => string
  addOpen: boolean
  setAddOpen: (v: boolean) => void
  addType: 'url' | 'magnet' | 'torrent'
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
  return (
    <Modal
      title={addType === 'url' ? t('addUrlTitle') : addType === 'magnet' ? t('addMagnetTitle') : t('addTorrentTitle')}
      open={addOpen}
      onCancel={() => setAddOpen(false)}
      onOk={onAddUrl}
      okText={t('add')}
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
          paddingRight: 8,
        },
      }}
      width={720}
      destroyOnClose
    >
      <div className="add-modal-scroll-content">
      <Form form={addForm} layout="vertical" onFinish={onAddUrl}>
        {addType === 'url' && (
          <Form.Item
            name="url"
            label={t('url')}
            required
            validateStatus={urlValidationStatus}
            hasFeedback
          >
            <Input.TextArea
              rows={3}
              placeholder="https://..."
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
          <Form.Item name="magnet" label={t('magnetLink')} required>
            <Input.TextArea
              rows={3}
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
            <Upload
              maxCount={1}
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
              <Button icon={<PlusOutlined />}>{t('selectFile')}</Button>
            </Upload>
          </Form.Item>
        )}
        <Form.Item name="save_dir" label={t('saveDirOptional')}>
          <Input placeholder="/path/to/downloads" />
        </Form.Item>
        <Typography.Text type="secondary" style={{ marginTop: -8, display: 'block', marginBottom: 8 }}>
          {t('matchedRule')}:{' '}
          {addMatchedRule
            ? `${addMatchedRule.matcher}=${addMatchedRule.pattern} -> ${addMatchedRule.save_dir}`
            : t('noMatchedRule')}
        </Typography.Text>
        {addType === 'url' && (
          <Space wrap style={{ marginBottom: 12 }}>
            <Button onClick={onOpenCandidateReview} loading={candidateReviewLoading}>
              {t('parseCandidates')}
            </Button>
            <Button onClick={onOpenPageScanReview} loading={candidateReviewLoading}>
              {t('scanPageResources')}
            </Button>
          </Space>
        )}
        <Collapse
          size="small"
          items={[
            {
              key: 'advanced',
              label: t('addAdvanced'),
              children: (
                <>
                  <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
                    {t('taskPresets')}
                  </Typography.Text>
                  <div className="grid-2">
                    <Form.Item name="preset_name" label={t('presetName')}>
                      <Input placeholder="default-http" />
                    </Form.Item>
                    <Form.Item name="preset_selected" label={t('presetSelect')}>
                      <Select
                        allowClear
                        options={presetOptionsForCurrentType.map((preset) => ({
                          label: preset.name,
                          value: preset.name,
                        }))}
                      />
                    </Form.Item>
                  </div>
                  <Space wrap style={{ marginBottom: 12 }}>
                    <Button size="small" onClick={onSaveCurrentPreset}>
                      {t('savePreset')}
                    </Button>
                    <Button size="small" onClick={onApplySelectedPreset}>
                      {t('applyPreset')}
                    </Button>
                    <Button size="small" onClick={onExportPresets}>
                      {t('exportPresets')}
                    </Button>
                    <Button size="small" onClick={onImportPresets}>
                      {t('importPresets')}
                    </Button>
                  </Space>
                  <div className="grid-2">
                    <Form.Item name="category" label={t('categoryFilter')}>
                      <Input placeholder={t('setCategory')} />
                    </Form.Item>
                    <Form.Item name="out" label={t('outName')}>
                      <Input placeholder="example.zip" />
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
                    <Form.Item name="max_connection_per_server" label={t('taskMaxConn')}>
                      <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="split" label={t('taskSplit')}>
                      <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="user_agent" label={t('userAgent')}>
                      <Input placeholder="Mozilla/5.0 ..." />
                    </Form.Item>
                    <Form.Item name="referer" label={t('referer')}>
                      <Input placeholder="https://example.com" />
                    </Form.Item>
                    <Form.Item name="cookie" label={t('cookie')}>
                      <Input placeholder="SESSION=xxx; token=yyy" />
                    </Form.Item>
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
                  <Form.Item name="headers_text" label={t('extraHeaders')} style={{ marginBottom: 4 }}>
                    <Input.TextArea rows={3} placeholder={t('extraHeadersPlaceholder')} />
                  </Form.Item>
                </>
              ),
            },
          ]}
        />
      </Form>
      </div>
    </Modal>
  )
}

