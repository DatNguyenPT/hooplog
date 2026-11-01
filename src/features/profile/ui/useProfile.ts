import { useCallback } from 'react';

import { useLoad } from '@/shared/ui/useLoad';
import { useProfileRepository } from '../data/profileRepository';

/** The player's profile, loaded again whenever the screen gains focus. */
export function useProfile() {
  const profiles = useProfileRepository();
  const load = useCallback(() => profiles.getProfile(), [profiles]);
  return useLoad(load);
}
