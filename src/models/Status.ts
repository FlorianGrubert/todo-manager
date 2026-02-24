export interface Status {
  name: string;
  rank: number;
  color: string;
  isActive: boolean;
}

export const AVAILABLE_STATUSES: Status[] = [
  { name: "Active", rank: 1, color: "green", isActive: true },
  { name: "Backlog", rank: 2, color: "lightgreen", isActive: true },
  { name: "On Hold", rank: 3, color: "yellow", isActive: true },
  { name: "Done", rank: 4, color: "grey", isActive: false }
];
