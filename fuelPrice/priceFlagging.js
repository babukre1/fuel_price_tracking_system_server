const FuelPrice = require("./fuelPrice.model");

const FLAG_MULTIPLIER = parseFloat(process.env.PRICE_FLAG_MULTIPLIER) || 5;

const computeIsFlagged = (refPrice, numericPrice) =>
  refPrice !== null &&
  (numericPrice > refPrice * FLAG_MULTIPLIER ||
    numericPrice < refPrice / FLAG_MULTIPLIER);

const resolveRefPrice = async (current, stationId, fuelType, session) => {
  if (!current) return null;

  if (current.isFlagged) {
    const prev = await FuelPrice.findOne({
      station: stationId,
      fuelType,
      isFlagged: false,
      isActive: true,
    })
      .sort({ effectiveFrom: -1 })
      .session(session)
      .then((p) => p?.price ?? null);

    return prev;
  }

  return current.price;
};

module.exports = { computeIsFlagged, resolveRefPrice };
