import fs from "fs";
import path from "path";
import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;

// ==== Конфиг ====
const DATA_DIR = process.env.DATA_DIR || "./data";
const AUTH_DIR = process.env.AUTH_DIR || path.join(DATA_DIR, "session");
const WHITELIST_FILE = process.env.WHITELIST_FILE || path.join(DATA_DIR, "whitelist.json");

// ==== Создаём папки если нет ====
[DATA_DIR, AUTH_DIR].forEach((dir) => {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log("📂 Создана папка:", dir);
    }
  } catch (err) {
    console.error("❌ Не удалось создать папку:", dir, err);
  }
});

// ==== Ключевые слова ====
const keywords = {
  привет: "Привет! 👋 Я бот на Render.",
  помощь: "Вот список команд: привет, помощь, тест",
  тест: "✅ Бот работает!",
};

// ==== Чтение whitelist ====
let whitelist = [];
if (fs.existsSync(WHITELIST_FILE)) {
  try {
    whitelist = JSON.parse(fs.readFileSync(WHITELIST_FILE, "utf-8"));
    console.log("✅ Загружен whitelist:", whitelist);
  } catch (err) {
    console.error("❌ Ошибка чтения whitelist.json", err);
  }
} else {
  console.log("⚠️ Файл whitelist.json не найден, все пользователи будут в блоке.");
}

// ==== WhatsApp клиент ====
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: AUTH_DIR,
  }),
  puppeteer: {
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

// ==== События ====
client.on("qr", (qr) => {
  console.log("📱 Отсканируй QR-код для входа:");
  console.log(qr);
});

client.on("ready", () => {
  console.log("✅ Бот запущен и готов к работе!");
});

client.on("message", async (message) => {
  console.log(`📩 Сообщение от ${message.from}: ${message.body}`);

  if (whitelist.length > 0 && !whitelist.includes(message.from)) {
    console.log("⛔ Пользователь не в whitelist, игнорируем.");
    return;
  }

  const text = message.body.toLowerCase();
  for (const key in keywords) {
    if (text.includes(key)) {
      await message.reply(keywords[key]);
      console.log(`💬 Ответил: ${keywords[key]}`);
      return;
    }
  }
});

// ==== Запуск ====
client.initialize();
