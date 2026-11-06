const mongoose = require("mongoose");

const userStationFollowSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    station: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Station",
      required: true,
    },
    createdByAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "userAdmin",
      default: null,
    },
  },
  { timestamps: true },
);

userStationFollowSchema.index({ user: 1, station: 1 }, { unique: true });
userStationFollowSchema.index({ station: 1 });

module.exports = mongoose.model("UserStationFollow", userStationFollowSchema);
