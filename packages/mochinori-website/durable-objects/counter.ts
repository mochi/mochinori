import {defineDurableState} from 'void/durable';

/**
 * An example Durable Object: a named counter. Each name gets its own
 * instance, and Void persists `state` between calls.
 */
export const Counter = defineDurableState({
  initialState: {count: 0},
  methods: {
    increment(context, by: number = 1) {
      context.state.count += by;
      return context.state.count;
    },
    read(context) {
      return context.state.count;
    },
  },
});

export default Counter;
