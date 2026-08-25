declare module 'cors' {
  import { RequestHandler } from 'express';
  interface CorsOptions {
    origin?: boolean | string | RegExp | (string | RegExp)[] | ((origin: string | undefined, callback: (err: Error | null, origin?: boolean) => void) => void);
    methods?: string | string[];
    allowedHeaders?: string | string[];
    exposedHeaders?: string | string[];
    credentials?: boolean;
    maxAge?: number;
    preflightContinue?: boolean;
    optionsSuccessStatus?: number;
  }
  function cors(options?: CorsOptions): RequestHandler;
  export default cors;
}

declare module 'morgan' {
  import { RequestHandler } from 'express';
  function morgan(format: string, options?: Record<string, unknown>): RequestHandler;
  export default morgan;
}



declare module 'bcryptjs' {
  export function genSaltSync(rounds?: number): string;
  export function genSalt(rounds?: number): Promise<string>;
  export function hashSync(s: string, salt?: number | string): string;
  export function hash(s: string, salt: number | string): Promise<string>;
  export function compareSync(s: string, hash: string): boolean;
  export function compare(s: string, hash: string): Promise<boolean>;
  export function getRounds(encrypted: string): number;
}

declare module 'midtrans-client' {
  export interface SnapOptions {
    isProduction?: boolean;
    serverKey?: string;
    clientKey?: string;
  }

  export interface SnapTransactionDetails {
    order_id: string;
    gross_amount: number;
  }

  export interface SnapCustomerDetails {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
  }

  export interface SnapItemDetails {
    id?: string;
    price: number;
    quantity: number;
    name: string;
  }

  export interface SnapTransactionParameter {
    transaction_details: SnapTransactionDetails;
    customer_details?: SnapCustomerDetails;
    item_details?: SnapItemDetails[];
  }

  export interface SnapTransactionResult {
    token: string;
    redirect_url: string;
  }

  export class Snap {
    constructor(options?: SnapOptions);
    createTransaction(parameter: SnapTransactionParameter): Promise<SnapTransactionResult>;
    createTransactionToken(parameter: SnapTransactionParameter): Promise<string>;
    createTransactionRedirectUrl(parameter: SnapTransactionParameter): Promise<string>;
  }

  export class CoreApi {
    constructor(options?: SnapOptions);
    charge(parameter: Record<string, unknown>): Promise<Record<string, unknown>>;
  }

  const midtransClient: {
    Snap: typeof Snap;
    CoreApi: typeof CoreApi;
  };

  export default midtransClient;
}

declare namespace NodeJS {
  interface ProcessEnv {
    readonly NODE_ENV?: 'development' | 'production' | 'test';
    readonly PORT?: string;
    readonly DB_HOST?: string;
    readonly DB_PORT?: string;
    readonly DB_USER?: string;
    readonly DB_PASSWORD?: string;
    readonly DB_NAME?: string;
    readonly DB_SSL?: string;
    readonly DB_CONNECTION_LIMIT?: string;
    readonly JWT_SECRET?: string;
    readonly CLOUDINARY_CLOUD_NAME?: string;
    readonly CLOUDINARY_API_KEY?: string;
    readonly CLOUDINARY_API_SECRET?: string;
    readonly MIDTRANS_SERVER_KEY?: string;
    readonly MIDTRANS_CLIENT_KEY?: string;
    readonly MIDTRANS_IS_PRODUCTION?: string;
    readonly ALLOWED_ORIGINS?: string;
  }
}

