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

declare module 'multer' {
  import { RequestHandler } from 'express';

  export interface File {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    destination: string;
    filename: string;
    path: string;
    buffer: Buffer;
  }

  interface StorageEngine {
    _handleFile(req: unknown, file: File, cb: (error?: unknown, info?: Partial<File>) => void): void;
    _removeFile(req: unknown, file: File, cb: (error: Error | null) => void): void;
  }

  interface DiskStorageOptions {
    destination?: string | ((req: unknown, file: File, cb: (error: Error | null, destination: string) => void) => void);
    filename?: (req: unknown, file: File, cb: (error: Error | null, filename: string) => void) => void;
  }

  interface Options {
    dest?: string;
    storage?: StorageEngine;
    limits?: {
      fieldNameSize?: number;
      fieldSize?: number;
      fields?: number;
      fileSize?: number;
      files?: number;
      parts?: number;
      headerPairs?: number;
    };
  }

  interface Instance {
    single(fieldName: string): RequestHandler;
    array(fieldName: string, maxCount?: number): RequestHandler;
    fields(fields: readonly { name: string; maxCount?: number }[]): RequestHandler;
    none(): RequestHandler;
    any(): RequestHandler;
  }

  function multer(options?: Options): Instance;
  namespace multer {
    function diskStorage(options: DiskStorageOptions): StorageEngine;
    function memoryStorage(): StorageEngine;
  }

  export default multer;
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
