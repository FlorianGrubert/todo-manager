import type {
  PriorityDto,
  PriorityIconColor,
  PriorityIconDirection,
  PriorityIconKind,
  StatusCategory,
  StatusDto,
  TagDto,
} from '@fg/shared';
import { toBool } from '../../lib/flags.js';

export interface StatusRow {
  id: string;
  tenant_id: string;
  system_key: string | null;
  name: string | null;
  rank: number;
  color: string;
  category: StatusCategory;
  is_new_default: number;
  is_cancel_target: number;
  removed_at: string | null;
}

export interface PriorityRow {
  id: string;
  tenant_id: string;
  system_key: string | null;
  name: string | null;
  rank: number;
  icon_kind: PriorityIconKind;
  icon_arrows: number;
  icon_direction: PriorityIconDirection;
  icon_color: PriorityIconColor;
  removed_at: string | null;
}

export interface TagRow {
  id: string;
  name: string;
  color: string | null;
}

export const toStatusDto = (r: StatusRow): StatusDto => ({
  id: r.id,
  key: r.system_key,
  name: r.name,
  rank: Number(r.rank),
  color: r.color,
  category: r.category,
  isNewDefault: toBool(r.is_new_default),
  isCancelTarget: toBool(r.is_cancel_target),
});

export const toPriorityDto = (r: PriorityRow): PriorityDto => ({
  id: r.id,
  key: r.system_key,
  name: r.name,
  rank: Number(r.rank),
  iconKind: r.icon_kind,
  iconArrows: Number(r.icon_arrows),
  iconDirection: r.icon_direction,
  iconColor: r.icon_color,
});

export const toTagDto = (r: TagRow): TagDto => ({ id: r.id, name: r.name, color: r.color });
