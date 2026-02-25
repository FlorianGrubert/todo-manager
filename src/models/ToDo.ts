import type { TeamMember } from "./TeamMember";
import type { Status } from "./Status";

export interface ToDo {
  id: number;
  title: string;
  description: string;
  teamMember: TeamMember | null;
  status: Status;
  dueDate: string; // ISO DateTime string
}

