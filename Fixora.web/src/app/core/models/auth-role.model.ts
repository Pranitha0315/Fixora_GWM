export type AuthRole =
  | 'Owner'
  | 'Manager'
  | 'PlatformAdmin';

export const MANAGER_PORTAL_ROLES: readonly AuthRole[] = [
  'Owner',
  'Manager',
];
