export interface Player { id: string; name: string; ready: boolean; submitted: boolean }
export interface Entry { authorId: string; kind: 'text' | 'drawing'; text?: string; imageId?: string }
export interface Room { code: string; hostId: string; youId: string; players: Player[]; status: 'lobby' | 'playing' | 'finished'; gameId: string; stage: number; totalStages: number; version: number; task?: { kind: 'text' | 'drawing'; prompt?: string; imageId?: string }; chains?: { ownerId: string; entries: Entry[] }[] }
export interface Session { code: string; token: string }
export const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
