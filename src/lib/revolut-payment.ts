import { PaymentVerificationResult, RevolutPaymentData } from '@/types/player-config';

const REVOLUT_API_BASE_URL = 'https://api.revolut.com/api/1.0';
const PAYMENT_VALIDITY_DAYS = 30;

export interface RevolutPaymentWebhookData {
  eventType: string;
  data: {
    paymentId?: string;
    subscriptionId?: string;
    status?: string;
    amount?: number;
    currency?: string;
    timestamp?: number;
  };
}

/**
 * Verify Revolut Pro payment status
 * This function checks if a user's Revolut payment is still valid
 * @param paymentData User's Revolut payment information from database
 * @returns Verification result with payment status and validity
 */
export function verifyRevolutPayment(paymentData: RevolutPaymentData): PaymentVerificationResult {
  // If no payment data exists, treat as invalid
  if (!paymentData || !paymentData.revolutAccountId) {
    return {
      isValid: false,
      status: 'failed',
      error: 'No Revolut account linked',
    };
  }

  const status = paymentData.paymentStatus as PaymentVerificationResult['status'];

  // Check if status is explicitly invalid
  if (status === 'canceled' || status === 'failed' || status === 'expired') {
    return {
      isValid: false,
      status,
      error: `Payment status is ${status}`,
    };
  }

  // Check if last payment is within validity window
  if (paymentData.lastPaymentDate) {
    const lastPaymentTime = new Date(paymentData.lastPaymentDate).getTime();
    const now = Date.now();
    const daysSincePayment = (now - lastPaymentTime) / (1000 * 60 * 60 * 24);

    if (daysSincePayment > PAYMENT_VALIDITY_DAYS) {
      return {
        isValid: false,
        status: 'expired',
        error: `Payment expired after ${PAYMENT_VALIDITY_DAYS} days`,
        expiryDate: new Date(lastPaymentTime + PAYMENT_VALIDITY_DAYS * 24 * 60 * 60 * 1000),
      };
    }

    return {
      isValid: true,
      status: 'active',
      expiryDate: new Date(lastPaymentTime + PAYMENT_VALIDITY_DAYS * 24 * 60 * 60 * 1000),
      message: `Payment valid until ${new Date(lastPaymentTime + PAYMENT_VALIDITY_DAYS * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}`,
    };
  }

  // If pending and no last payment date, treat as invalid
  if (status === 'pending') {
    return {
      isValid: false,
      status: 'pending',
      error: 'Payment pending - awaiting confirmation',
    };
  }

  // Default: payment active if status is active
  return {
    isValid: status === 'active',
    status,
    message: status === 'active' ? 'Payment is active' : undefined,
  };
}

/**
 * Handle Revolut payment webhook
 * Updates payment status based on webhook data from Revolut API
 * @param webhookData Webhook payload from Revolut
 * @returns Updated payment data
 */
export function handleRevolutWebhook(webhookData: RevolutPaymentWebhookData): Partial<RevolutPaymentData> {
  const { eventType, data } = webhookData;

  let paymentStatus: RevolutPaymentData['paymentStatus'] = 'pending';

  switch (eventType) {
    case 'payment.completed':
      paymentStatus = 'active';
      break;
    case 'payment.failed':
      paymentStatus = 'failed';
      break;
    case 'subscription.cancelled':
      paymentStatus = 'canceled';
      break;
    case 'payment.refunded':
      paymentStatus = 'canceled';
      break;
    default:
      paymentStatus = 'pending';
  }

  return {
    paymentStatus,
    lastPaymentDate: data.timestamp ? new Date(data.timestamp * 1000) : undefined,
    revolutSubscriptionId: data.subscriptionId || data.paymentId,
  };
}

/**
 * Format payment validation error for API response
 * Returns appropriate HTTP status code and error message
 */
export function getPaymentErrorResponse(verification: PaymentVerificationResult): {
  statusCode: number;
  error: string;
  message: string;
} {
  switch (verification.status) {
    case 'pending':
      return {
        statusCode: 402,
        error: 'payment_pending',
        message: 'Payment is pending - please wait for confirmation',
      };
    case 'failed':
      return {
        statusCode: 402,
        error: 'payment_failed',
        message: 'Payment failed - please check your Revolut account',
      };
    case 'canceled':
      return {
        statusCode: 402,
        error: 'payment_canceled',
        message: 'Payment was canceled',
      };
    case 'expired':
      return {
        statusCode: 402,
        error: 'payment_expired',
        message: `Payment expired on ${verification.expiryDate?.toISOString().split('T')[0]}`,
      };
    default:
      return {
        statusCode: 403,
        error: 'payment_invalid',
        message: 'Payment verification failed',
      };
  }
}

/**
 * Calculate days until payment expiry
 */
export function getDaysUntilExpiry(lastPaymentDate: Date): number {
  const expiryTime = new Date(lastPaymentDate).getTime() + PAYMENT_VALIDITY_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();
  return Math.ceil((expiryTime - now) / (1000 * 60 * 60 * 24));
}
