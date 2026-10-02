import {defineHandler} from 'void';

import {Counter} from '../../../durable-objects/counter.ts';

const COUNTER_NAME = /^[\w-]{1,64}$/;

function parseCounterName(name: string | undefined): string | null {
  return name !== undefined && COUNTER_NAME.test(name) ? name : null;
}

/** Reads the counter named in the path */
export const GET = defineHandler(async c => {
  const name = parseCounterName(c.req.param('name'));
  if (name === null) {
    return c.json({error: 'Invalid counter name'}, 400);
  }
  return c.json({count: await Counter.get(name).read()});
});

/** Increments the counter named in the path */
export const POST = defineHandler(async c => {
  const name = parseCounterName(c.req.param('name'));
  if (name === null) {
    return c.json({error: 'Invalid counter name'}, 400);
  }
  return c.json({count: await Counter.get(name).increment(1)});
});
