"use strict";

const path = require("path");

const de = require(path.join(__dirname, "..", "..", "de.json"));
const en = require(path.join(__dirname, "..", "..", "en.json"));

function resolveLocale(ctx) {
  const header = (ctx.request.headers["accept-language"] || "").toLowerCase();
  return header.startsWith("en") ? "en" : "de";
}

function interpolate(message, params) {
  if (!params) return message;
  return message.replace(/{(\w+)}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(params, key) ? params[key] : match
  );
}

function t(ctx, message, params) {
  const dict = resolveLocale(ctx) === "en" ? en : de;
  const translated = typeof dict[message] === "string" ? dict[message] : message;
  return interpolate(translated, params);
}

module.exports = { t };
