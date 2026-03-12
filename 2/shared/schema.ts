// Updating rejection_entries and rework_entries tables to include new fields

rejection_entries:
  - rate: number    // The rate associated with the rejection
  - amount: number  // The amount associated with the rejection
  - import_tracking: string  // Field to track import information

rework_entries:
  - rate: number    // The rate associated with the rework
  - amount: number  // The amount associated with the rework
  - import_tracking: string  // Field to track import information

