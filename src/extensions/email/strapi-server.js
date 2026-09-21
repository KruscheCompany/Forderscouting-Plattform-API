const ADMIN_ROLE_TYPE = "admin";
const DEV_SAFE_EMAIL = "alameen.azad+dev@kruschecompany.com";
const RECIPIENT_FIELDS = ["to", "cc", "bcc"];
const NO_OP_RESPONSE = { accepted: [], rejected: [] };

const toAddressArray = (value) => {
  if (!value) return [];
  return Array.isArray(value)
    ? value
    : String(value)
        .split(",")
        .map((address) => address.trim())
        .filter(Boolean);
};

const withField = (options, field, addresses) => {
  if (options[field] === undefined) return options;
  const value = Array.isArray(options[field]) ? addresses : addresses.join(",");
  return { ...options, [field]: value || undefined };
};

const hasAnyRecipient = (options) =>
  RECIPIENT_FIELDS.some((field) => toAddressArray(options[field]).length > 0);

const restrictToAdmins = async (options) => {
  const allAddresses = RECIPIENT_FIELDS.flatMap((field) => toAddressArray(options[field]));
  if (!allAddresses.length) return options;

  const users = await strapi.entityService.findMany("plugin::users-permissions.user", {
    filters: { email: { $in: allAddresses } },
    fields: ["email"],
    populate: { role: { fields: ["type"] } },
  });
  const adminEmails = new Set(
    users.filter((user) => user.role?.type === ADMIN_ROLE_TYPE).map((user) => user.email)
  );

  return RECIPIENT_FIELDS.reduce((acc, field) => {
    const filtered = toAddressArray(options[field]).filter((address) => adminEmails.has(address));
    return withField(acc, field, filtered);
  }, options);
};

module.exports = (plugin) => {
  const originalSend = plugin.services.email.send;

  plugin.services.email.send = async (options) => {
    const appEnv = (process.env.APP_ENV || "").toLowerCase();

    if (appEnv === "prod") {
      return originalSend.call(plugin.services.email, options);
    }

    if (appEnv === "stage") {
      const gated = await restrictToAdmins(options);
      if (!hasAnyRecipient(gated)) {
        strapi.log.info(
          `[email] staging: skipped "${options.subject || "(no subject)"}" — no admin recipients among original list`
        );
        return NO_OP_RESPONSE;
      }
      return originalSend.call(plugin.services.email, gated);
    }

    // dev / local / unset / unrecognized APP_ENV -> fail closed, never mail real users
    strapi.log.info(
      `[email] ${appEnv || "unset APP_ENV"}: redirecting "${options.subject || "(no subject)"}" to ${DEV_SAFE_EMAIL}`
    );
    return originalSend.call(plugin.services.email, {
      ...options,
      to: DEV_SAFE_EMAIL,
      cc: undefined,
      bcc: undefined,
    });
  };

  return plugin;
};
