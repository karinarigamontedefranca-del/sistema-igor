export type Participant = {
  id: string;
  name: string;
  university: string | null;
  course: string | null;
  checked_in: boolean;
  checked_in_at: string | null;
  group_number: number | null;
};

export type ImportRow = {
  name: string;
  university: string;
  course: string;
};
