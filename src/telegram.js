import { Bot, InlineKeyboard, Keyboard } from "grammy";
import { RT_CATALOG, RT_CATEGORIES, findMonument, formatMonument } from "./rt-catalog.js";
import { WEB_APP_VERSION } from "./web-app.js";

const HOME_TEXT = "Rust Monitor — управление подключённым Rust+ сервером.";
const notificationKeys = [
  ["teamStatus", "👥 Тимейты"],
  ["playerStatus", "💀 Смерть игрока"],
  ["raid", "🚨 Smart Alarm"],
  ["storage", "📦 Хранилище"],
  ["sunrise", "🌅 Рассвет"],
  ["sunset", "🌇 Закат"],
  ["rt", "🗺 РТ и респавны"],
  ["shop", "🛒 Новые магазины"]
];

function mainKeyboard(config) {
  const keyboard = new Keyboard()
    .text("🔄 Обновить").row()
    .text("🖥 Сервер").text("👥 Тимейты").row()
    .text("💬 Чат").text("🕒 Время").row()
    .text("⚙ Настройки").text("🗺 РТ")
    .resized()
    .persistent();
  if (config.webAppUrl) {
    const separator = config.webAppUrl.includes("?") ? "&" : "?";
    const versionedUrl = `${config.webAppUrl}${separator}v=${encodeURIComponent(WEB_APP_VERSION)}`;
    keyboard.row().webApp("🗺 Открыть live-карту", versionedUrl);
  }
  return keyboard;
}

function chatKeyboard() {
  return new Keyboard().text("⬅️ Назад к серверу").resized().persistent();
}

function settingsKeyboard(profile) {
  const result = new InlineKeyboard()
    .text(profile.get("enabled") ? "🔔 Уведомления: вкл" : "🔕 Уведомления: выкл", "toggle_enabled")
    .row();
  for (const [key, label] of notificationKeys) {
    result.text(`${profile.notificationEnabled(key) ? "🔔" : "🔕"} ${label}`, `notify:${key}`).row();
  }
  return result
    .text(`Префикс: ${profile.get("rustCommandPrefix") || "/"}`, "prefix:list")
    .row()
    .text("⬅️ Назад", "home");
}

function rtMenuKeyboard() {
  return new InlineKeyboard()
    .text(RT_CATEGORIES.monument, "rt:category:monument").row()
    .text(RT_CATEGORIES.fuel, "rt:category:fuel").row()
    .text(RT_CATEGORIES.warehouse, "rt:category:warehouse").row()
    .text(RT_CATEGORIES.shop, "rt:category:shop").row()
    .text("⭐ Избранные РТ", "rt:favorites").row()
    .text("⬅️ Назад", "home");
}

function rtCategoryKeyboard(category, profile) {
  const favorites = new Set(profile.get("favoriteMonuments") || []);
  const result = new InlineKeyboard();
  for (const item of RT_CATALOG.filter((entry) => entry.category === category)) {
    result.text(`${favorites.has(item.slug) ? "⭐" : "☆"} ${item.name}`, `rt:item:${item.slug}`).row();
  }
  return result
    .text("⬅️ К категориям РТ", "rt:list")
    .row()
    .text("⬅️ Назад", "home");
}

function rtFavoritesKeyboard(profile) {
  const favorites = new Set(profile.get("favoriteMonuments") || []);
  const result = new InlineKeyboard();
  for (const item of RT_CATALOG.filter((entry) => favorites.has(entry.slug))) {
    result.text(`⭐ ${item.name}`, `rt:item:${item.slug}`).row();
  }
  return result.text("⬅️ К категориям РТ", "rt:list").row().text("⬅️ Назад", "home");
}

function rtDetailKeyboard(profile, item) {
  const favorites = new Set(profile.get("favoriteMonuments") || []);
  return new InlineKeyboard()
    .text(favorites.has(item.slug) ? "☆ Убрать из избранного" : "⭐ В избранное", `rt:favorite:${item.slug}`)
    .row()
    .text("⏱ Лут собран — запустить таймер", `rt:timer:${item.slug}`)
    .row()
    .text(`⬅️ ${RT_CATEGORIES[item.category] || "К РТ"}`, `rt:category:${item.category}`);
}

const statusLine = (profile) =>
  `Уведомления: ${profile.get("enabled") ? "включены" : "выключены"}\n` +
  `Префикс команд Rust: ${profile.get("rustCommandPrefix") || "/"}`;

async function replyLong(ctx, text, options = {}) {
  const chunks = String(text).match(/[\s\S]{1,3800}/g) || [String(text)];
  for (const chunk of chunks) await ctx.reply(chunk, options);
}

async function edit(ctx, text, options = {}) {
  try {
    await ctx.editMessageText(text, options);
  } catch (error) {
    if (!String(error.message || "").toLowerCase().includes("not modified")) throw error;
  }
}

async function deleteSecretMessage(ctx) {
  try {
    await ctx.deleteMessage();
  } catch {
    // Telegram may refuse deletion in a private chat or without admin rights.
  }
}

export function createTelegramBot(config, store, manager, handlers) {
  const bot = new Bot(config.botToken);

  bot.use(async (ctx, next) => {
    if (ctx.from) ctx.userStore = store.profile(ctx.from.id);
    await next();
  });

  const userId = (ctx) => ctx.from.id;
  const profile = (ctx) => ctx.userStore;

  const renderHome = async (ctx) => {
    profile(ctx).set("chatMode", false);
    const accountHint = manager.hasAccount(userId(ctx))
      ? ""
      : "\n\nСначала пришли всю строку `/credentials add ...` из Credential Application.";
    const text = `${HOME_TEXT}\n\n${statusLine(profile(ctx))}${accountHint}`;
    if (ctx.callbackQuery) {
      await edit(ctx, text);
      return ctx.reply("Меню управления:", { reply_markup: mainKeyboard(config) });
    }
    return ctx.reply(text, { reply_markup: mainKeyboard(config) });
  };

  const showChat = async (ctx) => {
    profile(ctx).set("chatMode", true);
    if (ctx.callbackQuery) await ctx.deleteMessage().catch(() => {});
    return ctx.reply(
      "💬 Чат с тимейтами открыт.\n\nПиши сюда обычными сообщениями — они уйдут в Rust+ team chat. Сообщения тимейтов будут приходить сюда.\n\nКоманды Telegram начинаются с / и в чат Rust не отправляются.",
      { reply_markup: chatKeyboard() }
    );
  };

  const showServer = async (ctx) =>
    ctx.reply(await handlers.server(userId(ctx)), { reply_markup: mainKeyboard(config) });
  const showTeam = async (ctx) =>
    ctx.reply(await handlers.team(userId(ctx)), { reply_markup: mainKeyboard(config) });
  const showTime = async (ctx) =>
    ctx.reply(await handlers.time(userId(ctx)), { reply_markup: mainKeyboard(config) });
  const showSettings = async (ctx) =>
    ctx.reply(await handlers.settings(userId(ctx)), { reply_markup: settingsKeyboard(profile(ctx)) });
  const showRt = async (ctx) =>
    ctx.reply(await handlers.rtList(userId(ctx)), { reply_markup: rtMenuKeyboard() });

  bot.command("start", renderHome);

  bot.command("help", async (ctx) => replyLong(ctx, [
    "Подключение:",
    "1. Установи rustPlusPlus-Credential Application и войди через Steam.",
    "2. Скопируй всю строку `/credentials add ...`.",
    "3. Пришли её этому боту одним сообщением.",
    "4. В игре нажми Pair with Server — бот сам получит сервер и player token.",
    "",
    "Внизу есть клавиатура: Обновить, Сервер, Тимейты, Чат, Время, Настройки и РТ.",
    "В team chat работают команды с выбранным префиксом:",
    "<префикс>help, time, team, markers, server, rt, loot, raidtest, дерево хп 120."
  ].join("\n"), { reply_markup: mainKeyboard(config) }));

  bot.hears("🔄 Обновить", renderHome);
  bot.hears("🖥 Сервер", showServer);
  bot.hears("👥 Тимейты", showTeam);
  bot.hears("💬 Чат", showChat);
  bot.hears("🕒 Время", showTime);
  bot.hears("⚙ Настройки", showSettings);
  bot.hears("🗺 РТ", showRt);
  bot.hears("⬅️ Назад к серверу", renderHome);

  bot.command("credentials", async (ctx) => {
    const text = ctx.message?.text?.trim() || "";
    if (/^\/credentials(?:@\w+)?\s+add\b/i.test(text)) {
      try {
        await handlers.registerCredentials(userId(ctx), text);
        await deleteSecretMessage(ctx);
        await ctx.reply("✅ Credential Info принят. Теперь открой Rust и нажми Pair with Server.", {
          reply_markup: mainKeyboard(config)
        });
      } catch (error) {
        await ctx.reply(`❌ ${error.message}`);
      }
      return;
    }
    await ctx.reply("Пришли следующим сообщением всю строку `/credentials add ...` из Credential Application.");
  });

  bot.on("message:text", async (ctx, next) => {
    const text = ctx.message.text.trim();
    if (/^\/credentials(?:@\w+)?\s+add\b/i.test(text)) {
      try {
        await handlers.registerCredentials(userId(ctx), text);
        await deleteSecretMessage(ctx);
        await ctx.reply("✅ Credential Info принят. Теперь нажми Pair with Server в Rust.");
      } catch (error) {
        await ctx.reply(`❌ ${error.message}`);
      }
      return;
    }

    if (profile(ctx).get("chatMode") && !text.startsWith("/")) {
      try {
        await handlers.say(userId(ctx), text);
        await ctx.reply("↗️ Отправлено тимейтам.");
      } catch (error) {
        await ctx.reply(`❌ ${error.message}`);
      }
      return;
    }
    return next();
  });

  bot.command("status", async (ctx) => replyLong(ctx, `${statusLine(profile(ctx))}\n\n${await handlers.status(userId(ctx))}`));
  bot.command("server", async (ctx) => replyLong(ctx, await handlers.server(userId(ctx))));
  bot.command("team", async (ctx) => replyLong(ctx, await handlers.team(userId(ctx))));
  bot.command("time", async (ctx) => replyLong(ctx, await handlers.time(userId(ctx))));
  bot.command("markers", async (ctx) => replyLong(ctx, await handlers.markers(userId(ctx))));
  bot.command("decay", async (ctx) => replyLong(ctx, await handlers.decay(userId(ctx), ctx.match)));
  bot.command("raidtest", async (ctx) => {
    await ctx.reply(await handlers.raidTest(userId(ctx)), { reply_markup: { inline_keyboard: [[
      { text: "✅ Проснулся — отключить тревогу", callback_data: "raid:ack" }
    ]] } });
  });
  bot.command("loot", async (ctx) => {
    const item = findMonument(ctx.match?.trim() || profile(ctx).get("favoriteMonument"));
    if (!item) return ctx.reply("РТ не найдена. Пример: /loot водоочистная");
    handlers.markRtLoot(userId(ctx), item.slug);
    await ctx.reply(`✅ Сбор лута зафиксирован: ${item.name}\nТаймер запущен примерно на ${item.respawnMinutes} мин.`);
  });
  bot.command("rt", async (ctx) => {
    const query = ctx.match?.trim();
    if (!query) return showRt(ctx);
    const item = findMonument(query);
    await replyLong(ctx, item ? formatMonument(item) : "РТ не найдена. Открой /rt без аргументов.");
  });
  bot.command("favorite", async (ctx) => {
    const item = findMonument(ctx.match?.trim());
    if (!item) return ctx.reply("Не нашёл РТ. Открой меню 🗺 РТ.");
    const enabled = handlers.toggleFavorite(userId(ctx), item.slug);
    await ctx.reply(`${enabled ? "⭐ Добавлена в" : "☆ Убрана из"} избранное: ${item.name}`);
  });
  bot.command("say", async (ctx) => {
    const text = ctx.match?.trim();
    if (!text) return ctx.reply("Пример: /say всем на базу");
    await handlers.say(userId(ctx), text);
    await ctx.reply("✅ Отправлено в Rust+ team chat.");
  });
  bot.command("enable", async (ctx) => {
    profile(ctx).set("enabled", true);
    await ctx.reply("✅ Уведомления включены.", { reply_markup: mainKeyboard(config) });
  });
  bot.command("disable", async (ctx) => {
    profile(ctx).set("enabled", false);
    await ctx.reply("🔕 Уведомления выключены. Чат и команды остаются доступны.", { reply_markup: mainKeyboard(config) });
  });
  bot.command("forget", async (ctx) => {
    await handlers.forget(userId(ctx));
    await ctx.reply("🗑 Rust+ привязка удалена. Для нового подключения пришли Credential Info.");
  });

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    await ctx.answerCallbackQuery();

    if (data === "home" || data === "refresh") return renderHome(ctx);
    if (data === "raid:ack") {
      handlers.acknowledgeRaid(userId(ctx));
      return edit(ctx, "✅ Тревога рейда отключена. Надеюсь, это был тест или ты уже проснулся.", {
        reply_markup: new InlineKeyboard().text("⬅️ Назад", "home")
      });
    }
    if (data === "server") return edit(ctx, await handlers.server(userId(ctx)), {
      reply_markup: new InlineKeyboard().text("⬅️ Назад", "home")
    });
    if (data === "team") return edit(ctx, await handlers.team(userId(ctx)), {
      reply_markup: new InlineKeyboard().text("⬅️ Назад", "home")
    });
    if (data === "chat_mode") return showChat(ctx);
    if (data === "settings") return edit(ctx, await handlers.settings(userId(ctx)), {
      reply_markup: settingsKeyboard(profile(ctx))
    });
    if (data === "toggle_enabled") {
      handlers.toggleEnabled(userId(ctx));
      return edit(ctx, await handlers.settings(userId(ctx)), { reply_markup: settingsKeyboard(profile(ctx)) });
    }
    if (data.startsWith("notify:")) {
      handlers.toggleNotification(userId(ctx), data.slice("notify:".length));
      return edit(ctx, await handlers.settings(userId(ctx)), { reply_markup: settingsKeyboard(profile(ctx)) });
    }
    if (data === "prefix:list") {
      return edit(ctx, "Выбери префикс команд, которые бот слушает в Rust team chat:", {
        reply_markup: new InlineKeyboard()
          .text("/", "prefix:/").text(".", "prefix:.").text("!", "prefix:!")
          .row().text("@", "prefix:@").text("$", "prefix:$")
          .row().text("⬅️ К настройкам", "settings")
      });
    }
    if (data.startsWith("prefix:")) {
      handlers.setPrefix(userId(ctx), data.slice("prefix:".length));
      return edit(ctx, await handlers.settings(userId(ctx)), { reply_markup: settingsKeyboard(profile(ctx)) });
    }
    if (data === "time") return edit(ctx, await handlers.time(userId(ctx)), {
      reply_markup: new InlineKeyboard().text("⬅️ Назад", "home")
    });
    if (data === "rt:list") return edit(ctx, await handlers.rtList(userId(ctx)), {
      reply_markup: rtMenuKeyboard()
    });
    if (data.startsWith("rt:category:")) {
      const category = data.slice("rt:category:".length);
      return edit(ctx, await handlers.rtCategory(userId(ctx), category), {
        reply_markup: rtCategoryKeyboard(category, profile(ctx))
      });
    }
    if (data === "rt:favorites") {
      const favorites = new Set(profile(ctx).get("favoriteMonuments") || []);
      const names = RT_CATALOG.filter((item) => favorites.has(item.slug))
        .map((item) => `⭐ ${item.name}`);
      return edit(ctx, names.length ? `⭐ Избранные РТ:\n\n${names.join("\n")}` : "⭐ Избранных РТ пока нет.", {
        reply_markup: rtFavoritesKeyboard(profile(ctx))
      });
    }
    if (data.startsWith("rt:item:")) {
      const item = findMonument(data.slice("rt:item:".length));
      if (!item) return edit(ctx, "РТ не найдена.", { reply_markup: rtMenuKeyboard() });
      return edit(ctx, formatMonument(item), { reply_markup: rtDetailKeyboard(profile(ctx), item) });
    }
    if (data.startsWith("rt:favorite:")) {
      const slug = data.slice("rt:favorite:".length);
      const item = findMonument(slug);
      if (!item) return edit(ctx, "РТ не найдена.", { reply_markup: rtMenuKeyboard() });
      handlers.toggleFavorite(userId(ctx), slug);
      return edit(ctx, formatMonument(item), { reply_markup: rtDetailKeyboard(profile(ctx), item) });
    }
    if (data.startsWith("rt:timer:")) {
      const item = handlers.markRtLoot(userId(ctx), data.slice("rt:timer:".length));
      return edit(ctx, `⏱ Таймер запущен: ${item.name}\nЛут будет доступен примерно через ${item.respawnMinutes} мин.`, {
        reply_markup: rtDetailKeyboard(profile(ctx), item)
      });
    }
    return renderHome(ctx);
  });

  bot.catch((error) => console.error("Telegram error:", error.error || error));
  return bot;
}