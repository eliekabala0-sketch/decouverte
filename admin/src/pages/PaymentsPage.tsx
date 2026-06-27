import { useEffect, useState } from 'react'
import { supabase } from '@lib/supabase'
import './DashboardPage.css'

const PAGE_SIZE = 150

type PaymentRow = {
  id: string
  user_id?: string
  type?: string | null
  amount_cents?: number | null
  amount?: number | null
  provider?: string | null
  status?: string | null
  currency?: string | null
  created_at: string
}

export function PaymentsPage() {
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('payments')
        .select('id,user_id,type,amount_cents,amount,provider,status,currency,created_at')
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)
      setPayments((data ?? []) as PaymentRow[])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="page-loading">Chargement...</div>

  return (
    <div>
      <h1 className="page-title">Paiements</h1>
      <p className="page-subtitle">Gerer les paiements, statuts et activations serveur.</p>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Montant</th>
              <th>Statut</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 ? (
              <tr><td colSpan={4}>Aucun paiement.</td></tr>
            ) : null}
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{p.type ?? p.provider ?? '-'}</td>
                <td>
                  {typeof p.amount_cents === 'number'
                    ? `${(p.amount_cents / 100).toFixed(2)} ${p.currency ?? 'USD'}`
                    : typeof p.amount === 'number'
                      ? `${p.amount} ${p.currency ?? 'USD'}`
                      : '-'}
                </td>
                <td>{p.status ?? '-'}</td>
                <td>{new Date(p.created_at).toLocaleString('fr-FR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
