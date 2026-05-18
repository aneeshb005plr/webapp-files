// src/app/chat/utils/time-ago.util.ts
// Simple time-ago formatter — no external library needed.

export function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';

  const date  = new Date(dateStr);
  const now   = new Date();
  const secs  = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (secs < 60)                        return 'just now';
  if (secs < 3600)                      return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400)                     return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 604800)                    return `${Math.floor(secs / 86400)}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}