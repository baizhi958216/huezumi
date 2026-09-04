export type StatusFilter = 'ALL' | 'ACTIVE' | 'SUCCEEDED' | 'FAILED' | 'ARCHIVED'
export type RatioFilter = 'ALL' | 'VERTICAL' | 'HORIZONTAL' | 'SQUARE'
export type MediaTypeFilter = 'ALL' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'TEXT_ONLY'
export type ViewMode = 'grid' | 'masonry' | 'list'
export type SortBy = 'newest' | 'oldest'

export interface ProjectCounts {
  total: number
  active: number
  succeeded: number
  failed: number
  archived: number
}
