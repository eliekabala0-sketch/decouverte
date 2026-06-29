import { supabase } from '@/lib/supabase'

export type PaymentNetwork = 'OM' | 'AM' | 'MP' | 'AFRIMONEY'
export type PaymentCurrency = 'USD' | 'CDF'
export type PaymentType = 'contact_pack' | 'visibility_boost' | 'profiles_access'
export type PaymentStatus = 'idle' | 'creating' | 'pending' | 'checking' | 'completed' | 'failed' | 'canceled' | 'expired'

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
  provider_message?: string | null
  provider_status_code?: number | string | null
}

export function normalizeMobileMoneyPhone(phone: string): string {
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (digits.startsWith('243')) return digits
  if (digits.startsWith('0')) return `243${digits.slice(1)}`
  if (digits.length === 9) return `243${digits}`
  return digits
}

export function paymentFailureMessage(result?: Partial<PaymentGatewayResult>): string {
  const providerMessage = String(result?.provider_message ?? '').trim()
  if (String(result?.provider_status_code ?? '') === '400' || providerMessage.toLowerCase() === 'transfer failed') {
    return 'Paiement non abouti. Verifiez le numero, le reseau ou la devise, puis reessayez.'
  }
  return result?.message || 'Paiement non abouti. Verifiez le numero, le reseau ou la devise, puis reessayez.'
}

export function providerFailureCause(result?: Partial<PaymentGatewayResult>): string | null {
  const providerMessage = String(result?.provider_message ?? '').trim()
  if (!providerMessage) return null
  return `Erreur operateur : ${providerMessage}`
}

function normalizeResult(data: unknown): PaymentGatewayResult {
  const row = (data ?? {}) as Partial<PaymentGatewayResult> & { error?: string }
  if (row.error) throw new Error(row.error)
  const rawStatus = row.status === 'completed' || row.status === 'failed' || row.status === 'canceled' || row.status === 'expired'
    ? row.status
    : 'pending'
  return {
    transaction_id: String(row.transaction_id ?? ''),
    status: rawStatus,
    message: row.message ?? 'Paiement en attente.',
    provider_message: row.provider_message ?? null,
    provider_status_code: row.provider_status_code ?? null,
  }
}

export async function createServerPayment(input: CreatePaymentInput): Promise<PaymentGatewayResult> {
  const { data, error } = await supabase.functions.invoke('payment-create', {
    body: { ...input, customer_phone: normalizeMobileMoneyPhone(input.customer_phone) },
  })
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
  if (status === 'canceled') return 'Paiement annule'
  if (status === 'expired') return 'Paiement expire'
  if (status === 'creating') return 'Creation du paiement'
  if (status === 'checking') return 'Verification du paiement'
  return 'Paiement en attente'
}
