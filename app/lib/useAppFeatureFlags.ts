import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const DEFAULTS: Record<string, boolean> = {
  mode_libre_enabled: true,
  mode_serieux_enabled: true,
  reciprocal_matching_enabled: false,
  public_publications_enabled: true,
  ad_campaigns_enabled: true,
  mass_messages_enabled: true,
  boost_enabled: true,
  reporting_enabled: true,
  contact_packs_enabled: true,
}

type Row = { key: string; value: unknown }

export function useAppFeatureFlags() {
  const [map, setMap] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const { data } = await supabase.from('admin_settings').select('key,value')
    const next: Record<string, boolean> = {}
    ;((data ?? []) as Row[]).forEach((row) => {
      if (typeof row.value === 'boolean') next[row.key] = row.value
    })
    setMap(next)
    setLoading(false)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const isOn = useMemo(
    () => (key: string) => (key in map ? map[key]! : (DEFAULTS[key] ?? true)),
    [map],
  )

  return { loading, isOn, reload }
}
