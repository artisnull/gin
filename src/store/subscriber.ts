// tslint:disable: ban-types
import Store from './store';
import { Selector, obj } from '../types';
import checkEqualOneLevelDeep from './checkEqualOneLevelDeep';
import shortid from 'shortid';

interface SubscriberArgs {
  storeNames: string[];
  selector: Selector;
}

type EventNames = 'subscribe' | 'unsubscribe' | 'update';

type VoidFunc = () => void;
type EmitFunc = (eventName: EventNames, payload?: any) => void;
type SelectFunc<T = Record<string, any>> = (newCargo: T) => T;
type OnFunc = (eventName: EventNames, listener: Function) => void;

interface Subscription {
  subscribe: Store['subscribe'];
  unsubscribe: Store['unsubscribe'];
  getCargo: () => Store['_cargo'];
  getDeeds: () => Store['_deeds'];
}

const genEventMap = () =>
  new Map<EventNames, []>([
    ['subscribe', []],
    ['unsubscribe', []],
    ['update', []],
  ]);

class Subscriber {
  public storeNames: string[];
  public cargo: obj<any> = {};
  public deeds: obj<any> = {};

  private identity = Symbol(shortid.generate());
  private selector: Selector;

  private listeners: Map<EventNames, Function[]> = genEventMap();
  private subscriptions: Map<string, Subscription> = new Map();

  private isSubscribed = false;

  constructor(args: SubscriberArgs) {
    const { storeNames, selector } = args;
    this.storeNames = storeNames;
    this.selector = selector;
    this.handleUpdate = this.handleUpdate.bind(this);
    this.unsubscribeAll = this.unsubscribeAll.bind(this);
  }

  public subscribe: VoidFunc = () => {
    const initialCargo = {};
    const deeds = {};

    this.storeNames.forEach(name => {
      const store = Store.assign(this.identity, this.handleUpdate).to(name);

      Object.assign(initialCargo, store.getCargo());
      Object.assign(deeds, store.getDeeds());

      this.subscriptions.set(name, store);
    });

    this.cargo = this.select(initialCargo);
    this.deeds = deeds;

    this.isSubscribed = true;
    this.emit('subscribe', { deeds, cargo: this.cargo });
  };

  public unsubscribeAll() {
    this.subscriptions.forEach(store => store.unsubscribe(this.identity));
    this.subscriptions.clear();
    this.emit('unsubscribe');

    this.listeners.clear();
    this.listeners = genEventMap();
    this.isSubscribed = false;
  }

  public on: OnFunc = (eventName, listener) => {
    const listeners = this.listeners.get(eventName);
    listeners.push(listener);
    this.listeners.set(eventName, listeners);
  };

  private getRawCargo = () => {
    const c = {};
    this.subscriptions.forEach(store => {
      Object.assign(c, store.getCargo());
    });
    return c;
  };

  private emit: EmitFunc = (eventName, payload) => {
    this.listeners.get(eventName).forEach(listener => listener(payload));
  };

  private select: SelectFunc = newCargo => this.selector({ ...this.getRawCargo(), ...newCargo });

  private handleUpdate(updatedCargo) {
    const newSelectedCargo = this.select(updatedCargo);
    if (this.isSubscribed && !checkEqualOneLevelDeep(this.cargo, newSelectedCargo)) {
      this.update(newSelectedCargo);
    }
    return;
  }

  private update = cargo => {
    this.cargo = cargo;
    this.emit('update', cargo);
  };
}

export default Subscriber;
