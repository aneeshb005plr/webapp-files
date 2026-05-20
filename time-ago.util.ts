// src/app/chat/utils/time-ago.util.ts

export function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '';

  // Ensure UTC parsing — backend returns ISO strings without Z suffix sometimes
  // Adding Z forces UTC interpretation preventing timezone offset issues
  const normalized = dateStr.endsWith('Z') || dateStr.includes('+')
    ? dateStr
    : dateStr + 'Z';

  const date = new Date(normalized);
  if (isNaN(date.getTime())) return '';

  const now  = new Date();
  const secs = Math.floor((now.getTime() - date.getTime()) / 1000);

  // Guard against future dates (clock skew)
  if (secs < 0)    return 'just now';
  if (secs < 60)   return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}