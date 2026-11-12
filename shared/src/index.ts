/**
 * Shared constants and types used by server and web client.
 */

export const LOCALES = ['de', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Tenant-wide role of a membership. */
export const TENANT_ROLES = ['admin', 'project_admin', 'member'] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];

/** Role inside a project (or default role for To-Dos without project). */
export const PROJECT_ROLES = ['editor', 'restricted', 'reader'] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

/** Default role for To-Dos without project; `none` = no access. */
export const DEFAULT_ROLES = [...PROJECT_ROLES, 'none'] as const;
export type DefaultRole = (typeof DEFAULT_ROLES)[number];

/** Category of a status – decides whether a To-Do is hidden by default. */
export const STATUS_CATEGORIES = ['open', 'done', 'cancelled'] as const;
export type StatusCategory = (typeof STATUS_CATEGORIES)[number];

export const PRIORITY_ICON_KINDS = ['arrows', 'exclamation'] as const;
export type PriorityIconKind = (typeof PRIORITY_ICON_KINDS)[number];
export const PRIORITY_ICON_DIRECTIONS = ['up', 'down'] as const;
export type PriorityIconDirection = (typeof PRIORITY_ICON_DIRECTIONS)[number];
export const PRIORITY_ICON_COLORS = ['green', 'yellow', 'red'] as const;
export type PriorityIconColor = (typeof PRIORITY_ICON_COLORS)[number];

export const PASSWORD_MIN_LENGTH = 10;
export const INVITATION_VALID_DAYS = 7;

export interface TenantSummary {
  id: string;
  name: string;
}

export interface ActiveTenant extends TenantSummary {
  membershipId: string;
  role: TenantRole;
  defaultRole: DefaultRole;
  displayName: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  locale: Locale;
  isSystemAdmin: boolean;
  notifyAssign: boolean;
  remindDaysBefore: number | null;
  notifyOverdue: boolean;
}

export interface MeResponse {
  user: CurrentUser;
  tenants: TenantSummary[];
  activeTenant: ActiveTenant | null;
  csrfToken: string;
  version: string;
}

export interface InvitationInfo {
  tenantName: string;
  email: string;
  /** true when the invited person has no password yet (new account). */
  needsPassword: boolean;
}

export interface SystemTenant {
  id: string;
  name: string;
  isActive: boolean;
  memberCount: number;
  createdAt: string;
}

/** Error codes returned by the API as `{ error: code }`. Translated in the client. */
export const ERROR_CODES = [
  'bad_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'csrf',
  'rate_limited',
  'invalid_credentials',
  'invalid_token',
  'password_too_short',
  'already_member',
  'last_admin',
  'internal',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
