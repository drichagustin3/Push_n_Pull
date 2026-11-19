function requireSuperadmin(req, res, next) {
  if (req.user?.role !== 'superadmin') return res.status(403).json({ error: 'Only a Superadmin may perform this operation.' });
  next();
}

module.exports = { requireSuperadmin };
