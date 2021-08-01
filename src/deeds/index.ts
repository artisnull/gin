import action from './action';
import request from './request';
// tslint:disable-next-line: class-name
// eslint-disable-next-line @typescript-eslint/class-name-casing
export interface deed {
  action: action;
  request: request;
}
const deed: deed = {
  action,
  request,
};

export default deed;
export { default as combineDeeds } from './combineDeeds';
