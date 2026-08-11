import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** The `cn` helper the vendored shadcn components expect at `@/lib/utils`. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
