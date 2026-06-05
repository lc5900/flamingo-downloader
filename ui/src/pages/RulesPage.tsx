import { useState, useEffect, useCallback } from 'react'
import { Button, Card, Form, Input, Select, Space, Switch, Tabs, message } from 'antd'
import { PlusOutlined, SaveOutlined, ReloadOutlined } from '@ant-design/icons'
import * as api from '../api/client'
import type { GlobalSettings, CategoryRule, DownloadRule, MatcherType } from '../types'

interface RulesPageProps {
  t: (k: string) => string
}

export const RulesPage: React.FC<RulesPageProps> = ({ t }) => {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [downloadDirRules, setDownloadDirRules] = useState<DownloadRule[]>([])
  const [categoryRules, setCategoryRules] = useState<CategoryRule[]>([])
  const [settings, setSettings] = useState<GlobalSettings | null>(null)

  const loadRules = useCallback(async () => {
    setLoading(true)
    try {
      const s = await api.call<GlobalSettings>('get_global_settings')
      setSettings(s)
      setDownloadDirRules((s.download_dir_rules || []).map((r) => ({ ...r })))
      setCategoryRules((s.category_rules || []).map((r) => ({ ...r })))
    } catch (err) {
      message.error(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const s = await api.call<GlobalSettings>('get_global_settings')
        if (cancelled) return
        setSettings(s)
        setDownloadDirRules((s.download_dir_rules || []).map((r) => ({ ...r })))
        setCategoryRules((s.category_rules || []).map((r) => ({ ...r })))
      } catch (err) {
        if (!cancelled) message.error(String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const handleSave = useCallback(async () => {
    if (!settings) return
    setSaving(true)
    try {
      const updated: GlobalSettings = {
        ...settings,
        download_dir_rules: downloadDirRules.filter((r) => r.pattern.trim() && r.save_dir.trim()),
        category_rules: categoryRules.filter((r) => r.pattern.trim() && r.category.trim()),
      }
      await api.call('set_global_settings', { settings: updated })
      setSettings(updated)
      message.success(t('settingsSaved'))
    } catch (err) {
      message.error(String(err))
    } finally {
      setSaving(false)
    }
  }, [settings, downloadDirRules, categoryRules, t])

  const addDownloadDirRule = () => {
    setDownloadDirRules((prev) => [...prev, { enabled: true, matcher: 'ext' as MatcherType, pattern: '', save_dir: '', subdir_by_date: false, subdir_by_domain: false }])
  }

  const removeDownloadDirRule = (index: number) => {
    setDownloadDirRules((prev) => prev.filter((_, i) => i !== index))
  }

  const updateDownloadDirRule = (index: number, field: keyof DownloadRule, value: unknown) => {
    setDownloadDirRules((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)))
  }

  const addCategoryRule = () => {
    setCategoryRules((prev) => [...prev, { enabled: true, matcher: 'ext' as MatcherType, pattern: '', category: '' }])
  }

  const removeCategoryRule = (index: number) => {
    setCategoryRules((prev) => prev.filter((_, i) => i !== index))
  }

  const updateCategoryRule = (index: number, field: keyof CategoryRule, value: unknown) => {
    setCategoryRules((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)))
  }

  const matcherOptions = [
    { label: 'ext', value: 'ext' },
    { label: 'domain', value: 'domain' },
    { label: 'type', value: 'type' },
  ]

  const renderDownloadDirRules = () => (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      {downloadDirRules.map((rule, index) => (
        <Card key={index} size="small">
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr', gap: 8, alignItems: 'start' }}>
            <Form.Item label={t('enabled')} style={{ marginBottom: 8 }}>
              <Switch checked={rule.enabled} onChange={(v) => updateDownloadDirRule(index, 'enabled', v)} />
            </Form.Item>
            <Form.Item label={t('matcher')} style={{ marginBottom: 8 }}>
              <Select
                value={rule.matcher}
                onChange={(v) => updateDownloadDirRule(index, 'matcher', v)}
                options={matcherOptions}
              />
            </Form.Item>
            <Form.Item label={t('pattern')} style={{ marginBottom: 8 }}>
              <Input
                value={rule.pattern}
                onChange={(e) => updateDownloadDirRule(index, 'pattern', e.target.value)}
                placeholder="mp4,mkv or github.com or torrent"
              />
            </Form.Item>
            <Form.Item label={t('saveDir')} style={{ marginBottom: 8 }}>
              <Input
                value={rule.save_dir}
                onChange={(e) => updateDownloadDirRule(index, 'save_dir', e.target.value)}
                placeholder="/path/to/save"
              />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <Form.Item label={t('subdirByDomain')} style={{ marginBottom: 0 }}>
              <Switch checked={rule.subdir_by_domain} onChange={(v) => updateDownloadDirRule(index, 'subdir_by_domain', v)} />
            </Form.Item>
            <Form.Item label={t('subdirByDate')} style={{ marginBottom: 0 }}>
              <Switch checked={rule.subdir_by_date} onChange={(v) => updateDownloadDirRule(index, 'subdir_by_date', v)} />
            </Form.Item>
            <div style={{ flex: 1 }} />
            <Button danger size="small" onClick={() => removeDownloadDirRule(index)}>
              {t('removeRule')}
            </Button>
          </div>
        </Card>
      ))}
      <Button type="dashed" block icon={<PlusOutlined />} onClick={addDownloadDirRule}>
        {t('addRule')}
      </Button>
    </Space>
  )

  const renderCategoryRules = () => (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      {categoryRules.map((rule, index) => (
        <Card key={index} size="small">
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <Form.Item label={t('enabled')} style={{ marginBottom: 0 }}>
              <Switch checked={rule.enabled} onChange={(v) => updateCategoryRule(index, 'enabled', v)} />
            </Form.Item>
            <Form.Item label={t('matcher')} style={{ marginBottom: 0 }}>
              <Select
                value={rule.matcher}
                onChange={(v) => updateCategoryRule(index, 'matcher', v)}
                options={matcherOptions}
                style={{ width: 120 }}
              />
            </Form.Item>
            <Form.Item label={t('pattern')} style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
              <Input
                value={rule.pattern}
                onChange={(e) => updateCategoryRule(index, 'pattern', e.target.value)}
                placeholder="mp4,mkv or github.com or torrent"
              />
            </Form.Item>
            <Form.Item label={t('categoryName')} style={{ marginBottom: 0, flex: 1, minWidth: 150 }}>
              <Input
                value={rule.category}
                onChange={(e) => updateCategoryRule(index, 'category', e.target.value)}
                placeholder="video / docs / work"
              />
            </Form.Item>
            <Button danger size="small" onClick={() => removeCategoryRule(index)}>
              {t('removeRule')}
            </Button>
          </div>
        </Card>
      ))}
      <Button type="dashed" block icon={<PlusOutlined />} onClick={addCategoryRule}>
        {t('addRule')}
      </Button>
    </Space>
  )

  return (
    <div className="task-workspace">
      <Card
        className="main-card"
        title={t('rulesManagement')}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadRules} loading={loading}>
              {t('refresh')}
            </Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
              {t('saveRules')}
            </Button>
          </Space>
        }
      >
        <Tabs
          items={[
            {
              key: 'download_dir',
              label: t('downloadDirRules'),
              children: renderDownloadDirRules(),
            },
            {
              key: 'category',
              label: t('categoryAutoTagRules'),
              children: renderCategoryRules(),
            },
          ]}
        />
      </Card>
    </div>
  )
}
