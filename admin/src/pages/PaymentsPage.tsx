import { useEffect, useState } from 'react'
import { supabase } from '@lib/supabase'
import './DashboardPage.css'

type PaymentRow = { id: string; user_id: string; type: string; amount_cents: number; status: string; created_at: string }

export function PaymentsPage() {
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('payments').select('*').order('created_at', { ascending: false })
      setPayments((data ?? []) as PaymentRow[])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="page-loading">Chargement...</div>

  return (
    <div>
      <h1 className="page-title">Paiements</h1>
      <p className="page-subtitle">Gérer les paiements et statuts. Intégration Badiboss Pay à brancher.</p>
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
            {payments.length === 0 && (
              <tr><td colSpan={4}>Aucun paiement.</td></tr>
            )}
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{p.type}</td>
                <td>{(p.amount_cents / 100).toFixed(2)} USD</td>
                <td>{p.status}</td>
                <td>{new Date(p.created_at).toLocaleString('fr-FR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
