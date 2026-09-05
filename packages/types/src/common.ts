export type ISODateString = string;
export type ObjectIdString = string;
export type CurrencyCode = string;

export interface ApiResponse<T> {
  data: T;
  requestId: string;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  requestId: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  hasNextPage: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
  requestId: string;
}
