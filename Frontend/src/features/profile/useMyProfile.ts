import { useCallback, useEffect, useState } from 'react';

import {
  classifyProfileError,
  fetchMyProfile,
  isAbortError,
  type Profile,
  type ProfileFailure,
} from '../../api/profile.api';

/** Loads the signed-in person's own profile. Nothing renders until the server has answered. */
export const useMyProfile = () => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<ProfileFailure | null>(null);

  const load = useCallback(async (signal?: AbortSignal): Promise<void> => {
    setLoading(true);
    setFailure(null);
    try {
      setProfile(await fetchMyProfile(signal));
    } catch (error) {
      if (isAbortError(error)) return;
      setFailure(classifyProfileError(error));
    } finally {
      if (signal?.aborted !== true) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return {
    profile,
    loading,
    failure,
    setProfile,
    reload: useCallback(() => void load(), [load]),
  };
};
