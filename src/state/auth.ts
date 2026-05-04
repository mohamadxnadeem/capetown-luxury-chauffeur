import { create } from "zustand";
import { DriverProfile, Role } from "@/api/types";

interface AuthState {
  bootstrapping: boolean;
  isAuthenticated: boolean;
  role: Role | null;
  driver: DriverProfile | null;
  setBootstrapped: () => void;
  signedIn: (role: Role, driver: DriverProfile | null) => void;
  signedOut: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  bootstrapping: true,
  isAuthenticated: false,
  role: null,
  driver: null,
  setBootstrapped: () => set({ bootstrapping: false }),
  signedIn: (role, driver) =>
    set({ isAuthenticated: true, role, driver, bootstrapping: false }),
  signedOut: () =>
    set({ isAuthenticated: false, role: null, driver: null, bootstrapping: false }),
}));
