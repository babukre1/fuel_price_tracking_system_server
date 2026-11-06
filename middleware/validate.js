const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const message = result.error.issues
      .map((e) => {
        const field = e.path.join(".");
        return field ? `${field}: ${e.message}` : e.message;
      })
      .join("; ");
    return res.status(400).json({ success: false, message });
  }
  req.body = result.data;
  next();
};

module.exports = validate;
