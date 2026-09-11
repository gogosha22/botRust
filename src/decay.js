const MATERIALS = [
  {
    key: "twig",
    name: "Солома/ветки",
    maxHp: 10,
    fullDecayMinutes: 10,
    aliases: ["twig", "twigs", "ветка", "ветки", "солома", "твинги"]
  },
  {
    key: "wood",
    name: "Дерево",
    maxHp: 250,
    fullDecayMinutes: 180,
    aliases: ["wood", "дерево", "деревянная", "деревянные"]
  },
  {
    key: "stone",
    name: "Камень",
    maxHp: 500,
    fullDecayMinutes: 300,
    aliases: ["stone", "камень", "каменная", "каменные"]
  },
  {
    key: "metal",
    name: "Металл",
    maxHp: 1000,
    fullDecayMinutes: 480,
    aliases: ["metal", "метал", "металл", "металлическая", "металлические"]
  },
  {
    key: "hqm",
    name: "МВК/Armored",
    maxHp: 2000,
    fullDecayMinutes: 720,
    aliases: ["hqm", "high quality", "armored", "armor", "мвк", "вмк", "броня", "бронированная"]
  }
];

const normalize = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .replaceAll("ё", "е");

export function findDecayMaterial(query) {
  const normalized = normalize(query);
  if (!normalized) return null;
  return MATERIALS.find((material) =>
    material.key === normalized || material.aliases.includes(normalized)
  ) || MATERIALS.find((material) =>
    material.aliases.some((alias) => alias.includes(normalized) || normalized.includes(alias))
  ) || null;
}

export function parseDecayCommand(parts) {
  const values = [...parts];
  const hpIndex = values.findIndex((value) => /^(hp|хп|health|здоровье)$/i.test(value));
  if (hpIndex >= 0) values.splice(hpIndex, 1);

  const hpIndexAfterMaterial = values.findIndex((value) => /^\d+(?:[.,]\d+)?$/.test(value));
  const hp = hpIndexAfterMaterial >= 0
    ? Number(values[hpIndexAfterMaterial].replace(",", "."))
    : NaN;
  if (!Number.isFinite(hp) || hp < 0) return null;

  const material = findDecayMaterial(values.filter((_, index) => index !== hpIndexAfterMaterial).join(" "));
  return material ? { material, hp } : null;
}

export function decayEstimate(material, hp, multiplier = 1) {
  const safeMultiplier = Number.isFinite(Number(multiplier)) && Number(multiplier) > 0
    ? Number(multiplier)
    : 1;
  const remaining = Math.max(0, Number(hp));
  const minutes = remaining / material.maxHp * material.fullDecayMinutes / safeMultiplier;
  return {
    minutes,
    hours: Math.floor(minutes / 60),
    remainderMinutes: Math.ceil(minutes % 60)
  };
}

export function formatDuration(minutes) {
  const value = Math.max(0, Math.ceil(Number(minutes) || 0));
  if (value < 1) return "менее минуты";
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  if (!hours) return `${mins} мин.`;
  if (!mins) return `${hours} ч.`;
  return `${hours} ч. ${mins} мин.`;
}

export function decayMaterials() {
  return MATERIALS.map(({ aliases, ...material }) => ({ ...material }));
}