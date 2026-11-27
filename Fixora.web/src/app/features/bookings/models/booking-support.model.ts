export interface MechanicRosterDto {
  readonly id: string;
  readonly name: string;
  readonly phone: string;
  readonly employeeCode: string;
  readonly onDuty: boolean;
  readonly activeJobs: number;
}

export interface BayDto {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
}

export interface ServiceDto {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly standardMinutes: number;
  readonly basePrice: number;
}

export interface SlotDto {
  readonly start: string;
  readonly end: string;
  readonly freeBays: number;
}

export interface JobSummaryDto {
  readonly id: string;
  readonly number: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly vehicleId: string;
  readonly vehicleLabel: string;
  readonly mechanicId: string | null;
  readonly mechanicName: string | null;
  readonly bayId: string | null;
  readonly bayName: string | null;
  readonly status: string;
  readonly priority: number;
  readonly queuePosition: number;
  readonly etaAt: string | null;
  readonly estimatedMinutes: number;
  readonly elapsedMinutes: number;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly complaint: string | null;
  readonly managerNote: string | null;
}
