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
  'archived',
  'invalid_assignee',
  'in_use',
  'internal',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

// ---------------------------------------------------------------------------
// Reference data (per tenant)
// ---------------------------------------------------------------------------

export interface StatusDto {
  id: string;
  /** Key of a standard status (translated in the UI while `name` is null). */
  key: string | null;
  name: string | null;
  rank: number;
  color: string;
  category: StatusCategory;
  isNewDefault: boolean;
  isCancelTarget: boolean;
}

export interface PriorityDto {
  id: string;
  key: string | null;
  name: string | null;
  rank: number;
  iconKind: PriorityIconKind;
  iconArrows: number;
  iconDirection: PriorityIconDirection;
  iconColor: PriorityIconColor;
}

export interface TagDto {
  id: string;
  name: string;
  color: string | null;
}

export interface MemberDto {
  id: string;
  displayName: string;
}

export interface ProjectDto {
  id: string;
  name: string;
  description: string | null;
  archived: boolean;
  /** Effective role of the current user in this project (`admin` = tenant admin). */
  myRole: ProjectRole | 'admin' | null;
}

export interface ProjectMemberDto {
  membershipId: string;
  displayName: string;
  role: ProjectRole;
}

/** Member as seen by the tenant administrator. */
export interface AdminMemberDto {
  id: string;
  displayName: string;
  /** null when pseudonymized. */
  email: string | null;
  tenantRole: TenantRole;
  defaultRole: DefaultRole;
  isActive: boolean;
  pseudonymized: boolean;
  /** Invitation not yet accepted. */
  pending: boolean;
  lastLoginAt: string | null;
}

// ---------------------------------------------------------------------------
// To-Dos
// ---------------------------------------------------------------------------

export interface TodoLinkDto {
  url: string;
  label: string | null;
}

export interface TodoDto {
  id: string;
  projectId: string | null;
  title: string;
  description: string | null;
  dueDate: string | null;
  priorityId: string | null;
  assigneeId: string | null;
  statusId: string;
  tags: TagDto[];
  links: TodoLinkDto[];
  createdAt: string;
  updatedAt: string;
  createdBy: MemberDto;
  updatedBy: MemberDto;
  commentCount: number;
  canEdit: boolean;
}

export interface TodoInput {
  projectId?: string | null;
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  priorityId?: string | null;
  assigneeId?: string | null;
  statusId?: string;
  tags?: string[];
  links?: TodoLinkDto[];
  /** Client-generated ID for idempotent offline creation. */
  clientId?: string;
}

export const HISTORY_FIELDS = [
  'created',
  'title',
  'description',
  'dueDate',
  'priority',
  'assignee',
  'status',
  'project',
  'tags',
  'links',
] as const;
export type HistoryField = (typeof HISTORY_FIELDS)[number];

export interface HistoryEntryDto {
  id: string;
  field: HistoryField;
  oldValue: string | null;
  newValue: string | null;
  changedAt: string;
  changedBy: MemberDto;
}

export interface CommentDto {
  id: string;
  body: string;
  createdAt: string;
  author: MemberDto;
}

export const LINK_URL_PATTERN = /^(https?:\/\/|mailto:)/i;
export const DUE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** History of a To-Do plus the referenced objects needed to display IDs as names. */
export interface HistoryResponse {
  entries: HistoryEntryDto[];
  refs: {
    statuses: StatusDto[];
    priorities: PriorityDto[];
    members: MemberDto[];
    projects: { id: string; name: string }[];
  };
}
