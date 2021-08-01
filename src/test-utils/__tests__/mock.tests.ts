import mock from '../mock';
import deed from '../../deeds';
import { ActionDeed } from '../../deeds/action';
import { ActionMethods } from '../../types';

const actionDeed = deed.action.called('test').thatDoes((extras, e) => e);
const actionDeedExtras = deed.action.called('test').thatDoes(({ cargo }) => cargo.test);

const requestDeed = deed.request
  .called('test')
  .hits((extras, e) => e)
  .withBody((extras, e) => e)
  .withJSON((extras, e) => ({ [e]: e }))
  .withConfig((extras, e) => ({ method: e }))
  .withQueryParams((extras, e) => e)
  .afterwards((extras, e) => e)
  .thenDoes((extras, e) => e)
  .catchError((extras, e) => e);
const requestDeedStringPath = deed.request.called('test').hits('/test');

describe('mock', () => {
  describe('action deed', () => {
    it('handles thatDoes args', () => {
      mock
        .thisCall('thatDoes')
        .fromThisDeed(actionDeed)
        .withArgs('test')
        .thenAssert(result => expect(result).toEqual('test'));
    });

    it('handles thatDoes extras', () => {
      mock
        .thisCall('thatDoes')
        .fromThisDeed(actionDeedExtras)
        .withExtras({ cargo: { test: 'test' } })
        .thenAssert(result => expect(result).toEqual('test'));
    });
  });

  describe('request deed', () => {
    it('handles hits', () => {
      mock
        .thisCall('hits')
        .fromThisDeed(requestDeed)
        .withArgs('test')
        .thenAssert(result => expect(result).toEqual('test'));
    });
    it('handles withBody', () => {
      mock
        .thisCall('withBody')
        .fromThisDeed(requestDeed)
        .withArgs('test')
        .thenAssert(result => expect(result).toEqual('test'));
    });
    it('handles withJSON', () => {
      mock
        .thisCall('withJSON')
        .fromThisDeed(requestDeed)
        .withArgs('test')
        .thenAssert(result => expect(result).toEqual({ test: 'test' }));
    });
    it('handles withConfig', () => {
      mock
        .thisCall('withConfig')
        .fromThisDeed(requestDeed)
        .withArgs('test')
        .thenAssert(result => expect(result).toEqual({ method: 'test' }));
    });
    it('handles withQueryParams', () => {
      mock
        .thisCall('withQueryParams')
        .fromThisDeed(requestDeed)
        .withArgs('test')
        .thenAssert(result => expect(result).toEqual('test'));
    });
    it('handles afterwards', () => {
      mock
        .thisCall('afterwards')
        .fromThisDeed(requestDeed)
        .withArgs('test')
        .thenAssert(result => expect(result).toEqual('test'));
    });
    it('handles thenDoes', () => {
      mock
        .thisCall('thenDoes')
        .fromThisDeed(requestDeed)
        .withArgs('test')
        .thenAssert(result => expect(result).toEqual('test'));
    });
    it('handles catchError', () => {
      mock
        .thisCall('catchError')
        .fromThisDeed(requestDeed)
        .withArgs('test')
        .thenAssert(result => expect(result).toEqual('test'));
    });

    it('handles path as string', () => {
      mock
        .thisCall('hits')
        .fromThisDeed(requestDeedStringPath)
        .withArgs('/test')
        .thenAssert(result => expect(result).toEqual('/test'));
    });
  });

  describe('invalid deed', () => {
    it('throws error', () => {
      expect(() => mock.thisCall('hits').fromThisDeed({} as ActionDeed)).toThrow();
    });
    it('throws error', () => {
      expect(() => mock.thisCall('whichMapsTo').fromThisDeed({} as ActionDeed)).toThrow();
    });
  });

  describe('invalid call', () => {
    it('throws error', () => {
      expect(() =>
        mock.thisCall('foobar' as ActionMethods).fromThisDeed({} as ActionDeed),
      ).toThrow();
    });
  });
});
