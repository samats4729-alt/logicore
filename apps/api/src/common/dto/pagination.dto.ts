export class PaginationQueryDto {
    page?: string;
    limit?: string;
}

export interface PaginatedResult<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export function getPaginationParams(query: PaginationQueryDto) {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.max(1, parseInt(query.limit || '50', 10));
    const skip = (page - 1) * limit;
    return { page, limit, skip, take: limit };
}
