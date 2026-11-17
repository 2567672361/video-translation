const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TaskQueue } = require('../server.js');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('并发数不超过上限', async () => {
  const queue = new TaskQueue(2);
  let running = 0;
  let peak = 0;

  const tasks = Array.from({ length: 6 }, (_, index) =>
    queue.addTask(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await sleep(20);
      running -= 1;
      return index;
    }),
  );

  const results = await Promise.all(tasks);

  assert.equal(results.length, 6);
  assert.ok(peak <= 2, `并发峰值应不超过 2，实际 ${peak}`);
  assert.equal(queue.getRunningCount(), 0);
  assert.equal(queue.getQueueSize(), 0);
});

test('任务按提交顺序开始', async () => {
  const queue = new TaskQueue(1);
  const order = [];

  const tasks = ['a', 'b', 'c'].map((label) =>
    queue.addTask(async () => {
      order.push(label);
      await sleep(5);
      return label;
    }),
  );

  await Promise.all(tasks);
  assert.deepEqual(order, ['a', 'b', 'c']);
});

test('单个任务失败不影响后续任务', async () => {
  const queue = new TaskQueue(1);
  const order = [];

  const failing = queue.addTask(async () => {
    order.push('first');
    throw new Error('boom');
  });
  const following = queue.addTask(async () => {
    order.push('second');
    return 'ok';
  });

  await assert.rejects(failing, /boom/);
  assert.equal(await following, 'ok');
  assert.deepEqual(order, ['first', 'second']);
  assert.equal(queue.getRunningCount(), 0);
});

test('调整并发上限后继续消化队列', async () => {
  const queue = new TaskQueue(1);
  let running = 0;

  const tasks = Array.from({ length: 4 }, () =>
    queue.addTask(async () => {
      running += 1;
      await sleep(10);
      running -= 1;
    }),
  );

  queue.setMaxConcurrent(2);
  await Promise.all(tasks);
  assert.equal(queue.getMaxConcurrent(), 2);
  assert.equal(queue.getRunningCount(), 0);
});
