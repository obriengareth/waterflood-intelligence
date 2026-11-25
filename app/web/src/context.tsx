import { createContext, useContext } from 'react';
import type Source from '../../../design/renderer/src/engineering.json';
import { baseUrl, staticMode, staticRequest } from './static-runtime';
type WellRecord = { [K in keyof typeof Source.wells[number]]: typeof Source.wells[number][K] };
type Realtime = typeof Source.realtime & { timestamps: string[] };
export type Dashboard = Omit<typeof Source, 'events' | 'trajectories' | 'selected' | 'wells' | 'realtime'> & {
  selected: WellRecord;
  wells: WellRecord[];
  available_fields?: typeof Source.fields;
  realtime: Realtime;
  trajectories: Record<string, typeof Source.trajectories['RA-0417']>;
  completion: { casing_od_in: number; tubing_od_in: number; esp_setting_md_ft: number | null;
    intervals: { md_top_ft: number; md_base_ft: number; tvdss_top_ft: number; tvdss_base_ft: number; type: string }[] };
  tops: { formation: string; tvdss_ft: number }[];
  events: (typeof Source.events[number] & { id: string; status: string })[];
  recent_realtime: Realtime;
  pair: { producer: string; injector: string; realtime: Realtime; recent_realtime: Realtime };
  runtime: { stream_timestamp: string; selected_well: string; source_as_of: string; field: string; minutes: number; offset_count: number; offset_radius_km: number;
    filter_field: string; filter_reservoir: string; filter_well_type: string }
};
export const DashboardContext = createContext<Dashboard | null>(null);
export function useDashboard() {
  const data = useContext(DashboardContext);
  if (!data) throw new Error('The engineering context is not ready');
  return data;
}
export async function api<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  if (staticMode && url.startsWith('/api/')) return await staticRequest(url, body) as T;
  const resolved = staticMode && url.startsWith('/') ? `${baseUrl}${url.slice(1)}` : url;
  const response = await fetch(resolved, { method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Asset-Action': 'engineer' },
    body: body === undefined ? undefined : JSON.stringify(body), signal });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(typeof error.detail === 'string' ? error.detail : JSON.stringify(error.detail));
  }
  return response.json();
}
export function navigate(page: string, well?: string) {
  const params = new URLSearchParams(location.search);
  if (well) params.set('well', well);
  history.pushState(null, '', `${baseUrl}${page}.html?${params}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}
