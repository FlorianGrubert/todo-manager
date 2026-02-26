export interface Status {
  name: string;
  rank: number;
  color: string;
  isActive: boolean;
}

export interface TeamMember {
  id: number;
  name: string;
}

export interface ToDo {
  id: number;
  title: string;
  description: string;
  teamMember: TeamMember | null;
  status: Status;
  dueDate: string; // ISO DateTime string
}

export interface NewToDoInput {
  title: string;
  description: string;
  teamMemberId: number | null;
  statusName: string;
  dueDate: string;
}

export interface UpdateToDoInput {
  title?: string;
  description?: string;
  teamMemberId?: number | null;
  statusName?: string;
  dueDate?: string;
}

