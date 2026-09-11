export const RT_CATEGORIES = {
  monument: "🏛 РТ",
  fuel: "⛽ Заправки",
  warehouse: "📦 Склады",
  shop: "🛒 Магазины"
};

const base = (slug, name, aliases, category, extra = {}) => ({
  slug,
  name,
  aliases,
  category,
  respawnMinutes: 30,
  loot: ["ящики и обычный лут"],
  respawn: "зависит от seed, wipe и настроек сервера",
  risk: "Средний",
  map: "Квадрат определяется по marker-координатам текущей карты.",
  notes: "Точное содержимое и время зависят от сервера.",
  ...extra
});

export const RT_CATALOG = [
  base("oil-rig", "Нефтяная вышка (Deep Sea Oil Rig)", ["oil", "oil rig", "нефтевышка", "deep sea oil rig", "rig"], "monument", {
    respawnMinutes: 60, dynamic: true, loot: ["Elite Crate", "Locked Crate", "военные ящики", "лут учёных"], risk: "Высокий"
  }),
  base("large-oil-rig", "Большая нефтяная вышка", ["large rig", "big oil", "large oil rig", "большая нефтевышка"], "monument", {
    respawnMinutes: 60, dynamic: true, loot: ["Elite Crate", "Locked Crate", "военные ящики", "лут учёных"], risk: "Очень высокий"
  }),
  base("cargo-ship", "Карго-корабль", ["cargo", "cargo ship", "карго", "корабль"], "monument", {
    respawnMinutes: 60, dynamic: true, loot: ["военные ящики", "Locked Crate", "лут учёных"], risk: "Высокий"
  }),
  base("launch-site", "Ракетная шахта (Launch Site)", ["launch", "launch site", "запуск", "ракетная"], "monument", {
    loot: ["Elite Crate", "военные ящики", "обычные ящики"], risk: "Высокий"
  }),
  base("military-tunnels", "Военные туннели", ["tunnels", "military tunnels", "туннели"], "monument", {
    loot: ["военные ящики", "лут учёных", "elite crates"], risk: "Высокий"
  }),
  base("underwater-labs", "Подводные лаборатории", ["labs", "underwater labs", "лабы", "подводные"], "monument", {
    loot: ["лут учёных", "военные ящики", "комнаты с картами"]
  }),
  base("excavator", "Гигантский экскаватор", ["excavator", "giant excavator", "карьер", "экскаватор"], "monument", {
    respawnMinutes: 30, dynamic: true, loot: ["дизельные ресурсы", "лут учёных"], risk: "Высокий"
  }),
  base("airfield", "Аэродром", ["airfield", "air", "аэродром"], "monument", {
    loot: ["военные ящики", "обычные ящики", "комната с картой"]
  }),
  base("train-yard", "Железнодорожный двор", ["train", "train yard", "yard", "жд"], "monument", {
    loot: ["военные ящики", "обычные ящики", "комната с картой"]
  }),
  base("water-treatment", "Водоочистная станция", ["water treatment", "water-treatment", "очистка", "водоочистная"], "monument"),
  base("power-plant", "Электростанция", ["power plant", "power-plant", "электростанция"], "monument"),
  base("sewer-branch", "Канализация", ["sewer", "sewer branch", "канализация"], "monument"),
  base("satellite-dish", "Спутниковая тарелка", ["satellite", "satellite dish", "тарелка"], "monument"),
  base("dome", "Купол", ["dome", "купол"], "monument"),
  base("harbor-1", "Гавань 1", ["harbor 1", "harbour 1", "гавань 1"], "monument"),
  base("harbor-2", "Гавань 2", ["harbor 2", "harbour 2", "гавань 2"], "monument"),
  base("lighthouse", "Маяк", ["lighthouse", "маяк"], "monument"),
  base("arctic-research-base", "Арктическая исследовательская база", ["arctic", "research base", "арктическая база"], "monument"),
  base("nuclear-missile-silo", "Ядерная ракетная шахта", ["missile silo", "nuclear silo", "silo", "ракетная шахта"], "monument", {
    risk: "Очень высокий"
  }),
  base("desert-military-base", "Пустынная военная база", ["desert military", "военная база", "пустынная база"], "monument", {
    risk: "Высокий"
  }),
  base("junkyard", "Свалка", ["junkyard", "свалка"], "monument"),

  base("oxums-gas-station", "Заправка Oxum's", ["oxums", "oxum", "oxum gas station", "заправка oxum"], "fuel", {
    loot: ["ящики", "топливо", "магазинные полки"]
  }),
  base("abandoned-gas-station", "Заброшенная заправка", ["abandoned gas", "gas station", "заправка", "абandoned"], "fuel", {
    loot: ["ящики", "топливо", "обычный лут"]
  }),
  base("mining-outpost", "Шахтёрский пост", ["mining outpost", "mining", "шахтёрский пост"], "fuel", {
    loot: ["топливо", "ресурсы", "обычные ящики"]
  }),

  base("warehouse-small", "Малый склад", ["small warehouse", "warehouse small", "малый склад"], "warehouse"),
  base("warehouse-large", "Большой склад", ["large warehouse", "warehouse large", "большой склад"], "warehouse"),
  base("industrial-warehouse", "Промышленный склад", ["industrial warehouse", "промышленный склад"], "warehouse"),
  base("logistics-depot", "Логистический склад", ["logistics", "depot", "логистический склад"], "warehouse"),

  base("outpost", "Аванпост", ["outpost", "авп", "аванпост"], "shop", {
    loot: ["магазины NPC", "верстак", "ресурсы", "оружие"]
  }),
  base("bandit-camp", "Лагерь бандитов", ["bandit", "bandit camp", "бандиты", "лагерь бандитов"], "shop", {
    loot: ["магазины NPC", "азартные игры", "ресурсы"]
  }),
  base("fishing-village", "Рыбацкая деревня", ["fishing village", "рыбацкая деревня", "рыбацкая"], "shop", {
    loot: ["магазины NPC", "лодки", "рыболовный лут"]
  }),
  base("ranch", "Ранчо", ["ranch", "ранчо"], "shop", {
    loot: ["магазины NPC", "лошади", "ресурсы"]
  }),
  base("supermarket", "Супермаркет", ["supermarket", "супермаркет", "магазин"], "shop", {
    loot: ["еда", "медицинский лут", "обычные ящики"]
  }),
  base("compound-shop", "Придорожный магазин", ["compound shop", "road shop", "придорожный магазин"], "shop", {
    loot: ["еда", "инструменты", "обычный лут"]
  })
];

export function findMonument(query) {
  const normalized = String(query || "").trim().toLowerCase();
  if (!normalized) return null;
  return RT_CATALOG.find((item) =>
    [item.slug, item.name, ...item.aliases].some((value) =>
      value.toLowerCase() === normalized
    )
  ) || RT_CATALOG.find((item) =>
    [item.slug, item.name, ...item.aliases].some((value) =>
      value.toLowerCase().includes(normalized)
    )
  ) || null;
}

export function markerSquare(marker, mapSize = null) {
  if (!marker) return null;
  const directGrid = marker.grid || marker.gridReference || marker.gridPosition;
  const gridValue = directGrid || (
    marker.column !== undefined || marker.row !== undefined
      ? marker
      : null
  );
  if (typeof gridValue === "string") return gridValue;
  if (gridValue && typeof gridValue === "object") {
    const column = gridValue.column || gridValue.letter;
    const row = gridValue.row || gridValue.number;
    if (column !== undefined && row !== undefined) return `${column}${row}`;
  }
  const position = marker.position || marker.coordinates || marker.location || marker;
  const x = Number(position.x ?? position.worldX);
  const y = Number(position.z ?? position.worldZ ?? position.y ?? position.worldY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (Math.abs(x) <= 1 && Math.abs(y) <= 1) {
    const column = String.fromCharCode(65 + Math.max(0, Math.min(25, Math.floor((x + 0.5) * 26))));
    const row = Math.max(1, Math.min(26, Math.floor((y + 0.5) * 26) + 1));
    return `${column}${row}`;
  }
  const size = Number(mapSize);
  if (Number.isFinite(size) && size > 100) {
    const column = String.fromCharCode(65 + Math.max(0, Math.min(25, Math.floor(((x + size / 2) / size) * 26))));
    const row = Math.max(1, Math.min(26, Math.floor(((y + size / 2) / size) * 26) + 1));
    return `${column}${row}`;
  }
  return `${Math.round(x)}, ${Math.round(y)}`;
}

export function formatMonument(item, marker = null) {
  const square = markerSquare(marker);
  return [
    `📍 ${item.name}`,
    `🎒 Лут: ${item.loot.join(", ")}`,
    `⏱ Respawn: примерно ${item.respawnMinutes} мин. (${item.respawn})`,
    `🧭 Квадрат: ${square || "определится по marker-координатам текущей карты"}`,
    `⚠️ Риск: ${item.risk}`,
    `📝 ${item.notes}`,
    "\nТочные позиции зависят от seed, wipe и плагинов сервера."
  ].join("\n");
}