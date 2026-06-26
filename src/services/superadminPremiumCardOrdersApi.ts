import { supabase } from '@/src/services/supabaseClient';
import {
  parsePremiumCardOrderStatus,
  type PremiumCardOrderStatus,
  type PremiumCardOrderStatusFilter,
} from '@/src/utils/premiumCardOrderStatus';

export type { PremiumCardOrderStatus, PremiumCardOrderStatusFilter };

export type PremiumCardOrderRow = {
  id: string;
  status: PremiumCardOrderStatus;
  parent_notes: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  student_user_id: string;
  student_full_name: string;
  student_xen_id: string;
  student_mobile: string;
  student_email: string;
  requested_by_user_id: string;
  requester_full_name: string;
  requester_email: string;
};

export type PremiumCardOrdersPage = {
  requests: PremiumCardOrderRow[];
  total: number;
};

function parseOrder(row: unknown): PremiumCardOrderRow | null {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string') return null;

  return {
    id: r.id,
    status: parsePremiumCardOrderStatus(r.status),
    parent_notes: typeof r.parent_notes === 'string' ? r.parent_notes : null,
    created_at: typeof r.created_at === 'string' ? r.created_at : '',
    updated_at: typeof r.updated_at === 'string' ? r.updated_at : '',
    reviewed_at: typeof r.reviewed_at === 'string' ? r.reviewed_at : null,
    student_user_id: typeof r.student_user_id === 'string' ? r.student_user_id : '',
    student_full_name: typeof r.student_full_name === 'string' ? r.student_full_name : '',
    student_xen_id: typeof r.student_xen_id === 'string' ? r.student_xen_id : '',
    student_mobile: typeof r.student_mobile === 'string' ? r.student_mobile : '',
    student_email: typeof r.student_email === 'string' ? r.student_email : '',
    requested_by_user_id:
      typeof r.requested_by_user_id === 'string' ? r.requested_by_user_id : '',
    requester_full_name: typeof r.requester_full_name === 'string' ? r.requester_full_name : '',
    requester_email: typeof r.requester_email === 'string' ? r.requester_email : '',
  };
}

function parseOrdersPage(data: unknown): PremiumCardOrdersPage | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  const row = data as Record<string, unknown>;
  const total =
    typeof row.total === 'number'
      ? row.total
      : typeof row.total === 'string'
        ? Number(row.total)
        : 0;
  const raw = row.requests;
  if (!Array.isArray(raw)) return null;
  const requests = raw.map(parseOrder).filter((r): r is PremiumCardOrderRow => r !== null);
  return { requests, total: Number.isFinite(total) ? total : requests.length };
}

export async function fetchPremiumCardOrdersPendingCount(): Promise<{
  count: number;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('superadmin_premium_card_requests_pending_count');
  if (error) return { count: 0, error: error.message };
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { count: 0, error: 'invalid_count_response' };
  }
  const row = data as Record<string, unknown>;
  const count =
    typeof row.count === 'number'
      ? row.count
      : typeof row.count === 'string'
        ? Number(row.count)
        : 0;
  return { count: Number.isFinite(count) ? Math.max(0, count) : 0, error: null };
}

export async function fetchPremiumCardOrders(filters: {
  status?: PremiumCardOrderStatusFilter | '';
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ page: PremiumCardOrdersPage | null; error: string | null }> {
  const { data, error } = await supabase.rpc('superadmin_list_premium_card_requests', {
    p_filters: {
      status: filters.status ?? '',
      search: filters.search?.trim() ?? '',
      limit: filters.limit ?? 50,
      offset: filters.offset ?? 0,
    },
  });
  if (error) return { page: null, error: error.message };
  const page = parseOrdersPage(data);
  if (!page) return { page: null, error: 'invalid_orders_response' };
  return { page, error: null };
}

export async function setPremiumCardOrderStatus(
  requestId: string,
  status: PremiumCardOrderStatus,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('superadmin_set_premium_card_request_status', {
    p_payload: {
      request_id: requestId,
      status,
    },
  });
  if (error) return { error: error.message };
  return { error: null };
}
