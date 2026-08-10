"use strict";

const { Server } = require("socket.io");

let io = null;

function roomForUser(userId) {
  return `user:${userId}`;
}

function initSocket(strapi) {
  io = new Server(strapi.server.httpServer, {
    cors: { origin: "*" },
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return next(new Error("No token provided."));
    try {
      const payload = await strapi.plugins["users-permissions"].services.jwt.verify(
        token
      );
      socket.userId = payload.id;
      next();
    } catch (err) {
      next(new Error("Invalid token."));
    }
  });

  io.on("connection", (socket) => {
    socket.join(roomForUser(socket.userId));
  });

  strapi.io = io;
  return io;
}

function emitToUser(userId, event, payload) {
  if (!io || userId == null) return;
  io.to(roomForUser(userId)).emit(event, payload);
}

function emitToAll(event, payload) {
  if (!io) return;
  io.emit(event, payload);
}

module.exports = { initSocket, emitToUser, emitToAll };
