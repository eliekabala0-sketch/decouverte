import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@lib/supabase'

export type FeatureKey =
  | 'public_publications_enabled'
  | 'ad_campaigns_enabled'
  | 'mass_messages_enabled'
  | 'boost_enabled'
  | 'reporting_enabled'
  | 'contact_packs_enabled'

type SettingRow = { key: string; value: any }

const DEFAULTS: Record<FeatureKey, boolean> = {
  public_publications_enabled: true,
  ad_campaigns_enabled: true,
  mass_messages_enabled: true,
  boost_enabled: true,
  reporting_enabled: true,
  contact_packs_enabled: true,
}

export function useFeatureFlags() {
  const [settings, setSettings] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('admin_settings').select('key,value')
      const next: Record<string, boolean> = {}
      ;((data ?? []) as SettingRow[]).forEach((row) => {
        if (typeof row.value === 'boolean') next[row.key] = row.value
        // Certaines valeurs peuvent être stockées en JSONB string/number; on ignore ici.
      })
      setSettings(next)
      setLoading(false)
    }
    load()
  }, [])

  const flags = useMemo(() => {
    return {
      loading,
      isEnabled: (key: FeatureKey) => settings[key] ?? DEFAULTS[key] ?? true,
    }
  }, [loading, settings])

  return flags
}

