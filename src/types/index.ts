import { RequestDeed } from '../deeds/request';
import { ActionDeed } from '../deeds/action';
import StubDeed from '../test-utils/stub/stubDeed';

type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };
export type XOR<T, U> = T | U extends object ? (Without<T, U> & U) | (Without<U, T> & T) : T | U;

export interface DeedMap {
  [key: string]: DeedInvocation;
}
// tslint:disable-next-line: class-name
export type obj<T> = Record<string, T>;

export type Unsubscribe = (id: symbol) => void;
export type Subscribe = (id: symbol, handler: () => any) => void;

export type Deed = ActionDeed | RequestDeed | StubDeed;

export enum DeedTypes {
  action = 'action',
  request = 'request',
  stub = 'stub',
}
export type Selector<T = any> = (cargo: T) => Partial<T> & obj<any>;

export type DeedCalls<T extends Record<string, any> = {}> = 
  {
    [key in keyof Omit<T, 'default'>]: (...args: any) => Promise<any>;
  }
;

export interface FetchExtras {
  props: obj<any>;
  cargo: obj<any>;
}

export interface RequestExtras {
  deeds: DeedMap;
  cargo: obj<any>;
  props: obj<any>;
}

export interface ActionExtras {
  cargo: obj<any>;
  deeds: DeedMap;
  props: obj<any>;
  skipShipment: () => void;
}

export type ArgsType = any | any[];

export type ActionFunction = (actionExtras: ActionExtras, ...args: ArgsType) => obj<any> | void;
export type RequestFunction<T = any> = (requestExtras: RequestExtras, ...args: ArgsType) => T;
export type FetchFunction<T = any> = (fetchExtras: FetchExtras, ...args: ArgsType) => T;

export type DeedInvocation<T = any> = (...args: T[]) => T;

export type ActionMethods = 'thatDoes' | 'thenDoes';

export type FetchMethods = 'hits' | 'withQueryParams' | 'withBody' | 'withJSON' | 'withConfig';

export type RequestMethods = 'afterwards' | 'catchError';

export interface ResponseError extends Error {
  status: number;
  statusText: string;
  url: string;
}

export enum BatchMode {
  SHALLOW = 'shallow',
  DEEP = 'deep',
}
