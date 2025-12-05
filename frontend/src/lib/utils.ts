import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Get cover art URL from path stored in database
 * The path is stored as "/covers/p1-25.jpg" and can be used directly
 * Returns placeholder if no cover art available
 */
export function getCoverUrl(coverArtPath?: string | null): string {
  if (!coverArtPath) return '/covers/placeholder.svg';
  // Path already includes /covers/ prefix
  return coverArtPath;
}
