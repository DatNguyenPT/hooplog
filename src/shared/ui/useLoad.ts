import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

export type LoadState<T> =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

/** Loads data whenever the screen gains focus; `reload` refreshes after a change without flashing a spinner. */
export function useLoad<T>(load: () => Promise<T>): { state: LoadState<T>; reload: () => void } {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });
  const [version, setVersion] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      load()
        .then((data) => active && setState({ status: 'ready', data }))
        .catch(() => active && setState({ status: 'error' }));
      return () => {
        active = false;
      };
      // `version` re-runs the load on demand.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, version]),
  );

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { state, reload };
}
