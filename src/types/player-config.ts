export interface PlayerConfigRequest {
  sourceId?: string;
  categoryFilter?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ChannelMetadata {
  totalChannels: number;
  categories: string[];
  epgAvailable: boolean;
  connectionStatus: 'healthy' | 'slow' | 'degraded';
  sourceType: 'xtream' | 'm3u';
  cached: boolean;
}

export interface Channel {
  streamId: string;
  name: string;
  category: string;
  logo: string | null;
  streamUrl: string;
  proxyUrl?: string;
  epgChannelId?: string;
  isAdult?: boolean;
  added?: string;
  number?: number;
}

export interface PlayerConfigResponse {
  success: boolean;
  data: {
    metadata: ChannelMetadata;
    channels: Channel[];
  };
  error?: string;
  message?: string;
  paymentStatus?: 'active' | 'pending' | 'failed' | 'canceled' | 'expired';
}

export interface PaymentVerificationResult {
  isValid: boolean;
  status: 'active' | 'pending' | 'failed' | 'canceled' | 'expired';
  expiryDate?: Date;
  message?: string;
  error?: string;
}

export interface RevolutPaymentData {
  revolutAccountId?: string;
  revolutSubscriptionId?: string;
  paymentStatus: string;
  lastPaymentDate?: Date;
  paymentMethod: string;
}

export interface APIError {
  error: string;
  code?: string;
  details?: string;
  statusCode: number;
}
