const { emitToAll } = require("../../../../utils/socket");

module.exports = {
  async afterCreate(event) {
    const { result } = event;

    await strapi.db.query("api::system-ribbon.system-ribbon").updateMany({
      where: { id: { $ne: result.id } },
      data: { active: false },
    });

    emitToAll("systemRibbon", {
      id: result.id,
      message: result.message,
      linkLabel: result.linkLabel,
      linkUrl: result.linkUrl,
    });
  },
  async afterUpdate(event) {
    const { result } = event;
    if (result.active === false) {
      emitToAll("systemRibbon", null);
    }
  },
};
