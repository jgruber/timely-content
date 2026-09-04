import express from 'express';

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'all', 'use'];

/**
 * Express 4 does not forward rejected promises from async handlers to the
 * error middleware -- they surface as unhandled rejections and take the
 * process down. This wrapper routes them to next() instead.
 */
export function asyncRouter() {
  const router = express.Router();
  for (const method of METHODS) {
    const original = router[method].bind(router);
    router[method] = (...args) => original(...args.map(wrapHandler));
  }
  return router;
}

function wrapHandler(handler) {
  if (typeof handler !== 'function' || handler.length > 3) return handler;
  // An Express router is itself a 3-arity function. Wrapping one would hide
  // its .stack and break mounting, so leave routers alone.
  if (handler.stack !== undefined) return handler;
  const wrapped = (req, res, next) => {
    try {
      const result = handler(req, res, next);
      if (result && typeof result.then === 'function') result.catch(next);
    } catch (err) {
      next(err);
    }
  };
  Object.defineProperty(wrapped, 'name', { value: handler.name });
  return wrapped;
}
