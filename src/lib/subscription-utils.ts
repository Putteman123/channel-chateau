import { differenceInDays, parseISO, isValid, format } from 'date-fns';
import { sv } from 'date-fns/locale';

export type SubscriptionStatus = 'active' | 'expiring-soon' | 'expired' | 'unlimited';

export interface SubscriptionInfo {
  status: SubscriptionStatus;
  expiresAt: Date | null;
  daysRemaining: number | null;
  formattedDate: string | null;
  statusText: string;
}

/**
 * Parse Xtream exp_date to Date
 * Xtream can return exp_date as:
 * - Unix timestamp (seconds as string or number)
 * - "null" or null (unlimited)
 * - Empty string (unlimited)
 */
export function parseXtreamExpDate(expDate: string | number | null | undefined): Date | null {
  if (expDate === null || expDate === undefined || expDate === '' || expDate === 'null') {
    return null;
  }

  // If it's a number or numeric string, treat as Unix timestamp (seconds)
  const asNumber = typeof expDate === 'number' ? expDate : Number(expDate);
  if (!isNaN(asNumber) && asNumber > 0) {
    // Convert seconds to milliseconds
    const date = new Date(asNumber * 1000);
    if (isValid(date)) {
      return date;
    }
  }

  // Try parsing as ISO date string
  try {
    const date = parseISO(String(expDate));
    if (isValid(date)) {
      return date;
    }
  } catch {
    // Ignore parsing errors
  }

  return null;
}

/**
 * Get subscription info from expires_at date
 */
export function getSubscriptionInfo(expiresAt: string | null): SubscriptionInfo {
  if (!expiresAt) {
    return {
      status: 'unlimited',
      expiresAt: null,
      daysRemaining: null,
      formattedDate: null,
      statusText: 'Obegränsad',
    };
  }

  const expDate = parseISO(expiresAt);
  if (!isValid(expDate)) {
    return {
      status: 'unlimited',
      expiresAt: null,
      daysRemaining: null,
      formattedDate: null,
      statusText: 'Obegränsad',
    };
  }

  const now = new Date();
  const daysRemaining = differenceInDays(expDate, now);
  const formattedDate = format(expDate, 'd MMM yyyy', { locale: sv });

  if (daysRemaining < 0) {
    return {
      status: 'expired',
      expiresAt: expDate,
      daysRemaining,
      formattedDate,
      statusText: 'Utgånget',
    };
  }

  if (daysRemaining <= 7) {
    return {
      status: 'expiring-soon',
      expiresAt: expDate,
      daysRemaining,
      formattedDate,
      statusText: daysRemaining === 0 ? 'Går ut idag' : `${daysRemaining} dagar kvar`,
    };
  }

  return {
    status: 'active',
    expiresAt: expDate,
    daysRemaining,
    formattedDate,
    statusText: `${daysRemaining} dagar kvar`,
  };
}

/**
 * Get CSS classes for subscription status
 */
export function getStatusStyles(status: SubscriptionStatus): {
  textClass: string;
  bgClass: string;
  iconClass: string;
} {
  switch (status) {
    case 'expired':
      return {
        textClass: 'text-destructive',
        bgClass: 'bg-destructive/10',
        iconClass: 'text-destructive',
      };
    case 'expiring-soon':
      return {
        textClass: 'text-yellow-600 dark:text-yellow-500',
        bgClass: 'bg-yellow-500/10',
        iconClass: 'text-yellow-600 dark:text-yellow-500',
      };
    case 'active':
      return {
        textClass: 'text-green-600 dark:text-green-500',
        bgClass: 'bg-green-500/10',
        iconClass: 'text-green-600 dark:text-green-500',
      };
    case 'unlimited':
    default:
      return {
        textClass: 'text-muted-foreground',
        bgClass: 'bg-muted',
        iconClass: 'text-muted-foreground',
      };
  }
}
