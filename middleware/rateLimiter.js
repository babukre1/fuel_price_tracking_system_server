const buckets = new Map();

const rateLimiter = ({ windowMs, max, keyPrefix }) => (req, res, next) => {
  const now = Date.now();
  const identity = req.body?.email?.trim().toLowerCase() || req.ip;
  const key = `${keyPrefix}:${req.ip}:${identity}`;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }

  current.count += 1;
  if (current.count <= max) return next();

  const retryAfter = Math.ceil((current.resetAt - now) / 1000);
  res.set("Retry-After", String(retryAfter));
  return res.status(429).json({
    success: false,
    message: "Too many attempts. Please try again later.",
  });
};

module.exports = rateLimiter;
