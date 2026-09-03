export interface FixtureState {
  title: string;
  hidden: boolean;
  rows: { id: string; title: string; unread: boolean }[];
}

export interface FixtureRefs {
  dock: unknown;
}

export interface FixtureActions {
  open(): void;
  boot(): Promise<void>;
}

export function createController(deps: { refs: () => FixtureRefs }) {
  return deps as never;
}
