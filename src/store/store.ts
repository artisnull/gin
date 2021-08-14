// tslint:disable member-ordering

/*
-- gin
* Construction/Registration:
constructor, registerDeeds, registerInstance, Store.assign.to, subscribe
* Initialization
initRequestDeed, initActionDeed, initStubDeed, initFlowDeed, generateAction, makeFetchCall
* Cleanup
unsubscribe, disconnect, resetBatch, endProcess
* Cargo Transit
emit, startTimer, enqueue, resetBatch,
* Other
getName, debugLog, updateCurrentProps, Store.publish, updateCargo

-- Deed Flows
* Action Deed Flow
registerDeeds -> initActionDeed -> generateAction -> enqueue? -> startTimer? -> emit?
* Request Deed Flow
registerDeeds -> initRequestDeed -> makeFetchCall -> generateAction? -> enqueue? -> startTimer? -> emit?
* Stub Deed Flow
registerDeeds -> initStubDeed

*/
import deepMerge from 'lodash/merge';
import shortid from 'shortid';
import obj2str from 'fast-safe-stringify';
import { ActionDeed } from '../deeds/action';
import { RequestDeed } from '../deeds/request';
import StubDeed from '../test-utils/stub/stubDeed';
import TestStore from '../test-utils/test-store/test-store';
import {
  ActionExtras,
  ActionFunction,
  BatchMode,
  Deed,
  DeedInvocation,
  DeedMap,
  DeedTypes,
  FetchExtras,
  obj,
  RequestExtras,
  RequestFunction,
  ResponseError,
  Subscribe,
  Unsubscribe,
} from '../types';
import { print } from 'graphql';

type ActionDeedInit = (deed: ActionDeed, pid?: string) => void;

type DebugLog = (message: string, color?: string, ...args: any) => void;
type DoAfterCall = (...args: any[]) => Promise<RequestFunction>;

type Enqueue = (returnedDeedValue: any) => void;
interface FetchCallConfig {
  config: RequestInit;
  url: string;
  doAfterCall: (args: any[]) => Promise<RequestFunction>;
  doLast: DeedInvocation;
  handleError: (e: Error) => void;
}

type GenerateAction = (
  action: ActionFunction,
  name: string,
  isRequestDeed?: boolean,
  processId?: string,
) => (args: any[] | any) => void;
type MakeFetchCall = (fetchCallConfig: FetchCallConfig) => Promise<any>;
type NameFunction = (generatedId: string) => string;
type NamedStores = Map<
  string,
  {
    subscribe: Subscribe;
    unsubscribe: Unsubscribe;
    getCargo: () => obj<any>;
    getDeeds: () => DeedMap;
  }
>;
type InitStubDeed = (deed: StubDeed) => void;
type RegisterDeeds = (deeds: Deed[], pid?: string) => void;
type RequestDeedInit = (deed: RequestDeed, pid?: string) => void;
type ResetBatch = () => void;
interface StoreProps {
  batchTime?: number;
  batchMode?: BatchMode;
  cargo?: obj<any>;
  debug?: boolean;
  deeds?: Deed[];
  name?: string | NameFunction;
  [key: string]: any;
}

type UpdateCargo = (newCargo: obj<any>) => void;

const BATCH_TIMEOUT = 4; // ms

const isContentTypeJSON = (contentType: string) => {
  if (!contentType) {
    return false;
  }
  return (
    contentType.indexOf('application/javascript') !== -1 ||
    contentType.indexOf('application/json') !== -1
  );
};

const defaultFetchResponse = res => {
  const isJson = isContentTypeJSON(res.headers.get('content-type'));
  if (!res.ok) {
    res.json().then(e => {
      throw e;
    });
  }

  if (!isJson) {
    // Whatever body is here, we can't parse it. So just resolve with an empty object.
    return Promise.resolve({
      message: `The API response from ${res.url} returned a body type of something other than JSON.
      If you need to handle non-JSON responses, define your own Store.defaultFetchResponse.`,
    });
  }

  return res.json();
};

const defaultErrorResponse = (e: Error): void => {
  throw e;
};

const mergeByMode = {
  [BatchMode.SHALLOW]: (o1, o2) => Object.assign({}, o1, o2),
  [BatchMode.DEEP]: (o1, o2) => deepMerge({}, o1, o2),
};

class Store {
  /* ******* STATIC ******** */
  // Assign a subscriber to a store
  public static assign = (id, handler) => {
    return {
      to: storeName => {
        if (!Store.namedStores.has(storeName)) {
          throw Error(
            `You're attempting to subscribe to ${storeName}, but that store hasn't been created yet`,
          );
        }
        const store = Store.namedStores.get(storeName);
        store.subscribe(id, handler);
        return store;
      },
    };
  };
  public static baseUrl = '';
  public static defaultFetchResponse = defaultFetchResponse;
  public static defaultErrorResponse = defaultErrorResponse;
  public static defaultFetchOptions: ResponseInit = {};

  // Replaces stores with the test store
  public static mock = () => {
    /* istanbul ignore next */
    if (process.env.NODE_ENV !== 'test') {
      throw Error('Attempting to mock the store is not allowed outside of a test environment');
    }
    Store._assign = Store.assign;
    Store.assign = () => ({ to: () => Store.TestStore as any });
  };

  public static namedStores: NamedStores = new Map();

  public static TestStore: TestStore = new TestStore();

  // Replaces the test store with real stores
  public static unmock = () => {
    /* istanbul ignore next */
    if (process.env.NODE_ENV !== 'test' || !Store._assign) {
      throw Error('Store has not been mocked!');
    }
    Store.assign = Store._assign;
    Store._assign = undefined;
  };

  // @ts-ignore used to hold the old assign while being mocked
  private static _assign: any;

  constructor(props: StoreProps = {}) {
    const { cargo = {}, deeds = [], name, debug, batchTime, batchMode, ...restProps } = props;

    let storeName = name;
    if (typeof name === 'function') {
      storeName = name(shortid.generate());
    }

    if (!storeName) {
      storeName = shortid.generate();
    }

    // setup attributes
    this._cargo = cargo;
    this._volatileCargo = cargo;
    this._batchTime = batchTime != null ? batchTime : this._batchTime;
    this._batchMode = batchMode === BatchMode.DEEP ? BatchMode.DEEP : BatchMode.SHALLOW;
    if (this._batchTime === 0) {
      this._isBatchless = true;
    }
    this._isDebugMode = debug === true;

    // setup props
    this.updateCurrentProps(restProps);

    // initialize process for external update
    this.updateCargo = (this.updateCargo({}) as unknown) as UpdateCargo;

    // register store
    if (typeof storeName === 'string' && storeName.length > 0) {
      this._storeName = storeName;
      this._registerInstance();
    } else {
      throw Error('Name must be a non-empty string');
    }

    // register deeds
    this._registerDeeds(deeds);
  }

  private _batch: obj<any> = {};
  private _batchMode: BatchMode = BatchMode.SHALLOW;
  private _batchTime: number = BATCH_TIMEOUT;
  private _cargo: obj<any>;
  private _currentProps: obj<any> = {};
  private _deeds: DeedMap = {};
  private _isBatchless = false;
  private _isDebugMode = false;
  private _timer?: number;
  private _volatileCargo: obj<any> = {};
  private _storeName?: string;
  private _subs: Map<symbol, (...args: any) => any> = new Map();

  /* ******* PUBLIC ******** */

  // Close and cleanup this store
  public disconnect = () => {
    Store.namedStores.delete(this._storeName);
    this._subs.clear();
    this._deeds = new Proxy(
      {},
      {
        get: (t, p) => {
          // tslint:disable-next-line: no-console
          console.warn(`Deed "${String(p)}" was called on disconnected store ${this._storeName}`);
          return () => Promise.resolve();
        },
      },
    );
    this._cargo = null;
  };

  // expose name
  public getName = () => this._storeName;

  // useSource or withSource call this to get access to cargo and actions
  public subscribe: Subscribe = (id, handler) => {
    this._subs.set(id, handler);
  };

  public updateCargo: UpdateCargo = () => {
    return newCargo => {
      this._debugLog(`external queued cargo:`, 'DarkSalmon', newCargo);
      this._enqueue(newCargo);
    };
  };

  // useSource and withSource call this when unmounting to unsubscribe from updates
  public unsubscribe: Unsubscribe = (id: symbol) => {
    this._subs.delete(id);
  };

  // Keep our reference to external props updated
  public updateCurrentProps = newProps => {
    this._currentProps = {
      ...this._currentProps,
      ...newProps,
    };
  };

  /* ******* PRIVATE ******** */

  private _debugLog: DebugLog = (message, color = 'black', ...args) => {
    if (this._isDebugMode) {
      const messageStyle = `
        border-left: 2px solid ${color};
        padding-left: 4px;
        font-size: 1em;
        color: ${color}
      `;

      const additionalArgs = [];
      args.forEach(arg => {
        additionalArgs.push(typeof arg === 'object' ? JSON.parse(obj2str(arg)) : arg);
      });
      // tslint:disable-next-line: no-console , necessary for a debug tool
      const debugLog = console.log.bind(
        this,
        ...[
          `%c${this._storeName ? `${this._storeName}:` : ''}${message}`,
          messageStyle,
          ...additionalArgs,
        ],
      );
      debugLog();
    }
  };

  // Called after batch timer expires, ships new cargo to subscribers
  private _emit = () => {
    // Get new cargo, then diff with old cargo
    const newCargo = this._volatileCargo;

    this._debugLog(`new cargo`, 'green', newCargo);

    // Use each subs selector to determine if eligible for update
    this._subs.forEach(listener => listener(newCargo));

    // Set new cargo
    this._cargo = newCargo;
    this._resetBatch();
  };

  /*
   Send updated cargo to subscribers
   waits to emit until batch timer elapses
   Pushes new cargo into batch
   */
  private _enqueue: Enqueue = returnedDeedValue => {
    if (!this._timer && !this._isBatchless) {
      this._startTimer();
    }
    this._batch = mergeByMode[this._batchMode](this._batch, returnedDeedValue);
    this._volatileCargo = mergeByMode[this._batchMode](this._volatileCargo, this._batch);

    if (this._isBatchless) {
      this._emit();
    }
  };

  private _generateAction: GenerateAction = (action, name) => {
    return async (...args) => {
      let shouldSkipCargoUpdate = false;
      let returnedDeedValue = null;

      const actionExtras: () => ActionExtras = () => ({
        props: this._currentProps,
        cargo: this._volatileCargo,
        deeds: this._deeds,
        skipShipment: () => {
          shouldSkipCargoUpdate = true;
        },
      });
      this._debugLog(`${name} does()`, 'Blue');

      // don't emit until we have a real value (await)
      // @ts-ignore ts doesn't like parameters after a spread param
      returnedDeedValue = await action(actionExtras(), ...args);

      if (!shouldSkipCargoUpdate) {
        this._debugLog(`${name} queued cargo:`, 'DarkSalmon', returnedDeedValue);
        return this._enqueue(returnedDeedValue);
      }
      return returnedDeedValue;
    };
  };

  /**
   * Initialize Action deeds
   * Bind the deed function with extra arguments, then take the returned value and make a cargo change from it
   * This bound function is passed down to subscribers
   */
  private _initActionDeed: ActionDeedInit = deed => {
    const { name, action } = deed.getProperties();
    if (this._deeds[name]) {
      throw Error(`A deed has already been registered with name ${name}`);
    }

    this._deeds[name] = this._generateAction(action, name, false);
  };

  /**
   * Initialize Request deeds
   * Bind the deed function with extra arguments and the fetch api
   * This bound function is passed down to subscribers
   */
  private _initRequestDeed: RequestDeedInit = deed => {
    const {
      name,
      path,
      action,
      config,
      catchError,
      after,
      body,
      json,
      headers,
      queryParams,
      verb = 'GET',
      vars,
      node,
    } = deed.getProperties();

    if (this._deeds[name]) {
      throw Error(`A deed has already been registered with name ${name}`);
    }

    const queryString = new URLSearchParams();
    let fetchConfig: RequestInit = {
      body: '',
      headers: {
        ...(Store.defaultFetchOptions.headers ? Store.defaultFetchOptions.headers : {}),
      },
      method: verb,
    };
    let doAfterCall: DoAfterCall = async (...args: any) => args;
    let doLast: ActionFunction = (args: any) => {
      return args;
    };
    let handleError = Store.defaultErrorResponse;

    const fetchExtras: () => FetchExtras = () => ({
      props: this._currentProps,
      cargo: this._volatileCargo,
    });

    const requestExtras: () => RequestExtras = () => ({
      props: this._currentProps,
      deeds: this._deeds,
      cargo: this._volatileCargo,
    });
    /* THEN DOES */
    if (action) {
      doLast = this._generateAction(action, name, true);
    }

    // The actual deed call
    this._deeds[name] = async (...args: any[]) => {
      this._debugLog(`request ${name}`, 'Blue');

      /* QUERY PARAMS */
      if (queryParams) {
        const qP = queryParams(fetchExtras(), ...args);
        if (typeof qP !== 'object') {
          throw Error(`withQueryParams must return an object`);
        }
        Object.keys(qP).forEach(key => {
          if (qP[key] === undefined) {
            queryString.delete(key);
          } else {
            queryString.set(key, qP[key]);
          }
        });
      }

      /* CONFIG */
      if (config) {
        fetchConfig = {
          ...fetchConfig,
          ...config(fetchExtras(), ...args),
        };
      }

      /* BODY */
      if (body) {
        fetchConfig.body = body(fetchExtras(), ...args);
      }

      /* JSON */
      if (json) {
        fetchConfig.body = obj2str(json(fetchExtras(), ...args));
        fetchConfig.headers['content-type'] = 'application/json; charset=utf-8';
      }

      if (node) {
        fetchConfig.method = 'POST'
        fetchConfig.headers['Content-Type'] = 'application/json';
        fetchConfig.headers['Accept'] = 'application/json';
        fetchConfig.body = obj2str({
          query: print(node),
          variables: vars ? vars(fetchExtras(), ...args) : '',
        });
      }

      /* HEADERS */
      if (headers) {
        fetchConfig.headers = {
          ...fetchConfig.headers,
          ...headers,
        };
      }

      /* CATCH ERROR */
      if (catchError) {
        handleError = (e: ResponseError): void => {
          return catchError(requestExtras(), e);
        };
      }

      /* AFTER */
      if (after) {
        doAfterCall = async (...args) => after(requestExtras(), ...args);
      }

      /* HITS */
      const searchParams = queryString.toString();
      let endpointPath = path;
      if (typeof path === 'function') {
        endpointPath = path(fetchExtras(), ...args);
      }
      const url = `${endpointPath}${searchParams.length > 0 ? `?${searchParams}` : ''}`;

      // cleanse headers of null/undefined
      fetchConfig.headers = Object.keys(fetchConfig.headers).reduce((acc, header) => {
        const headerVal = fetchConfig.headers[header];
        if (headerVal != null) {
          acc[header] = headerVal;
        }
        return acc;
      }, {});

      return this._makeFetchCall({
        url,
        doAfterCall,
        doLast,
        handleError,
        config: fetchConfig,
      });
    };
  };

  // Registers a stub deed
  private _initStubDeed: InitStubDeed = stubDeed => {
    const { name, stub } = stubDeed.getProperties();
    this._deeds[name] = stub;
  };

  /**
   * Make the actual fetch api call, using the config generated in _initRequestDeed
   */
  private _makeFetchCall: MakeFetchCall = async function({
    config,
    url,
    doAfterCall,
    doLast,
    handleError,
  }) {
    try {
      if (config.method.toUpperCase() === 'GET' || config.method.toUpperCase() === 'HEAD') {
        delete config.body;
      }
      if (Object.keys(config.headers).length < 1) {
        delete config.headers;
      }
      const res = await fetch(`${url.startsWith('http') ? '' : Store.baseUrl}${url}`, {
        ...Store.defaultFetchOptions,
        ...config,
      });
      const data = await Store.defaultFetchResponse(res);
      const afterRes = await doAfterCall(data);

      if (Array.isArray(afterRes)) {
        return doLast(...afterRes);
      }
      return doLast(afterRes);
    } catch (e) {
      return handleError(e);
    }
  };

  /**
   * Takes deeds and sends them to their respective init function
   */
  private _registerDeeds: RegisterDeeds = deeds => {
    deeds.forEach((deed: Deed) => {
      switch (deed.deedType) {
        case DeedTypes.action: {
          this._initActionDeed(deed as ActionDeed);
          break;
        }
        case DeedTypes.request: {
          this._initRequestDeed(deed as RequestDeed);
          break;
        }
        case DeedTypes.stub: {
          this._initStubDeed(deed as StubDeed);
          break;
        }
        default: {
          throw Error('Deed is not a valid Deed type');
        }
      }
    });
  };

  // make this store instance accesible outside of direct subscribers
  private _registerInstance = () => {
    if (Store.namedStores.has(this._storeName)) {
      Store.namedStores.delete(this._storeName);
    }

    Store.namedStores.set(this._storeName, {
      subscribe: this.subscribe,
      unsubscribe: this.unsubscribe,
      getCargo: () => this._cargo,
      getDeeds: () => this._deeds,
    });
  };

  private _resetBatch: ResetBatch = () => {
    clearTimeout(this._timer);
    this._timer = undefined;
    this._batch = {};
  };

  // Set timeout for batching updates
  private _startTimer = () => {
    // @ts-ignore
    this._timer = setTimeout(this._emit, this._batchTime);
  };
}

export default Store;
