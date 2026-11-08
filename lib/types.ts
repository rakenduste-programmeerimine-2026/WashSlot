// Hand-written row types. shortcut: may drift from the schema, replace with generated types from issue #6.

export type MachineType = "washer" | "dryer";
export type MachineState =
  | "free"
  | "in_use"
  | "awaiting_collection"
  | "reserved"
  | "out_of_order";
export type ReleaseReason = "collected" | "cancelled";

export type MachineStatus = {
  machine_id: string;
  building_id: string;
  label: string;
  type: MachineType;
  default_cycle_minutes: number;
  state: MachineState;
  current_cycle_id: string | null;
  current_user_id: string | null;
  cycle_started_at: string | null;
  estimated_finish_at: string | null;
  next_booking_id: string | null;
  next_booking_user_id: string | null;
  next_booking_starts_at: string | null;
  next_booking_ends_at: string | null;
};

export type Building = { id: string; name: string; timezone: string };

export type Machine = {
  id: string;
  building_id: string;
  label: string;
  type: MachineType;
  default_cycle_minutes: number;
  out_of_order: boolean;
  created_at: string;
};

export type Cycle = {
  id: string;
  machine_id: string;
  user_id: string;
  started_at: string;
  ends_at: string;
  released_at: string | null;
  release_reason: ReleaseReason | null;
};

export type Booking = {
  id: string;
  machine_id: string;
  user_id: string;
  starts_at: string;
  ends_at: string;
  status: "booked" | "cancelled" | "used";
  created_at: string;
};
