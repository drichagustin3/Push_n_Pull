const ACTIONS = [
  ['POST', /^\/api\/customers\/?$/, 'customer.add'], ['PUT', /^\/api\/customers\/[^/]+\/?$/, 'customer.edit'], ['DELETE', /^\/api\/customers\/[^/]+\/?$/, 'customer.delete'],
  ['POST', /^\/api\/products\/?$/, 'product.add'], ['PUT', /^\/api\/products\/[^/]+\/?$/, 'product.edit'], ['DELETE', /^\/api\/products\/[^/]+\/?$/, 'product.delete'],
  ['POST', /^\/api\/products\/[^/]+\/prices\/?$/, 'price.add'], ['PUT', /^\/api\/products\/[^/]+\/prices\/[^/]+\/?$/, 'price.edit'], ['DELETE', /^\/api\/products\/[^/]+\/prices\/[^/]+\/?$/, 'price.delete'],
];
function actionDenials(logger = console) {
  return (req, res, next) => {
    const action = ACTIONS.find(([method, pattern]) => method === req.method && pattern.test(req.path.toLowerCase()));
    if (action) res.once('finish', () => {
      if (![401,403].includes(res.statusCode)) return;
      // Fixed allowlisted action and status only: no URL/IDs, bodies, credentials,
      // identities, cookies, IP addresses or attacker-supplied diagnostics.
      const event = { event: 'authorization_denied', action: action[2], status: res.statusCode, at: new Date().toISOString() };
      try { logger.warn(JSON.stringify(event)); }
      catch { console.error('Security denial log delivery failed.'); }
    });
    next();
  };
}
module.exports = { actionDenials };
