import { supabase } from '@/lib/supabase'

export type PaymentNetwork = 'OM' | 'AM' | 'MP' | 'AFRIMONEY'
export type PaymentCurrency = 'USD' | 'CDF'
export type PaymentType = 'contact_pack' | 'visibility_boost' | 'profiles_access'
export type PaymentStatus = 'pending' | 'completed' | 'failed'

export const PAYMENT_NETWORKS: Array<{ value: PaymentNetwork; label: string }> = [
  { value: 'OM', label: 'Orange Money' },
  { value: 'AM', label: 'Airtel Money' },
  { value: 'MP', label: 'M-Pesa' },
  { value: 'AFRIMONEY', label: 'Afrimoney' },
]

export const PAYMENT_CURRENCIES: PaymentCurrency[] = ['USD', 'CDF']

type CreatePaymentInput = {
  payment_type: PaymentType
  amount: number
  currency: PaymentCurrency
  customer_phone: string
  network: PaymentNetwork
  metadata?: Record<string, unknown>
}

export type PaymentGatewayResult = {
  transaction_id: string
  status: PaymentStatus
  message: string
}

function normalizeResult(data: unknown): PaymentGatewayResult {
  const row = (data ?? {}) as Partial<PaymentGatewayResult> & { error?: string }
  if (row.error) throw new Error(row.error)
  return {
    transaction_id: String(row.transaction_id ?? ''),
    status: row.status === 'completed' || row.status === 'failed' ? row.status : 'pending',
    message: row.message ?? 'Paiement en attente.',
  }
}

export async function createServerPayment(input: CreatePaymentInput): Promise<PaymentGatewayResult> {
  const { data, error } = await supabase.functions.invoke('payment-create', { body: input })
  if (error) throw new Error(error.message || 'Creation du paiement impossible.')
  return normalizeResult(data)
}

export async function checkServerPayment(transactionId: string): Promise<PaymentGatewayResult> {
  const { data, error } = await supabase.functions.invoke('payment-status', {
    body: { transaction_id: transactionId },
  })
  if (error) throw new Error(error.message || 'Verification du paiement impossible.')
  return normalizeResult(data)
}

export function paymentStatusLabel(status: PaymentStatus): string {
  if (status === 'completed') return 'Paiement reussi'
  if (status === 'failed') return 'Paiement echoue'
  return 'Paiement en attente'
}
