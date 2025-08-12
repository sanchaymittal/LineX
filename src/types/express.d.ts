declare namespace Express {
  export interface Request {
    user?: {
      lineUserId: string;
      sessionToken: string;
    };
    correlationId?: string;
  }
}