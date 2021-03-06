import {
  ActionExtras,
  ActionMethods,
  FetchExtras,
  FetchMethods,
  RequestExtras,
  RequestMethods,
} from '../../types';
import MockDeed from './mockDeed';

const requestMethods = new Set(['afterwards', 'catchError']);
const fetchMethods = new Set(['withConfig', 'hits', 'withJSON', 'withBody', 'withQueryParams']);
const actionMethods = new Set(['thatDoes', 'thenDoes']);

/*
  What is this?
  This is function overloading in TS.
  It allows us to use different return types based on different argument patterns,
  so here, it will use the correct "extras" type based on the method chosen
*/
function thisCall(method: ActionMethods): MockDeed<ActionExtras>;
function thisCall(method: FetchMethods): MockDeed<FetchExtras>;
function thisCall(method: RequestMethods): MockDeed<RequestExtras>;
function thisCall(method: any) {
  if (fetchMethods.has(method)) {
    return new MockDeed<FetchExtras>({ _method: method });
  }
  if (actionMethods.has(method)) {
    return new MockDeed<ActionExtras>({ _method: method });
  }
  if (requestMethods.has(method)) {
    return new MockDeed<RequestExtras>({ _method: method });
  }
  throw Error(`${method} is not a valid deed method`);
}

export default thisCall;
