"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { logActingScopeChange } from "@/lib/delegation/actingContext";

const STORAGE_KEY = "abstract_acting_as";

type ActingAsState = {
  profileId: string | null;
  label: string | null;
};

function loadStored(): ActingAsState {
  if (typeof window === "undefined") return { profileId: null, label: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { profileId: null, label: null };
    const parsed = JSON.parse(raw) as { profileId?: string; label?: string };
    if (parsed?.profileId && typeof parsed.profileId === "string") {
      return {
        profileId: parsed.profileId,
        label: typeof parsed.label === "string" ? parsed.label : null,
      };
    }
  } catch {
    // ignore
  }
  return { profileId: null, label: null };
}

function saveStored(state: ActingAsState) {
  if (typeof window === "undefined") return;
  if (state.profileId) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

type ActingAsContextValue = {
  actingAsProfileId: string | null;
  actingAsLabel: string | null;
  setActingAs: (profileId: string, label: string) => void;
  clearActingAs: () => void;
};

const ActingAsContext = createContext<ActingAsContextValue | null>(null);

export function ActingAsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ActingAsState>(loadStored);
  const previousProfileIdRef = useRef<string | null>(state.profileId);

  const setActingAs = useCallback((profileId: string, label: string) => {
    const next = { profileId, label };
    const prev = previousProfileIdRef.current;
    setState(next);
    saveStored(next);
    previousProfileIdRef.current = profileId;
    // Best-effort: record that a delegate has entered an acting-as scope.
    // Failures must not break UI so the helper swallows its own errors.
    void logActingScopeChange({
      subjectProfileId: profileId,
      previousSubjectProfileId: prev,
    });
  }, []);

  const clearActingAs = useCallback(() => {
    const prev = previousProfileIdRef.current;
    setState({ profileId: null, label: null });
    saveStored({ profileId: null, label: null });
    previousProfileIdRef.current = null;
    void logActingScopeChange({
      subjectProfileId: null,
      previousSubjectProfileId: prev,
    });
  }, []);

  const value = useMemo(
    () => ({
      actingAsProfileId: state.profileId,
      actingAsLabel: state.label,
      setActingAs,
      clearActingAs,
    }),
    [state.profileId, state.label, setActingAs, clearActingAs]
  );

  return (
    <ActingAsContext.Provider value={value}>{children}</ActingAsContext.Provider>
  );
}

export function useActingAs() {
  const ctx = useContext(ActingAsContext);
  return ctx ?? {
    actingAsProfileId: null,
    actingAsLabel: null,
    setActingAs: () => {},
    clearActingAs: () => {},
  };
}
