function createDeliveryQueue(logger = console) {
  const pending = [];
  const waiters = [];
  let active = 0;
  let closing = false;
  function pump() {
    while (active < 2 && pending.length) {
      const job = pending.shift();
      active += 1;
      Promise.resolve().then(job).catch(() => logger.error('Password reset request processing failed.'))
        .finally(() => {
          active -= 1;
          pump();
          if (!active && !pending.length) waiters.splice(0).forEach((resolve) => resolve());
        });
    }
  }
  return {
    enqueue(job) {
      if (closing || active + pending.length >= 50) return false;
      pending.push(job);
      // Account lookup/delivery starts after the common response path.
      setImmediate(pump);
      return true;
    },
    idle() { return active || pending.length ? new Promise((resolve) => waiters.push(resolve)) : Promise.resolve(); },
    async close() { closing = true; await this.idle(); },
  };
}

module.exports = { createDeliveryQueue };
