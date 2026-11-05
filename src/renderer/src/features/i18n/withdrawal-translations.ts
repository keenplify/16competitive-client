const en = {
  'withdraw.open': 'Withdraw',
  'withdraw.title': 'Withdraw P-Cash',
  'withdraw.close': 'Close withdrawal',
  'withdraw.balance': 'Available balance',
  'withdraw.channel': 'Withdrawal channel',
  'withdraw.amount': 'Amount (P-Cash)',
  'withdraw.amountHelp': 'Enter a whole P-Cash amount. 100 P-Cash = 1 USD.',
  'withdraw.all': 'Withdraw all',
  'withdraw.submit': 'Withdraw',
  'withdraw.submitting': 'Submitting…',
  'withdraw.success': 'Withdrawal request submitted.',
  'withdraw.disabled': 'Withdrawals are not enabled for your community yet.',
  'withdraw.noChannels':
    'No withdrawal channels are available yet. Contact your community admin.',
  'withdraw.history': 'Withdrawal history',
  'withdraw.reload': 'Reload withdrawals',
  'withdraw.closeHistory': 'Close withdrawal history',
  'withdraw.empty': 'Your withdrawal requests will appear here.',
  'withdraw.loading': 'Loading withdrawals…',
  'withdraw.error': 'Could not submit the withdrawal. Try again.',
  'withdraw.invalidAmount': 'Enter a whole P-Cash amount of at least 1.',
  'withdraw.fieldRequired': '{{field}} is required.',
  'withdraw.unknownError': 'Could not load withdrawals. Try again.',
  'withdraw.status.REQUESTED': 'Requested',
  'withdraw.status.PENDING': 'Pending',
  'withdraw.status.SENT': 'Sent',
  'withdraw.status.PAID': 'Paid',
  'withdraw.status.CANCELLED': 'Cancelled'
} as const

/** Missing translations intentionally fall back to English in the runtime. */
export const withdrawalTranslations = {
  en,
  ru: en,
  tl: en,
  th: en,
  id: en,
  pt: en,
  ja: en,
  hi: en
} as const
