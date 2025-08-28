import { Client, LocalAuth } from "whatsapp-web.js";
import fs from "fs";
import qrcode from "qrcode-terminal";
import { spamKeywords } from "./spamKeywords.js";

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true }
});

const WHITELIST_FILE = "whitelist.json";

// Загружаем whitelist
function loadWhitelist() {
  if (!fs.existsSync(WHITELIST_FILE)) return {};
  return JSON.parse(fs.readFileSync(WHITELIST_FILE, "utf-8"));
}

// Сохраняем whitelist
function saveWhitelist(data) {
  fs.writeFileSync(WHITELIST_FILE, JSON.stringify(data, null, 2), "utf-8");
}

// Проверка подписки
function isWhitelisted(number) {
  const whitelist = loadWhitelist();
  if (whitelist[number]) {
    const today = new Date();
    const expiry = new Date(whitelist[number]);
    return expiry >= today;
  }
  return false;
}

// Проверка на спам
function isSpam(text) {
  const msg = text.toLowerCase();
  return spamKeywords.some(keyword => msg.includes(keyword));
}

client.on("qr", qr => {
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("✅ Бот запущен!");
});

client.on("message", async msg => {
  const chat = await msg.getChat();
  const sender = msg.from;

  // === Группы ===
  if (chat.isGroup) {
    if (!isWhitelisted(sender) && isSpam(msg.body)) {
      await msg.delete(true);
      chat.sendMessage(`🚫 Сообщение от ${sender} удалено (реклама).`);
    }
  }

  // === Личные команды ===
  else {
    if (msg.body.startsWith("/addsub")) {
      const parts = msg.body.split(" ");
      if (parts.length === 3) {
        const phone = parts[1];
        const date = parts[2];
        const whitelist = loadWhitelist();
        whitelist[phone] = date;
        saveWhitelist(whitelist);
        msg.reply(`✅ Подписка добавлена: ${phone} до ${date}`);
      } else {
        msg.reply("⚠️ Используй: /addsub +77011234567 2025-09-30");
      }
    }

    else if (msg.body.startsWith("/showsubs")) {
      const whitelist = loadWhitelist();
      if (Object.keys(whitelist).length === 0) {
        msg.reply("📭 Нет активных подписчиков.");
      } else {
        let list = "📋 Подписчики:\n";
        for (const [num, date] of Object.entries(whitelist)) {
          list += `${num} → до ${date}\n`;
        }
        msg.reply(list);
      }
    }
  }
});

client.initialize();
