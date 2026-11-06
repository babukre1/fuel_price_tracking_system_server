const admin = require("firebase-admin");
const Supplier = require("../supplier/model");
const User = require("../User/model");
const UserStationFollow = require("../User/stationFollow.model");
const Notification = require("../notification/model");

// ── FCM initialisation ────────────────────────────────────────────────────────
// Reads the service-account JSON directly from the FIREBASE_SERVICE_ACCOUNT
// env var (a single-line JSON string, e.g. set in .env).
// If the var is unset or invalid, the module is still importable but
// sendPushToSupplier becomes a no-op — server boots and approvals work normally.

let messaging = null;

const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
if (rawServiceAccount) {
  try {
    const serviceAccount = JSON.parse(rawServiceAccount);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    messaging = admin.messaging();
    console.log("FCM initialised successfully.");
  } catch (err) {
    console.error("FCM init failed — pushes disabled:", err.message);
  }
} else {
  console.warn(
    "FCM not configured — FIREBASE_SERVICE_ACCOUNT is not set. Pushes disabled.",
  );
}

// ── Stale-token error codes from the FCM v1 API ───────────────────────────────
const STALE_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

const normalizeData = (data) =>
  Object.fromEntries(
    Object.entries(data ?? {}).map(([key, value]) => [key, String(value)]),
  );

// ── sendPushToSupplier ────────────────────────────────────────────────────────
// Looks up the supplier's registered device tokens and sends a multicast push.
// Stale tokens (uninstalled app, revoked registration) are pruned automatically.
// Never throws — a push failure must never block the calling approval action.
//
// @param {string|ObjectId} supplierId
// @param {{ title: string, body: string, data?: Record<string, string> }} payload
async function sendPushToSupplier(supplierId, { title, body, data }) {
  // ── Persist to notification history ───────────────────────────────────────
  // This runs regardless of FCM configuration so the bell history is always
  // populated even when push delivery is disabled or fails.
  try {
    await Notification.create({
      recipient: supplierId,
      recipientModel: "Supplier",
      title,
      body,
      data: data ?? {},
    });
  } catch (err) {
    console.error("Notification: failed to persist record:", err.message);
    // Fall through — attempt FCM delivery even if the DB write failed.
  }

  // ── FCM delivery ───────────────────────────────────────────────────────────
  if (!messaging) return;

  let supplier;
  try {
    supplier = await Supplier.findById(supplierId).select("deviceTokens");
  } catch (err) {
    console.error("FCM: failed to load supplier tokens:", err.message);
    return;
  }

  const tokens = supplier?.deviceTokens ?? [];
  if (tokens.length === 0) return;

  let result;
  try {
    result = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
      ...(data ? { data: normalizeData(data) } : {}),
    });
  } catch (err) {
    console.error("FCM: sendEachForMulticast failed:", err.message);
    return;
  }

  // Collect tokens that are definitively invalid so we can prune them.
  const staleTokens = [];
  result.responses.forEach((resp, i) => {
    if (!resp.success && STALE_TOKEN_CODES.has(resp.error?.code)) {
      staleTokens.push(tokens[i]);
    }
  });

  if (staleTokens.length > 0) {
    try {
      await Supplier.updateOne(
        { _id: supplierId },
        { $pull: { deviceTokens: { $in: staleTokens } } },
      );
    } catch (err) {
      console.error("FCM: failed to remove stale tokens:", err.message);
    }
  }
}

async function sendPushToUser(userId, { title, body, data }) {
  try {
    await Notification.create({
      recipient: userId,
      recipientModel: "User",
      title,
      body,
      data: data ?? {},
    });
  } catch (err) {
    console.error("User notification: failed to persist record:", err.message);
  }

  if (!messaging) return;

  let user;
  try {
    user = await User.findById(userId).select("deviceTokens");
  } catch (err) {
    console.error("FCM: failed to load user tokens:", err.message);
    return;
  }

  const tokens = user?.deviceTokens ?? [];
  if (tokens.length === 0) return;

  let result;
  try {
    result = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
      ...(data ? { data: normalizeData(data) } : {}),
    });
  } catch (err) {
    console.error("FCM: sendEachForMulticast failed:", err.message);
    return;
  }

  const staleTokens = [];
  result.responses.forEach((resp, i) => {
    if (!resp.success && STALE_TOKEN_CODES.has(resp.error?.code)) {
      staleTokens.push(tokens[i]);
    }
  });

  if (staleTokens.length > 0) {
    try {
      await User.updateOne(
        { _id: userId },
        { $pull: { deviceTokens: { $in: staleTokens } } },
      );
    } catch (err) {
      console.error("FCM: failed to remove stale user tokens:", err.message);
    }
  }
}

async function sendPushToStationFollowers(stationId, payload) {
  let follows;
  try {
    follows = await UserStationFollow.find({ station: stationId })
      .select("user")
      .lean();
  } catch (err) {
    console.error("FCM: failed to load station followers:", err.message);
    return;
  }

  await Promise.all(
    follows.map((follow) =>
      sendPushToUser(follow.user, {
        ...payload,
        data: {
          ...(payload.data ?? {}),
          stationId,
          type: payload.data?.type ?? "station_update",
        },
      }),
    ),
  );
}

module.exports = {
  sendPushToSupplier,
  sendPushToUser,
  sendPushToStationFollowers,
};
