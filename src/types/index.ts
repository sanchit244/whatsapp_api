export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'deleted';
  plan: 'starter' | 'pro' | 'enterprise';
  monthly_quota: number;
  created_at: Date;
  updated_at: Date;
}

export interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  mfa_enabled: boolean;
  last_login?: Date;
  is_admin: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface TenantUser {
  id: string;
  tenant_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'manager' | 'member' | 'viewer';
  joined_at: Date;
}

export interface Campaign {
  id: string;
  tenant_id: string;
  created_by: string;
  name: string;
  description?: string;
  status: 'draft' | 'ready' | 'active' | 'paused' | 'completed' | 'cancelled';
  total_messages: number;
  messages_sent: number;
  messages_delivered: number;
  messages_failed: number;
  created_at: Date;
  updated_at: Date;
}

export interface Message {
  id: string;
  tenant_id: string;
  campaign_id: string;
  phone_number: string;
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'read';
  meta_message_id?: string;
  error_message?: string;
  created_at: Date;
  sent_at?: Date;
  delivered_at?: Date;
  read_at?: Date;
}

export interface Contact {
  id: string;
  tenant_id: string;
  phone_number: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  opted_in: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Template {
  id: string;
  tenant_id: string;
  created_by: string;
  name: string;
  content: string;
  status: 'pending_approval' | 'approved' | 'rejected' | 'draft';
  created_at: Date;
  updated_at: Date;
}

export interface APIKey {
  id: string;
  tenant_id: string;
  name: string;
  created_at: Date;
  last_used?: Date;
  expires_at?: Date;
}

export interface AuditLog {
  id: string;
  tenant_id?: string;
  user_id?: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: any;
  created_at: Date;
}

export interface WebhookEvent {
  eventType: string;
  data: any;
  tenantId: string;
  timestamp: string;
}

export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
