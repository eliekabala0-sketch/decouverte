import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiRequest } from '@/lib/api'

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
  male_boost_requires_reciprocity: true,
}

type Row = { key: string; value: unknown }

let cachedMap: Record<string, boolean> | null = null
let cachedAt = 0
let inFlight: Promise<Record<string, boolean>> | null = null
const listeners = new Set<(next: Record<string, boolean>) => void>()
const CACHE_MS = 60_000

function emit(next: Record<string, boolean>) {
  listeners.forEach((listener) => listener(next))
}

async function loadFlags(force = false): Promise<Record<string, boolean>> {
  const now = Date.now()
  if (!force && cachedMap && now - cachedAt < CACHE_MS) return cachedMap
  if (!force && inFlight) return inFlight

  inFlight = (async () => {
    const { data } = await apiRequest<{ data: Row[] }>('/v1/settings')
    const next: Record<string, boolean> = {}
    ;((data ?? []) as Row[]).forEach((row) => {
      if (typeof row.value === 'boolean') next[row.key] = row.value
    })
    cachedMap = next
    cachedAt = Date.now()
    emit(next)
    return next
  })().finally(() => {
    inFlight = null
  })

  return inFlight
}

export function useAppFeatureFlags() {
  const [map, setMap] = useState<Record<string, boolean>>(cachedMap ?? {})
  const [loading, setLoading] = useState(!cachedMap)

  const reload = useCallback(async () => {
    setLoading(!cachedMap)
    try {
      const next = await loadFlags(true)
      setMap(next)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const listener = (next: Record<string, boolean>) => {
      setMap(next)
      setLoading(false)
    }
    listeners.add(listener)
    void loadFlags(false).then(listener).finally(() => setLoading(false))
    return () => {
      listeners.delete(listener)
    }
  }, [])

  const isOn = useMemo(
    () => (key: string) => (key in map ? map[key]! : (DEFAULTS[key] ?? true)),
    [map],
  )

  return { loading, isOn, reload }
}
